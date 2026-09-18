<script lang="ts">
	import { untrack } from 'svelte';
	import FeCorreosField from '$lib/components/fe/FeCorreosField.svelte';
	import {
		FE_IMPUESTO_TARIFA_OPTIONS,
		FE_UNIDAD_MEDIDA_OPTIONS
	} from '$lib/fe/constants';
	import {
		FE_MONEDA_OPTIONS,
		computeFeComprobanteTotalsFromLedgerLines,
		feComprobanteAmountFromLedger,
		type FeMoneda
	} from '$lib/fe/fe-moneda';
	import {
		FE_MEDIO_PAGO_OPTIONS,
		reconcileMediosPagoToTotal,
		roundMoney,
		type FeMedioPagoItem
	} from '$lib/fe/medios-pago';
	import { computeInvoiceTaxTotals } from '$lib/lab/invoice-tax';
	import { invoiceLineAmounts } from '$lib/lab/invoice-line-amounts';
	import { formatColones, formatCurrency } from '$lib/lab/helpers';

	export type FeEmitReviewLine = {
		id: string;
		descripcion: string;
		cantidad: number;
		unidad: string;
		cabys: string;
		impuesto_tarifa: number;
		precio_unitario: number;
	};

	export type FeEmitReviewReceptor = {
		nombre: string;
		tipoId: string;
		identificacion: string;
		actividad: string;
		correo: string;
		direccion: string;
	};

	export type FeEmitReviewConfirm = {
		notas: string;
		extraCorreos: string;
		lineas: {
			id?: string;
			descripcion: string;
			cantidad: number;
			precio_unitario: number;
			fe_cabys: string;
			fe_unidad_medida: string;
			impuesto_tarifa: number;
		}[];
		medios: FeMedioPagoItem[];
		moneda: FeMoneda;
		tipoCambio: number;
	};

	type DraftLine = {
		key: string;
		id: string;
		descripcion: string;
		cantidad: string;
		unidad: string;
		cabys: string;
		impuesto_tarifa: number;
		precio_unitario: string;
	};

	type PagoRow = {
		tipo: string;
		label: string;
		active: boolean;
		monto: string;
	};

	interface Props {
		open: boolean;
		invoiceNumber: string;
		receptor: FeEmitReviewReceptor;
		lines: FeEmitReviewLine[];
		initialNotas?: string;
		initialExtraCorreos?: string;
		onCancel: () => void;
		onConfirm: (result: FeEmitReviewConfirm) => void;
	}

	let {
		open = $bindable(false),
		invoiceNumber,
		receptor,
		lines,
		initialNotas = '',
		initialExtraCorreos = '',
		onCancel,
		onConfirm
	}: Props = $props();

	let dialogEl = $state<HTMLDialogElement | null>(null);
	let notas = $state('');
	let extraCorreos = $state('');
	let drafts = $state<DraftLine[]>([]);
	let formError = $state('');
	let moneda = $state<FeMoneda>('USD');
	let tipoCambioInput = $state('');
	let tipoCambioStatus = $state<'idle' | 'loading' | 'ok' | 'error'>('idle');
	let tipoCambioHint = $state('');
	let pagoRows = $state<PagoRow[]>([]);
	let tipoCambioLoadId = 0;
	let pricesMoneda = $state<FeMoneda>('USD');

	const missingReceptor = $derived.by(() => {
		const gaps: string[] = [];
		if (!receptor.identificacion.trim() || receptor.identificacion === '—') {
			gaps.push('identificación');
		}
		if (!receptor.direccion.trim() || receptor.direccion === '—') {
			gaps.push('dirección fiscal');
		}
		return gaps;
	});

	function lineComputed(line: DraftLine) {
		const amounts = invoiceLineAmounts(Number(line.cantidad), Number(line.precio_unitario));
		const impuesto = roundMoney(amounts.subtotal * (Number(line.impuesto_tarifa) / 100));
		return {
			cantidadN: amounts.cantidad,
			precioN: amounts.precio_unitario,
			subtotal: amounts.subtotal,
			impuesto,
			line_total: roundMoney(amounts.subtotal + impuesto)
		};
	}

	function patchDraft(key: string, patch: Partial<DraftLine>) {
		const next = drafts.map((d) => (d.key === key ? { ...d, ...patch } : d));
		drafts = next;
		refreshPagos(totalFromDrafts(next));
	}

	function totalFromDrafts(source: DraftLine[]): number {
		return roundMoney(
			computeInvoiceTaxTotals(
				source.map((d) => {
					const computed = lineComputed(d);
					return { subtotal: computed.subtotal, impuesto_tarifa: Number(d.impuesto_tarifa) };
				})
			).total
		);
	}

	const computedDrafts = $derived.by(() =>
		drafts.map((d) => ({
			...d,
			cantidad: d.cantidad,
			precio_unitario: d.precio_unitario,
			impuesto_tarifa: d.impuesto_tarifa,
			...lineComputed(d)
		}))
	);

	const ledgerTotals = $derived(
		computeInvoiceTaxTotals(
			computedDrafts.map((d) => ({ subtotal: d.subtotal, impuesto_tarifa: d.impuesto_tarifa }))
		)
	);

	const tipoCambio = $derived.by(() => {
		const n = Number(String(tipoCambioInput).replace(',', '.'));
		return Number.isFinite(n) && n > 0 ? roundMoney(n) : 0;
	});

	function ledgerLinesFromDrafts() {
		return computedDrafts.map((d) => ({
			cantidad: d.cantidadN,
			precio_unitario: precioToLedgerUsd(d.precioN),
			impuesto_tarifa: d.impuesto_tarifa
		}));
	}

	const comprobanteTotals = $derived.by(() => {
		if (tipoCambio <= 0 || computedDrafts.length === 0) {
			return ledgerTotals;
		}
		return computeFeComprobanteTotalsFromLedgerLines(
			ledgerLinesFromDrafts(),
			moneda,
			tipoCambio
		);
	});

	const totalRounded = $derived(roundMoney(comprobanteTotals.total));

	function formatAmount(amount: number): string {
		return moneda === 'CRC' ? formatColones(amount) : formatCurrency(amount);
	}

	function convertUnitPrice(amount: number, from: FeMoneda, to: FeMoneda, tc: number): number {
		if (from === to) return roundMoney(amount);
		if (from === 'USD' && to === 'CRC') return feComprobanteAmountFromLedger(amount, 'CRC', tc);
		return roundMoney(amount / tc);
	}

	function convertDraftPrices(from: FeMoneda, to: FeMoneda, tc: number) {
		if (from === to || tc <= 0) return;
		drafts = drafts.map((d) => {
			const n = Number(String(d.precio_unitario).replace(',', '.'));
			if (!Number.isFinite(n)) return d;
			return { ...d, precio_unitario: String(convertUnitPrice(n, from, to, tc)) };
		});
		pricesMoneda = to;
	}

	function onMonedaChange(next: FeMoneda) {
		if (next === moneda) return;
		convertDraftPrices(pricesMoneda, next, tipoCambio);
		moneda = next;
		if (next === 'CRC' && tipoCambio <= 0 && tipoCambioStatus !== 'loading') {
			void loadTipoCambio();
		}
		refreshPagos();
	}

	function onTipoCambioInput(raw: string) {
		tipoCambioInput = raw;
		const n = Number(String(raw).replace(',', '.'));
		const tc = Number.isFinite(n) && n > 0 ? roundMoney(n) : 0;
		if (moneda === 'CRC' && pricesMoneda === 'USD' && tc > 0) {
			convertDraftPrices('USD', 'CRC', tc);
		}
		if (tc > 0) refreshPagos();
	}

	const assigned = $derived(
		roundMoney(
			pagoRows.reduce((sum, r) => {
				if (!r.active) return sum;
				const n = Number(r.monto.replace(',', '.'));
				return sum + (Number.isFinite(n) ? n : 0);
			}, 0)
		)
	);
	const remaining = $derived(roundMoney(totalRounded - assigned));

	function defaultPagoRows(forTotal: number): PagoRow[] {
		const t = roundMoney(forTotal);
		return FE_MEDIO_PAGO_OPTIONS.map((opt, i) => ({
			tipo: opt.tipo,
			label: opt.label,
			active: i === 1,
			monto: i === 1 ? String(t) : ''
		}));
	}

	function syncPagosToTotal(forTotal: number) {
		if (forTotal <= 0) return;
		if (moneda === 'CRC' && tipoCambio <= 0) return;

		const active = pagoRows.filter((r) => r.active);
		if (active.length === 1) {
			pagoRows = pagoRows.map((r) =>
				r.active ? { ...r, monto: String(roundMoney(forTotal)) } : r
			);
			return;
		}

		const assignedSum = roundMoney(
			pagoRows.reduce((sum, r) => {
				if (!r.active) return sum;
				const n = Number(String(r.monto).replace(',', '.'));
				return sum + (Number.isFinite(n) ? n : 0);
			}, 0)
		);
		if (active.length === 0 || assignedSum === 0) {
			pagoRows = defaultPagoRows(forTotal);
			return;
		}

		pagoRows = defaultPagoRows(forTotal);
	}

	function refreshPagos(forTotal = totalRounded) {
		syncPagosToTotal(forTotal);
	}

	function precioToLedgerUsd(precio: number): number {
		if (pricesMoneda !== 'CRC' || tipoCambio <= 0) return roundMoney(precio);
		return roundMoney(precio / tipoCambio);
	}

	function cloneLines(source: FeEmitReviewLine[]): DraftLine[] {
		return source.map((line) => ({
			key: line.id || crypto.randomUUID(),
			id: line.id,
			descripcion: line.descripcion,
			cantidad: String(line.cantidad),
			unidad: line.unidad || 'Sp',
			cabys: line.cabys === '—' ? '' : line.cabys,
			impuesto_tarifa: line.impuesto_tarifa,
			precio_unitario: String(line.precio_unitario)
		}));
	}

	async function loadTipoCambio() {
		const loadId = ++tipoCambioLoadId;
		tipoCambioStatus = 'loading';
		tipoCambioHint = 'Consultando Hacienda…';
		try {
			const res = await fetch('/api/admin/tipo-cambio');
			const data = (await res.json()) as { venta?: number; fecha?: string; error?: string };
			if (loadId !== tipoCambioLoadId) return;
			const venta = Number(data.venta);
			if (!res.ok || !Number.isFinite(venta) || venta <= 0) {
				throw new Error(data.error ?? 'Tipo de cambio inválido');
			}
			tipoCambioInput = String(venta);
			tipoCambioStatus = 'ok';
			tipoCambioHint = '';
			if (moneda === 'CRC' && pricesMoneda === 'USD') {
				convertDraftPrices('USD', 'CRC', roundMoney(venta));
			}
			refreshPagos();
		} catch {
			if (loadId !== tipoCambioLoadId) return;
			tipoCambioStatus = 'error';
			tipoCambioHint = 'No se pudo cargar. Digítelo manualmente.';
		}
	}

	$effect(() => {
		if (open) {
			const seedLines = lines;
			untrack(() => {
				notas = initialNotas;
				extraCorreos = initialExtraCorreos;
				drafts = cloneLines(seedLines);
				formError = '';
				moneda = 'USD';
				pricesMoneda = 'USD';
				tipoCambioInput = '';
				pagoRows = defaultPagoRows(0);
				void loadTipoCambio();
			});
			dialogEl?.showModal();
		} else {
			untrack(() => {
				tipoCambioLoadId += 1;
			});
			dialogEl?.close();
		}
	});

	$effect(() => {
		if (!open) return;
		const total = totalRounded;
		const tc = tipoCambio;
		const currency = moneda;
		if (total <= 0) return;
		if (currency === 'CRC' && tc <= 0) return;
		untrack(() => syncPagosToTotal(total));
	});

	function addLine() {
		const next = [
			...drafts,
			{
				key: crypto.randomUUID(),
				id: '',
				descripcion: '',
				cantidad: '1',
				unidad: 'Sp',
				cabys: '',
				impuesto_tarifa: 13,
				precio_unitario: '0'
			}
		];
		drafts = next;
		refreshPagos(totalFromDrafts(next));
	}

	function removeLine(key: string) {
		if (drafts.length <= 1) return;
		const next = drafts.filter((d) => d.key !== key);
		drafts = next;
		refreshPagos(totalFromDrafts(next));
	}

	function togglePago(index: number, active: boolean) {
		pagoRows = pagoRows.map((r, i) => {
			if (i !== index) return r;
			if (active && !r.monto.trim()) {
				return { ...r, active: true, monto: remaining > 0 ? String(remaining) : String(totalRounded) };
			}
			if (!active) return { ...r, active: false, monto: '' };
			return { ...r, active };
		});
	}

	function fillPagoRemaining(index: number) {
		const rest = remaining;
		if (rest <= 0) return;
		pagoRows = pagoRows.map((r, i) => {
			if (i !== index) return r;
			const current = r.active ? Number(String(r.monto).replace(',', '.')) || 0 : 0;
			return { ...r, active: true, monto: String(roundMoney(current + rest)) };
		});
	}

	function close() {
		open = false;
		onCancel();
	}

	function continueEmit() {
		formError = '';
		if (computedDrafts.length === 0) {
			formError = 'Agregue al menos una línea.';
			return;
		}
		for (const d of computedDrafts) {
			if (!d.descripcion.trim()) {
				formError = 'Todas las líneas necesitan descripción.';
				return;
			}
			if (!/^\d{13}$/.test(d.cabys.trim())) {
				formError = `La línea «${d.descripcion}» necesita CABYS de 13 dígitos.`;
				return;
			}
		}
		if (tipoCambio <= 0) {
			formError =
				moneda === 'USD'
					? 'Indique el tipo de cambio (colones por 1 USD).'
					: tipoCambioStatus === 'loading'
						? 'Espere a que se cargue el tipo de cambio para colones.'
						: 'No se pudo obtener el tipo de cambio para convertir a colones.';
			return;
		}
		if (totalRounded <= 0) {
			formError = 'El total del comprobante debe ser mayor que cero.';
			return;
		}
		const medios: FeMedioPagoItem[] = [];
		for (const r of pagoRows) {
			if (!r.active) continue;
			const monto = roundMoney(Number(String(r.monto).replace(',', '.')));
			if (!Number.isFinite(monto) || monto <= 0) {
				formError = `Monto inválido en «${r.label}».`;
				return;
			}
			medios.push({ tipo: r.tipo, monto });
		}
		if (medios.length === 0) {
			formError = 'Active al menos un medio de pago.';
			return;
		}
		const mediosFinal = reconcileMediosPagoToTotal(medios, totalRounded);
		const assignedFinal = roundMoney(mediosFinal.reduce((s, m) => s + m.monto, 0));
		if (Math.abs(assignedFinal - totalRounded) >= 0.01) {
			formError = `Los medios de pago deben sumar ${formatAmount(totalRounded)}.`;
			return;
		}

		onConfirm({
			notas: notas.trim(),
			extraCorreos: extraCorreos.trim(),
			lineas: computedDrafts.map((d) => ({
				id: d.id || undefined,
				descripcion: d.descripcion.trim(),
				cantidad: d.cantidadN,
				precio_unitario: precioToLedgerUsd(d.precioN),
				fe_cabys: d.cabys.trim(),
				fe_unidad_medida: d.unidad,
				impuesto_tarifa: d.impuesto_tarifa
			})),
			medios: mediosFinal,
			moneda,
			tipoCambio
		});
		open = false;
	}
