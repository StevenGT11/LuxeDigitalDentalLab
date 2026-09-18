<script lang="ts">
	import {
		FE_MONEDA_OPTIONS,
		feComprobanteAmountFromLedger,
		type FeMoneda
	} from '$lib/fe/fe-moneda';
	import { FE_MEDIO_PAGO_OPTIONS, roundMoney, type FeMedioPagoItem } from '$lib/fe/medios-pago';
	import { formatColones, formatCurrency } from '$lib/lab/helpers';
	import { untrack } from 'svelte';

	export type FeMediosPagoConfirm = {
		medios: FeMedioPagoItem[];
		moneda: FeMoneda;
		tipoCambio: number;
	};

	type RowState = {
		tipo: string;
		label: string;
		active: boolean;
		monto: string;
	};

	interface Props {
		open: boolean;
		/** Total interno de la factura (USD en el libro). */
		total: number;
		subtitle?: string;
		showCurrency?: boolean;
		defaultMoneda?: FeMoneda;
		confirmLabel?: string;
		onCancel: () => void;
		onConfirm: (result: FeMediosPagoConfirm) => void;
	}

	let {
		open = $bindable(false),
		total,
		subtitle = '',
		showCurrency = true,
		defaultMoneda = 'USD',
		confirmLabel = 'Aplicar pagos',
		onCancel,
		onConfirm
	}: Props = $props();

	let dialogEl = $state<HTMLDialogElement | null>(null);
	let rows = $state<RowState[]>([]);
	let formError = $state('');
	let moneda = $state<FeMoneda>('USD');
	let tipoCambioInput = $state('');
	let tipoCambioStatus = $state<'idle' | 'loading' | 'ok' | 'error'>('idle');
	let tipoCambioHint = $state('');
	let tipoCambioLoadId = 0;

	const tipoCambio = $derived.by(() => {
		const n = Number(String(tipoCambioInput).replace(',', '.'));
		return Number.isFinite(n) && n > 0 ? roundMoney(n) : 0;
	});

	const comprobanteTotal = $derived(
		!showCurrency
			? roundMoney(total)
			: tipoCambio > 0
				? feComprobanteAmountFromLedger(total, moneda, tipoCambio)
				: 0
	);

	const totalRounded = $derived(roundMoney(comprobanteTotal));

	function formatAmount(amount: number): string {
		if (!showCurrency) return formatCurrency(amount);
		return moneda === 'CRC' ? formatColones(amount) : formatCurrency(amount);
	}

	const assigned = $derived(
		roundMoney(
			rows.reduce((sum, r) => {
				if (!r.active) return sum;
				const n = Number(r.monto.replace(',', '.'));
				return sum + (Number.isFinite(n) ? n : 0);
			}, 0)
		)
	);

	const remaining = $derived(roundMoney(totalRounded - assigned));

	const canApply = $derived(
		totalRounded > 0 &&
			(showCurrency ? tipoCambio > 0 : true) &&
			Math.abs(remaining) < 0.01 &&
			rows.some((r) => r.active && Number(r.monto) > 0)
	);

	function defaultRows(forTotal: number): RowState[] {
		const t = roundMoney(forTotal);
		return FE_MEDIO_PAGO_OPTIONS.map((opt, i) => ({
			tipo: opt.tipo,
			label: opt.label,
			active: i === 1,
			monto: i === 1 ? String(t) : ''
		}));
	}

	function formatTcFecha(iso: string): string {
		const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
		if (!m) return iso;
		return `${m[3]}/${m[2]}/${m[1]}`;
	}

	function resetForm() {
		moneda = defaultMoneda;
		tipoCambioInput = '';
		tipoCambioStatus = showCurrency ? 'loading' : 'idle';
		tipoCambioHint = showCurrency ? 'Consultando Hacienda…' : '';
		rows = defaultRows(showCurrency ? total : roundMoney(total));
		formError = '';
	}

	async function loadTipoCambio() {
		if (!showCurrency) return;
		const loadId = ++tipoCambioLoadId;
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
			tipoCambioHint = data.fecha
				? `Venta BCCR ${formatTcFecha(data.fecha)} · Hacienda`
				: 'Venta BCCR · Hacienda';
			refreshRowsForTotal();
		} catch {
			if (loadId !== tipoCambioLoadId) return;
			tipoCambioStatus = 'error';
			tipoCambioHint = 'No se pudo cargar. Digítelo manualmente.';
		}
	}

	function refreshRowsForTotal() {
		if (totalRounded <= 0 || tipoCambio <= 0) return;
		rows = defaultRows(totalRounded);
	}

	function toggleRow(index: number, active: boolean) {
		rows = rows.map((r, i) => {
			if (i !== index) return r;
			if (active && !r.monto.trim()) {
				return { ...r, active: true, monto: remaining > 0 ? String(remaining) : String(totalRounded) };
			}
			if (!active) return { ...r, active: false, monto: '' };
			return { ...r, active };
		});
	}

	function fillRemaining(index: number) {
		const rest = remaining;
		if (rest <= 0) return;
		rows = rows.map((r, i) => {
			if (i !== index) return r;
			const current = r.active ? Number(String(r.monto).replace(',', '.')) || 0 : 0;
			return { ...r, active: true, monto: String(roundMoney(current + rest)) };
		});
	}

	function handleConfirm() {
		formError = '';
		if (showCurrency && tipoCambio <= 0) {
			formError =
				moneda === 'USD'
					? 'Indique el tipo de cambio (colones por 1 USD) requerido por Hacienda.'
					: 'Indique el tipo de cambio para convertir USD a colones.';
			return;
		}

		const medios: FeMedioPagoItem[] = [];
		for (const r of rows) {
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
		if (Math.abs(roundMoney(medios.reduce((s, m) => s + m.monto, 0)) - totalRounded) > 0.01) {
			formError = `Quedan ${formatAmount(Math.abs(remaining))} por asignar para igualar el total.`;
			return;
		}
		onConfirm({
			medios,
			moneda: showCurrency ? moneda : defaultMoneda,
			tipoCambio: showCurrency ? tipoCambio : 1
		});
		open = false;
	}

	function close() {
		open = false;
		onCancel();
	}

	$effect(() => {
		if (open) {
			untrack(() => {
				resetForm();
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
</script>

<dialog bind:this={dialogEl} class="fe-medios-dialog" onclick={(e) => e.target === dialogEl && close()}>
	<div class="fe-medios-dialog__panel">
		<header class="fe-medios-dialog__header">
			<div>
				<h2 class="fe-medios-dialog__title">Medios de pago — venta</h2>
				<p class="fe-medios-dialog__subtitle">
					{subtitle || 'Distribuya el total entre uno o más medios de pago'}
				</p>
			</div>
			<button type="button" class="fe-medios-dialog__close" aria-label="Cerrar" onclick={close}>×</button>
		</header>

		{#if showCurrency}
			<div class="fe-medios-dialog__currency">
				<label class="field fe-medios-dialog__currency-field">
					<span class="field-label">Moneda del comprobante</span>
					<select
						class="field-select"
						value={moneda}
						onchange={(e) => {
							moneda = e.currentTarget.value as FeMoneda;
							refreshRowsForTotal();
						}}
					>
						{#each FE_MONEDA_OPTIONS as opt (opt.code)}
							<option value={opt.code}>{opt.label}</option>
						{/each}
					</select>
				</label>
				<label class="field fe-medios-dialog__currency-field">
					<span class="field-label">Tipo de cambio (₡ por USD)</span>
					<input
						type="text"
						inputmode="decimal"
						class="field-input"
						placeholder={tipoCambioStatus === 'loading' ? 'Cargando…' : 'Ej. 449.49'}
						value={tipoCambioInput}
						oninput={(e) => {
							tipoCambioInput = e.currentTarget.value;
							if (tipoCambio > 0) refreshRowsForTotal();
						}}
					/>
					{#if tipoCambioHint}
						<span
							class="fe-medios-dialog__tc-hint"
							class:fe-medios-dialog__tc-hint--error={tipoCambioStatus === 'error'}
						>
							{tipoCambioHint}
						</span>
					{/if}
				</label>
			</div>
		{/if}

		<div class="fe-medios-dialog__totals">
			<div class="fe-medios-dialog__total-box">
				<span class="fe-medios-dialog__total-label">Total comprobante</span>
				<span class="fe-medios-dialog__total-value">{formatAmount(totalRounded)}</span>
			</div>
			<div class="fe-medios-dialog__total-box">
				<span class="fe-medios-dialog__total-label">Asignado</span>
				<span class="fe-medios-dialog__total-value">{formatAmount(assigned)}</span>
			</div>
			<div
				class="fe-medios-dialog__total-box"
				class:fe-medios-dialog__total-box--highlight={Math.abs(remaining) >= 0.01}
			>
				<span class="fe-medios-dialog__total-label">Restante</span>
				<span class="fe-medios-dialog__total-value">{formatAmount(remaining)}</span>
			</div>
		</div>

		<div class="fe-medios-dialog__table-wrap">
			<div class="fe-medios-dialog__head" aria-hidden="true">
				<span>Activo</span>
				<span>Medio de pago</span>
				<span>Monto</span>
			</div>
			<ul class="fe-medios-dialog__list">
				{#each rows as row, i (row.tipo)}
					<li class="fe-medios-dialog__row">
						<label class="fe-medios-dialog__toggle">
							<input
								type="checkbox"
								checked={row.active}
								onchange={(e) => toggleRow(i, e.currentTarget.checked)}
							/>
							<span class="fe-medios-dialog__switch" aria-hidden="true"></span>
						</label>
						<div class="fe-medios-dialog__medio">
							<span class="fe-medios-dialog__medio-name">{row.label}</span>
							<span class="fe-medios-dialog__medio-code">({row.tipo})</span>
						</div>
						<div class="fe-medios-dialog__monto-cell">
							<input
								type="text"
								inputmode="decimal"
								class="field-input fe-medios-dialog__monto-input"
								disabled={!row.active}
								value={row.monto}
								oninput={(e) => {
									const v = e.currentTarget.value;
									rows = rows.map((r, j) => (j === i ? { ...r, monto: v } : r));
								}}
							/>
							<button
								type="button"
								class="btn-secondary-pill fe-medios-dialog__restante"
								disabled={!row.active || remaining <= 0}
								onclick={() => fillRemaining(i)}
							>
								+ Restante
							</button>
						</div>
					</li>
				{/each}
			</ul>
		</div>

		{#if formError}
			<p class="fe-medios-dialog__error" role="alert">{formError}</p>
		{:else if Math.abs(remaining) >= 0.01}
			<p class="fe-medios-dialog__hint">
				Quedan {formatAmount(remaining)} por asignar para igualar el total.
			</p>
		{/if}

		<footer class="fe-medios-dialog__footer">
			<button type="button" class="btn-secondary-pill" onclick={close}>Cancelar</button>
			<button type="button" class="btn-primary" disabled={!canApply} onclick={handleConfirm}>
				{confirmLabel}
			</button>
		</footer>
	</div>
</dialog>

<style>
	.fe-medios-dialog {
		margin: auto;
		padding: 0;
		border: none;
		max-width: min(42rem, calc(100vw - 2rem));
		width: 100%;
		background: transparent;
		color: var(--dash-text);
		color-scheme: inherit;
	}

	:global([data-theme='dark']) .fe-medios-dialog {
		color-scheme: dark;
	}

	:global([data-theme='light']) .fe-medios-dialog {
		color-scheme: light;
	}

	.fe-medios-dialog::backdrop {
		background: color-mix(in srgb, var(--dash-sidebar-bg) 55%, transparent);
	}

	.fe-medios-dialog__panel {
		display: flex;
		flex-direction: column;
		max-height: min(90vh, 40rem);
		background: var(--dash-card);
		color: var(--dash-text);
		border: 1px solid var(--dash-border);
		border-radius: var(--dash-radius-lg);
		overflow: hidden;
		box-shadow: var(--dash-shadow-hover);
	}

	.fe-medios-dialog__header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1rem;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid var(--dash-border);
	}

	.fe-medios-dialog__title {
		margin: 0;
		font-size: 1.05rem;
		font-weight: 600;
		color: var(--dash-text);
	}

	.fe-medios-dialog__subtitle {
		margin: 0.25rem 0 0;
		font-size: 0.8125rem;
		color: var(--dash-muted);
	}

	.fe-medios-dialog__close {
		border: none;
		background: transparent;
		font-size: 1.5rem;
		line-height: 1;
		cursor: pointer;
		color: var(--dash-muted);
	}

	.fe-medios-dialog :global(.field-label) {
		color: var(--dash-muted);
	}

	.fe-medios-dialog :global(.field-input),
	.fe-medios-dialog :global(.field-select) {
		background: var(--dash-input-bg);
		color: var(--dash-text);
		border-color: var(--dash-border);
	}

	.fe-medios-dialog :global(.field-input:focus),
	.fe-medios-dialog :global(.field-select:focus) {
		border-color: var(--dash-text);
		box-shadow: 0 0 0 2px var(--dash-accent-soft);
		outline: none;
	}

	.fe-medios-dialog :global(.field-input:disabled) {
		opacity: 0.55;
		color: var(--dash-muted);
	}

	.fe-medios-dialog :global(.btn-primary) {
		background: var(--dash-btn-primary-bg);
		color: var(--dash-btn-primary-text);
		border-color: transparent;
	}

	.fe-medios-dialog :global(.btn-secondary-pill) {
		border-color: var(--dash-border-strong);
		color: var(--dash-text);
		background: transparent;
	}

	.fe-medios-dialog__currency {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
		padding: 1rem 1.25rem 0;
	}

	.fe-medios-dialog__tc-hint {
		display: block;
		margin-top: 0.35rem;
		font-size: 0.6875rem;
		color: var(--dash-muted);
	}

	.fe-medios-dialog__tc-hint--error {
		color: #c0392b;
	}

	.fe-medios-dialog__totals {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.65rem;
		padding: 1rem 1.25rem 0;
	}

	.fe-medios-dialog__total-box {
		padding: 0.65rem 0.75rem;
		border: 1px solid var(--dash-border);
		border-radius: var(--dash-radius);
		background: var(--dash-table-head);
	}

	.fe-medios-dialog__total-box--highlight {
		border-color: color-mix(in srgb, var(--luxe-gold-accent) 55%, transparent);
		background: var(--dash-accent-soft);
	}

	.fe-medios-dialog__total-label {
		display: block;
		font-size: 0.625rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--dash-muted);
	}

	.fe-medios-dialog__total-value {
		display: block;
		margin-top: 0.2rem;
		font-size: 0.9375rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	.fe-medios-dialog__table-wrap {
		margin: 1rem 1.25rem 0;
		border: 1px solid var(--dash-border);
		border-radius: var(--dash-radius);
		overflow: hidden;
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		background: var(--dash-card);
	}

	.fe-medios-dialog__head {
		display: grid;
		grid-template-columns: 4rem 1fr minmax(0, 11rem);
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		font-size: 0.625rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--dash-muted);
		background: var(--dash-table-head);
		border-bottom: 1px solid var(--dash-border);
	}

	.fe-medios-dialog__list {
		margin: 0;
		padding: 0;
		list-style: none;
		overflow: auto;
	}

	.fe-medios-dialog__row {
		display: grid;
		grid-template-columns: 4rem 1fr minmax(0, 11rem);
		gap: 0.5rem;
		align-items: center;
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid var(--dash-table-row-border);
	}

	.fe-medios-dialog__toggle {
		position: relative;
		display: inline-flex;
		cursor: pointer;
	}

	.fe-medios-dialog__toggle input {
		position: absolute;
		opacity: 0;
		width: 0;
		height: 0;
	}

	.fe-medios-dialog__switch {
		width: 2.25rem;
		height: 1.25rem;
		border-radius: 999px;
		background: var(--dash-border-strong);
		transition: background 0.15s;
	}

	.fe-medios-dialog__switch::after {
		content: '';
		display: block;
		width: 1rem;
		height: 1rem;
		margin: 0.125rem;
		border-radius: 50%;
		background: var(--dash-card);
		transition: transform 0.15s;
	}

	.fe-medios-dialog__toggle input:checked + .fe-medios-dialog__switch {
		background: var(--dash-btn-primary-bg);
	}

	.fe-medios-dialog__toggle input:checked + .fe-medios-dialog__switch::after {
		background: var(--dash-btn-primary-text);
		transform: translateX(1rem);
	}

	.fe-medios-dialog__medio-name {
		display: block;
		font-size: 0.875rem;
		font-weight: 500;
	}

	.fe-medios-dialog__medio-code {
		font-size: 0.75rem;
		color: var(--dash-muted);
	}

	.fe-medios-dialog__monto-cell {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.fe-medios-dialog__monto-input {
		width: 100%;
		padding: 0.35rem 0.5rem;
		font-size: 0.875rem;
	}

	.fe-medios-dialog__restante {
		font-size: 0.6875rem;
		padding: 0.2rem 0.45rem;
		align-self: flex-start;
	}

	.fe-medios-dialog__hint,
	.fe-medios-dialog__error {
		margin: 0.75rem 1.25rem 0;
		font-size: 0.8125rem;
	}

	.fe-medios-dialog__hint {
		color: var(--luxe-gold);
	}

	.fe-medios-dialog__error {
		color: #c0392b;
	}

	.fe-medios-dialog__footer {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		padding: 1rem 1.25rem;
		border-top: 1px solid var(--dash-border);
		margin-top: auto;
	}

	@media (max-width: 640px) {
		.fe-medios-dialog__currency {
			grid-template-columns: 1fr;
		}

		.fe-medios-dialog__head,
		.fe-medios-dialog__row {
			grid-template-columns: 1fr;
		}
	}
</style>