</script>

<dialog bind:this={dialogEl} class="fe-review-dialog" onclick={(e) => e.target === dialogEl && close()}>
	<div class="fe-review-dialog__panel">
		<header class="fe-review-dialog__header">
			<div>
				<h2 class="fe-review-dialog__title">Preparar factura electrónica</h2>
				<p class="fe-review-dialog__subtitle">
					Factura {invoiceNumber} — edite líneas, notas, moneda y correos antes de enviar.
				</p>
			</div>
			<button type="button" class="fe-review-dialog__close" aria-label="Cerrar" onclick={close}>×</button>
		</header>

		<div class="fe-review-dialog__body">
			<section class="fe-review-dialog__section">
				<h3 class="fe-review-dialog__section-title">Receptor</h3>
				<dl class="fe-review-dialog__dl">
					<div><dt>Nombre</dt><dd>{receptor.nombre}</dd></div>
					<div><dt>Tipo ID</dt><dd>{receptor.tipoId}</dd></div>
					<div><dt>Identificación</dt><dd>{receptor.identificacion}</dd></div>
					<div><dt>Actividad económica</dt><dd>{receptor.actividad}</dd></div>
					<div class="fe-review-dialog__span"><dt>Correo FE</dt><dd>{receptor.correo}</dd></div>
					<div class="fe-review-dialog__span"><dt>Dirección fiscal</dt><dd>{receptor.direccion}</dd></div>
				</dl>
				{#if missingReceptor.length}
					<p class="fe-review-dialog__warn">
						Faltan {missingReceptor.join(' y ')} en la ficha del cliente. Hacienda puede rechazar el envío.
					</p>
				{/if}
			</section>

			<section class="fe-review-dialog__section">
				<h3 class="fe-review-dialog__section-title">Moneda del comprobante</h3>
				<div
					class="fe-review-dialog__currency"
					class:fe-review-dialog__currency--usd={moneda === 'USD'}
				>
					<label class="field fe-review-dialog__currency-field">
						<span class="field-label">Moneda</span>
						<select
							class="field-select"
							value={moneda}
							onchange={(e) => onMonedaChange(e.currentTarget.value as FeMoneda)}
						>
							{#each FE_MONEDA_OPTIONS as opt (opt.code)}
								<option value={opt.code}>{opt.label}</option>
							{/each}
						</select>
						{#if moneda === 'CRC' && tipoCambioHint && tipoCambioStatus !== 'ok'}
							<span
								class="fe-review-dialog__tc-hint type-caption"
								class:fe-review-dialog__tc-hint--error={tipoCambioStatus === 'error'}
							>
								{tipoCambioHint}
							</span>
						{/if}
					</label>
					{#if moneda === 'USD'}
						<label class="field fe-review-dialog__currency-field">
							<span class="field-label">Tipo de cambio (₡ por USD)</span>
							<input
								type="text"
								inputmode="decimal"
								class="field-input"
								placeholder={tipoCambioStatus === 'loading' ? 'Cargando…' : 'Ej. 449.49'}
								value={tipoCambioInput}
								oninput={(e) => onTipoCambioInput(e.currentTarget.value)}
							/>
							{#if tipoCambioHint && tipoCambioStatus !== 'ok'}
								<span
									class="fe-review-dialog__tc-hint type-caption"
									class:fe-review-dialog__tc-hint--error={tipoCambioStatus === 'error'}
								>
									{tipoCambioHint}
								</span>
							{/if}
						</label>
					{/if}
				</div>
			</section>

			<section class="fe-review-dialog__section">
				<div class="fe-review-dialog__section-head">
					<h3 class="fe-review-dialog__section-title">Líneas</h3>
					<button type="button" class="btn-secondary-pill" onclick={addLine}>Agregar ítem</button>
				</div>
				<div class="fe-review-dialog__table-wrap">
					<table class="data-table fe-review-dialog__table">
						<thead>
							<tr>
								<th>Descripción</th>
								<th class="fe-review-dialog__num">Cant.</th>
								<th>Unidad</th>
								<th>CABYS</th>
								<th>IVA</th>
								<th class="fe-review-dialog__num">P. unit. {moneda}</th>
								<th class="fe-review-dialog__num">Subtotal</th>
								<th class="fe-review-dialog__num">Total</th>
								<th></th>
							</tr>
						</thead>
						<tbody>
							{#each drafts as line (line.key)}
								{@const amounts = lineComputed(line)}
								<tr>
									<td>
										<input class="field-input fe-review-dialog__desc" bind:value={line.descripcion} />
									</td>
									<td>
										<input
											type="number"
											min="1"
											step="1"
											class="field-input fe-review-dialog__num-input"
											value={line.cantidad}
											oninput={(e) => patchDraft(line.key, { cantidad: e.currentTarget.value })}
										/>
									</td>
									<td>
										<select class="field-select fe-review-dialog__unidad" bind:value={line.unidad}>
											{#each FE_UNIDAD_MEDIDA_OPTIONS as opt (opt.value)}
												<option value={opt.value}>{opt.value}</option>
											{/each}
										</select>
									</td>
									<td>
										<input
											class="field-input fe-review-dialog__cabys"
											inputmode="numeric"
											maxlength="13"
											placeholder="13 dígitos"
											bind:value={line.cabys}
											oninput={(e) => {
												line.cabys = e.currentTarget.value.replace(/\D/g, '').slice(0, 13);
											}}
										/>
									</td>
									<td>
										<select
											class="field-select fe-review-dialog__iva"
											value={line.impuesto_tarifa}
											onchange={(e) =>
												patchDraft(line.key, {
													impuesto_tarifa: Number(e.currentTarget.value)
												})
											}
										>
											{#each FE_IMPUESTO_TARIFA_OPTIONS as opt (opt.value)}
												<option value={opt.value}>{opt.label}</option>
											{/each}
										</select>
									</td>
									<td>
										<input
											type="number"
											min="0"
											step="0.01"
											class="field-input fe-review-dialog__num-input"
											value={line.precio_unitario}
											oninput={(e) => patchDraft(line.key, { precio_unitario: e.currentTarget.value })}
										/>
									</td>
									<td class="fe-review-dialog__num">{formatAmount(amounts.subtotal)}</td>
									<td class="fe-review-dialog__num">{formatAmount(amounts.line_total)}</td>
									<td>
										<button
											type="button"
											class="btn-secondary-pill fe-review-dialog__remove"
											disabled={drafts.length <= 1}
											onclick={() => removeLine(line.key)}
										>
											Quitar
										</button>
									</td>
								</tr>
							{/each}
						</tbody>
						<tfoot>
							<tr>
								<td colspan="6" class="fe-review-dialog__totals-label">
									Subtotal / IVA / Total ({moneda})
								</td>
								<td class="fe-review-dialog__num">{formatAmount(comprobanteTotals.subtotal)}</td>
								<td class="fe-review-dialog__num fe-review-dialog__total">
									{formatAmount(comprobanteTotals.total)}
									<span class="type-caption">IVA {formatAmount(comprobanteTotals.impuesto)}</span>
								</td>
								<td></td>
							</tr>
						</tfoot>
					</table>
				</div>
			</section>

			<section class="fe-review-dialog__section">
				<h3 class="fe-review-dialog__section-title">Medios de pago</h3>
				<ul class="fe-review-dialog__pagos">
					{#each pagoRows as row, i (row.tipo)}
						<li class="fe-review-dialog__pago">
							<label class="fe-review-dialog__pago-toggle">
								<input
									type="checkbox"
									checked={row.active}
									onchange={(e) => togglePago(i, e.currentTarget.checked)}
								/>
								{row.label}
							</label>
							<input
								type="text"
								inputmode="decimal"
								class="field-input fe-review-dialog__num-input"
								disabled={!row.active}
								value={row.monto}
								oninput={(e) => {
									const v = e.currentTarget.value;
									pagoRows = pagoRows.map((r, j) => (j === i ? { ...r, monto: v } : r));
								}}
							/>
							<button
								type="button"
								class="btn-secondary-pill"
								disabled={!row.active || remaining <= 0}
								onclick={() => fillPagoRemaining(i)}
							>
								+ Restante
							</button>
						</li>
					{/each}
				</ul>
			</section>

			<label class="field">
				<span class="field-label">Notas de la factura</span>
				<textarea
					class="field-input fe-review-dialog__notes-input"
					rows="3"
					maxlength="800"
					bind:value={notas}
					placeholder="Observaciones que aparecerán en el PDF."
				></textarea>
			</label>

			<FeCorreosField
				bind:value={extraCorreos}
				name="extra_correos_review"
				label="Copia a otros correos (CC)"
				placeholder="otro@clinica.com, contabilidad@clinica.com"
			/>
		</div>

		{#if formError}
			<p class="fe-review-dialog__error" role="alert">{formError}</p>
		{/if}

		<footer class="fe-review-dialog__footer">
			<button type="button" class="btn-secondary-pill" onclick={close}>Cancelar</button>
			<button type="button" class="btn-primary" onclick={continueEmit}>Enviar a Hacienda</button>
		</footer>
	</div>
</dialog>

<style>
	.fe-review-dialog {
		margin: auto;
		padding: 0;
		border: none;
		max-width: min(72rem, calc(100vw - 1.5rem));
		width: 100%;
		background: transparent;
		color: var(--dash-text);
		color-scheme: inherit;
	}

	:global([data-theme='dark']) .fe-review-dialog {
		color-scheme: dark;
	}

	:global([data-theme='light']) .fe-review-dialog {
		color-scheme: light;
	}

	.fe-review-dialog::backdrop {
		background: color-mix(in srgb, var(--dash-sidebar-bg) 55%, transparent);
	}

	.fe-review-dialog__panel {
		display: flex;
		flex-direction: column;
		max-height: min(94vh, 56rem);
		background: var(--dash-card);
		color: var(--dash-text);
		border: 1px solid var(--dash-border);
		border-radius: var(--dash-radius-lg);
		overflow: hidden;
		box-shadow: var(--dash-shadow-hover);
	}

	.fe-review-dialog__header,
	.fe-review-dialog__footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		padding: 0.9rem 1.1rem;
		border-bottom: 1px solid var(--dash-border);
	}

	.fe-review-dialog__footer {
		justify-content: flex-end;
		border-bottom: 0;
		border-top: 1px solid var(--dash-border);
	}

	.fe-review-dialog__title {
		margin: 0 0 0.2rem;
		font-size: 1.15rem;
	}

	.fe-review-dialog__subtitle {
		margin: 0;
		font-size: 0.85rem;
		color: var(--color-muted-foreground, #64748b);
	}

	.fe-review-dialog__close {
		border: none;
		background: transparent;
		font-size: 1.5rem;
		line-height: 1;
		cursor: pointer;
		color: inherit;
	}

	.fe-review-dialog__body {
		overflow: auto;
		padding: 1rem 1.1rem;
		display: flex;
		flex-direction: column;
		gap: 1.1rem;
	}

	.fe-review-dialog__section-title {
		margin: 0 0 0.65rem;
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.fe-review-dialog__section-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
		position: sticky;
		top: 0;
		z-index: 1;
		background: var(--dash-card);
		padding: 0.15rem 0 0.4rem;
	}

	.fe-review-dialog__section-head .fe-review-dialog__section-title {
		margin: 0;
	}

	.fe-review-dialog__dl {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.55rem 1rem;
		margin: 0;
	}

	.fe-review-dialog__dl dt {
		margin: 0;
		font-size: 0.68rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-muted-foreground, #64748b);
	}

	.fe-review-dialog__dl dd {
		margin: 0.1rem 0 0;
		font-size: 0.9rem;
	}

	.fe-review-dialog__span {
		grid-column: 1 / -1;
	}

	.fe-review-dialog__warn,
	.fe-review-dialog__error {
		margin: 0.65rem 1.1rem 0;
		font-size: 0.8125rem;
		color: var(--color-danger, #b91c1c);
	}

	.fe-review-dialog__warn {
		margin: 0.65rem 0 0;
		color: var(--color-warning, #b45309);
	}

	.fe-review-dialog__table-wrap {
		overflow-x: auto;
	}

	.fe-review-dialog__table {
		min-width: 58rem;
	}

	.fe-review-dialog__num {
		text-align: right;
		white-space: nowrap;
	}

	.fe-review-dialog__desc {
		min-width: 10rem;
	}

	.fe-review-dialog__cabys {
		width: 8.5rem;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	}

	.fe-review-dialog__num-input {
		width: 8rem;
		text-align: right;
	}

	.fe-review-dialog__unidad,
	.fe-review-dialog__iva {
		width: auto;
		min-width: 4.5rem;
	}

	.fe-review-dialog__remove {
		padding: 0.25rem 0.55rem;
		font-size: 0.75rem;
	}

	.fe-review-dialog__totals-label {
		text-align: right;
		font-weight: 600;
	}

	.fe-review-dialog__total {
		font-weight: 700;
	}

	.fe-review-dialog__currency {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 0.75rem;
		align-items: start;
	}

	.fe-review-dialog__currency--usd {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.fe-review-dialog__currency-field {
		min-width: 0;
	}

	.fe-review-dialog__tc-hint {
		display: block;
		margin-top: 0.35rem;
		font-weight: 500;
	}

	.fe-review-dialog__tc-hint--error {
		color: var(--color-danger, #b91c1c);
	}

	.fe-review-dialog__pagos {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}

	.fe-review-dialog__pago {
		display: grid;
		grid-template-columns: minmax(8rem, 1fr) 7rem auto;
		gap: 0.75rem;
		align-items: center;
	}

	.fe-review-dialog__pago-toggle {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.fe-review-dialog__notes-input {
		min-height: 4.2rem;
		resize: vertical;
	}

	@media (max-width: 640px) {
		.fe-review-dialog__dl,
		.fe-review-dialog__currency {
			grid-template-columns: 1fr;
		}
	}
</style>
