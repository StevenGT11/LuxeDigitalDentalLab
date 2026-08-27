<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidate } from '$app/navigation';
	import { tick } from 'svelte';
	import FeMediosPagoModal from '$lib/components/fe/FeMediosPagoModal.svelte';
	import type { FeMedioPagoItem } from '$lib/fe/medios-pago';
	import {
		feComprobanteBlocksEmit,
		feComprobanteCanReemit,
		feComprobanteCanConsultar,
		FE_TIPO_IDENTIFICACION_OPTIONS,
		getFeComprobanteEstadoClass,
		getFeComprobanteEstadoLabel
	} from '$lib/fe/constants';
	import {
		getInvoiceEstadoClass,
		getInvoiceEstadoLabel,
		INVOICE_ESTADOS
	} from '$lib/lab/invoice-estado';
	import { formatCurrency, formatDate } from '$lib/lab/helpers';
	import { computeInvoiceTaxTotals } from '$lib/lab/invoice-tax';
	import type { InvoiceLineDetail } from '$lib/lab/invoice-detail.server';
	import FeRechazoDetail from '$lib/components/fe/FeRechazoDetail.svelte';
	import { parseFeRechazoFromStored, parseFeRechazoObject } from '$lib/fe/format-rechazo';

	let { data, form } = $props();

	let xmlTab = $state<'firmado' | 'respuesta'>('firmado');
	let copyHint = $state('');

	const invoice = $derived(data.invoice);
	const fe = $derived(data.fe);
	const client = $derived(data.client);

	const xmlContent = $derived(
		xmlTab === 'firmado' ? (fe?.xml_firmado ?? '') : (fe?.respuesta_xml ?? '')
	);

	const tipoIdLabel = $derived(
		FE_TIPO_IDENTIFICACION_OPTIONS.find((o) => o.value === client.fe_tipo_identificacion)?.label ??
			client.fe_tipo_identificacion ??
			'—'
	);

	const feRechazo = $derived.by(() => {
		if (!fe) return null;
		if (fe.rechazo && Object.keys(fe.rechazo).length > 0) {
			return parseFeRechazoObject(fe.rechazo);
		}
		const err = fe.ultimo_error?.trim();
		if (err?.startsWith('{')) return parseFeRechazoFromStored(null, err);
		return null;
	});

	const feErrorPlain = $derived(
		fe && !feRechazo && fe.ultimo_error?.trim() ? fe.ultimo_error.trim() : null
	);

	const canEmitFe = $derived(
		data.hasActiveEmisor && data.facturadorOk && (!fe || !feComprobanteBlocksEmit(fe.estado))
	);
	const emitFeLabel = $derived(fe && feComprobanteCanReemit(fe.estado) ? 'Reemitir FE' : 'Generar factura');

	let emitModalOpen = $state(false);
	let emitFormEl = $state<HTMLFormElement | null>(null);
	let mediosPagoJson = $state('');
	let savingLineas = $state(false);
	let reconcilingMontos = $state(false);
	let emittingFe = $state(false);
	let consultingFe = $state(false);

	const feBusy = $derived(emittingFe || consultingFe);
	const lineAmountsNeedReconcile = $derived(data.lineAmountsNeedReconcile);

	function roundMoney(n: number): number {
		return Math.round(n * 100) / 100;
	}

	function lineSubtotal(cantidad: number, precio: number): number {
		return roundMoney(cantidad * precio);
	}

	function lineImpuesto(cantidad: number, precio: number, tarifa: number): number {
		return roundMoney(lineSubtotal(cantidad, precio) * (tarifa / 100));
	}

	let priceDrafts = $state<Record<string, string>>({});

	$effect(() => {
		const next: Record<string, string> = {};
		for (const l of invoice.lineas) {
			next[l.id] = String(l.precio_unitario);
		}
		priceDrafts = next;
	});

	const canEditLinePrices = $derived(!fe || fe.estado !== 'aceptado');

	const computedLineRows = $derived.by(() =>
		invoice.lineas.map((line: InvoiceLineDetail) => {
			const raw = priceDrafts[line.id] ?? String(line.precio_unitario);
			const precio = Number(raw);
			const precioValid = Number.isFinite(precio) && precio >= 0 ? precio : line.precio_unitario;
			const subtotal = lineSubtotal(line.cantidad, precioValid);
			const impuesto = lineImpuesto(line.cantidad, precioValid, line.impuesto_tarifa);
			return {
				...line,
				precio_unitario: precioValid,
				subtotal,
				impuesto,
				line_total: roundMoney(subtotal + impuesto)
			};
		})
	);

	const computedTotals = $derived(
		computeInvoiceTaxTotals(
			computedLineRows.map((l: { subtotal: number; impuesto_tarifa: number }) => ({
				subtotal: l.subtotal,
				impuesto_tarifa: l.impuesto_tarifa
			}))
		)
	);

	const lineasDirty = $derived(
		invoice.lineas.some((l: InvoiceLineDetail) => {
			const raw = priceDrafts[l.id];
			if (raw == null) return false;
			const n = Number(raw);
			return Number.isFinite(n) && Math.abs(n - l.precio_unitario) > 0.001;
		})
	);

	const totalsMismatch = $derived(
		Math.abs(computedTotals.subtotal - invoice.subtotal) > 0.01 ||
			Math.abs(computedTotals.impuesto - invoice.impuesto) > 0.01 ||
			Math.abs(computedTotals.total - invoice.total) > 0.01
	);

	function lineasPayloadJson(): string {
		return JSON.stringify(
			invoice.lineas.map((l: InvoiceLineDetail) => ({
				lineId: l.id,
				precio_unitario: Number(priceDrafts[l.id] ?? l.precio_unitario)
			}))
		);
	}

	function openEmitModal() {
		mediosPagoJson = '';
		emitModalOpen = true;
	}

	async function onMediosConfirm(medios: FeMedioPagoItem[]) {
		mediosPagoJson = JSON.stringify(medios);
		emittingFe = true;
		emitModalOpen = false;
		await tick();
		emitFormEl?.requestSubmit();
	}

	async function copyXml() {
		const text = xmlContent.trim();
		if (!text) return;
		try {
			await navigator.clipboard.writeText(text);
			copyHint = 'Copiado';
			setTimeout(() => (copyHint = ''), 2000);
		} catch {
			copyHint = 'No se pudo copiar';
		}
	}
</script>

{#if emittingFe}
	<div class="fe-emit-overlay" role="alertdialog" aria-modal="true" aria-busy="true" aria-live="polite">
		<div class="fe-emit-overlay__panel">
			<div class="fe-emit-overlay__spinner" aria-hidden="true"></div>
			<p class="fe-emit-overlay__title">
				{fe && feComprobanteCanReemit(fe.estado) ? 'Reemitiendo factura electrónica' : 'Generando factura electrónica'}
			</p>
			<p class="type-caption fe-emit-overlay__subtitle">{invoice.invoice_number}</p>
			<p class="type-caption">Firmando XML, enviando y consultando en Hacienda…</p>
		</div>
	</div>
{:else if consultingFe}
	<div class="fe-emit-overlay" role="alertdialog" aria-modal="true" aria-busy="true" aria-live="polite">
		<div class="fe-emit-overlay__panel">
			<div class="fe-emit-overlay__spinner" aria-hidden="true"></div>
			<p class="fe-emit-overlay__title">Consultando Hacienda</p>
			<p class="type-caption fe-emit-overlay__subtitle">{invoice.invoice_number}</p>
			<p class="type-caption">Obteniendo el estado del comprobante…</p>
		</div>
	</div>
{/if}

<div class="dash-page invoice-detail">
	<p class="type-caption" style="margin-bottom: var(--spacing-md);">
		<a href="/admin/facturas" class="text-link">← Volver a facturas</a>
	</p>

	<header class="invoice-detail__head dash-panel dash-panel--section">
		<div>
			<p class="type-caption invoice-detail__eyebrow">Factura interna</p>
			<h1 class="invoice-detail__title">{invoice.invoice_number}</h1>
			<p class="type-caption">
				<a href="/admin/clientes/{invoice.client_id}" class="text-link">{invoice.client_name}</a>
				· {invoice.client_clinica}
				· Caso
				<a href="/admin/casos/{invoice.case_id}" class="text-link">{invoice.case_number}</a>
				({invoice.paciente_name})
			</p>
		</div>
		<div class="invoice-detail__head-actions">
			<span class={getInvoiceEstadoClass(invoice.estado)}>{getInvoiceEstadoLabel(invoice.estado)}</span>
			{#if fe}
				<span class={getFeComprobanteEstadoClass(fe.estado)}>
					{getFeComprobanteEstadoLabel(fe.estado)}
				</span>
			{/if}
		</div>
	</header>

	{#if form?.message}
		<p
			class="invoice-detail__alert type-caption"
			class:invoice-detail__alert--ok={form.success === true}
			role="alert"
		>
			{form.message}
		</p>
	{/if}

	{#if !data.facturadorOk}
		<p class="invoice-detail__alert" role="alert">
			Facturador no disponible ({data.facturadorUrl}). {data.facturadorError}
		</p>
	{/if}

	<div class="invoice-detail__grid">
		<section class="dash-panel dash-panel--section">
			<h2 class="dash-panel__section-title">Fechas</h2>
			<dl class="invoice-detail__dl">
				<div><dt>Emisión</dt><dd>{formatDate(invoice.fecha_emision)}</dd></div>
				<div><dt>Vencimiento</dt><dd>{formatDate(invoice.fecha_vencimiento)}</dd></div>
			</dl>

			<form
				method="POST"
				action="?/updateEstado"
				class="invoice-detail__estado-form"
				use:enhance={() =>
					async ({ update }) => {
						await update({ reset: false });
						await invalidate('app:invoice-detail');
					}}
			>
				<input type="hidden" name="invoice_id" value={invoice.id} />
				<label class="field">
					<span class="field-label">Estado de cobro</span>
					<select class="field-select" name="estado" value={invoice.estado}>
						{#each INVOICE_ESTADOS as e (e.value)}
							<option value={e.value} selected={e.value === invoice.estado}>{e.label}</option>
						{/each}
					</select>
				</label>
				<button type="submit" class="btn-secondary-pill">Guardar estado</button>
			</form>
		</section>

		<section class="dash-panel dash-panel--section">
			<h2 class="dash-panel__section-title">Receptor (FE)</h2>
			<dl class="invoice-detail__dl">
				<div><dt>Nombre</dt><dd>{client.nombre}</dd></div>
				<div><dt>Correo portal</dt><dd>{client.email || '—'}</dd></div>
				<div><dt>Tipo ID</dt><dd>{tipoIdLabel}</dd></div>
				<div><dt>Identificación</dt><dd>{client.fe_numero_identificacion ?? '—'}</dd></div>
				<div><dt>Actividad económica</dt><dd>{client.fe_codigo_actividad ?? '—'}</dd></div>
				<div><dt>Correo FE</dt><dd>{client.fe_correo_facturacion ?? client.email ?? '—'}</dd></div>
			</dl>
		</section>
	</div>

	<section class="dash-panel dash-panel--section invoice-detail__lines-panel">
		<div class="invoice-detail__lines-head">
			<h2 class="dash-panel__section-title">Detalle de factura</h2>
			{#if canEditLinePrices && lineasDirty}
				<span class="invoice-detail__unsaved type-caption">Cambios sin guardar</span>
			{/if}
		</div>

		<div class="data-table-wrap">
			<table class="data-table invoice-detail__lines-table">
				<thead>
					<tr>
						<th>Descripción</th>
						<th class="invoice-detail__num">Cant.</th>
						<th>Unidad</th>
						<th>CABYS</th>
						<th class="invoice-detail__num">IVA %</th>
						<th class="invoice-detail__num">P. unit.</th>
						<th class="invoice-detail__num">Subtotal</th>
					</tr>
				</thead>
				<tbody>
					{#each computedLineRows as line (line.id)}
						<tr>
							<td>{line.descripcion}</td>
							<td class="invoice-detail__num">{line.cantidad}</td>
							<td>{line.fe_unidad_medida}</td>
							<td class="invoice-detail__mono">{line.fe_cabys ?? '—'}</td>
							<td class="invoice-detail__num">{line.impuesto_tarifa}%</td>
							<td class="invoice-detail__num">
								{#if canEditLinePrices}
									<input
										type="number"
										class="invoice-detail__price-input field-input"
										min="0"
										step="0.01"
										bind:value={priceDrafts[line.id]}
									/>
								{:else}
									{formatCurrency(line.precio_unitario)}
								{/if}
							</td>
							<td class="invoice-detail__num">{formatCurrency(line.subtotal)}</td>
						</tr>
					{/each}
				</tbody>
				<tfoot class="invoice-detail__totals">
					<tr>
						<td colspan="6" class="invoice-detail__totals-label">Subtotal</td>
						<td class="invoice-detail__num">{formatCurrency(computedTotals.subtotal)}</td>
					</tr>
					<tr>
						<td colspan="6" class="invoice-detail__totals-label">Impuesto (IVA)</td>
						<td class="invoice-detail__num">{formatCurrency(computedTotals.impuesto)}</td>
					</tr>
					<tr class="invoice-detail__totals-row--total">
						<td colspan="6" class="invoice-detail__totals-label">Total</td>
						<td class="invoice-detail__num invoice-detail__totals-total">
							{formatCurrency(computedTotals.total)}
						</td>
					</tr>
				</tfoot>
			</table>
		</div>

		{#if lineAmountsNeedReconcile}
			<p class="invoice-detail__totals-warn type-caption" role="status">
				Esta factura tiene montos desactualizados (p. ej. subtotal ≠ cantidad × precio unitario).
				Use <strong>Corregir montos</strong> para recalcular las líneas y totales en base de datos
				antes de emitir FE.
			</p>
		{:else if totalsMismatch}
			<p class="invoice-detail__totals-warn type-caption" role="status">
				Los totales en base de datos no coinciden con las líneas. Pulse <strong>Guardar</strong> para
				sincronizar antes de emitir FE.
			</p>
		{/if}

		{#if canEditLinePrices}
			<div class="invoice-detail__lines-actions">
				{#if lineAmountsNeedReconcile}
					<form
						method="POST"
						action="?/reconciliarMontos"
						use:enhance={() => {
							reconcilingMontos = true;
							return async ({ update }) => {
								try {
									await update({ reset: false });
									await invalidate('app:invoice-detail');
								} finally {
									reconcilingMontos = false;
								}
							};
						}}
					>
						<input type="hidden" name="invoice_id" value={invoice.id} />
						<button type="submit" class="btn-primary" disabled={reconcilingMontos || savingLineas}>
							{reconcilingMontos ? 'Corrigiendo…' : 'Corregir montos'}
						</button>
					</form>
				{/if}

				<form
					method="POST"
					action="?/updateLineas"
					class="invoice-detail__lines-save"
					use:enhance={() => {
						savingLineas = true;
						return async ({ update }) => {
							try {
								await update({ reset: false });
								await invalidate('app:invoice-detail');
							} finally {
								savingLineas = false;
							}
						};
					}}
				>
					<input type="hidden" name="invoice_id" value={invoice.id} />
					<input type="hidden" name="lineas_json" value={lineasPayloadJson()} />
					<button
						type="submit"
						class={lineAmountsNeedReconcile ? 'btn-secondary-pill' : 'btn-primary'}
						disabled={(!lineasDirty && !totalsMismatch) || savingLineas || reconcilingMontos}
					>
						{savingLineas ? 'Guardando…' : 'Guardar precios y totales'}
					</button>
				</form>
			</div>
		{:else if fe?.estado === 'aceptado'}
			<p class="type-caption invoice-detail__lines-locked">
				La FE está aceptada; los importes no se pueden editar aquí.
			</p>
		{/if}
	</section>

	<section class="dash-panel dash-panel--section">
		<h2 class="dash-panel__section-title">Factura electrónica (Hacienda)</h2>
		<p class="type-caption" style="margin-bottom: var(--spacing-md);">
			Ambiente de envío: {data.emitAmbiente === 'production' ? 'Producción' : 'Pruebas (staging)'}
		</p>

		{#if !fe}
			<p class="type-caption">Aún no hay comprobante electrónico registrado para esta factura.</p>
		{:else}
			<dl class="invoice-detail__dl invoice-detail__dl--fe">
				<div><dt>Estado</dt><dd>{getFeComprobanteEstadoLabel(fe.estado)}</dd></div>
				<div><dt>Consecutivo</dt><dd>{fe.consecutivo ?? fe.consecutivo_num}</dd></div>
				<div><dt>Clave</dt><dd class="invoice-detail__mono invoice-detail__clave">{fe.clave ?? '—'}</dd></div>
				<div><dt>HTTP Hacienda</dt><dd>{fe.hacienda_status ?? '—'}</dd></div>
				<div><dt>Moneda</dt><dd>{fe.moneda}</dd></div>
				<div><dt>Enviado</dt><dd>{fe.enviado_at ? formatDate(fe.enviado_at) : '—'}</dd></div>
				<div><dt>Resuelto</dt><dd>{fe.resuelto_at ? formatDate(fe.resuelto_at) : '—'}</dd></div>
				<div><dt>Subtotal FE</dt><dd>{formatCurrency(fe.subtotal)}</dd></div>
				<div><dt>Impuesto FE</dt><dd>{formatCurrency(fe.impuesto)}</dd></div>
				<div><dt>Total FE</dt><dd>{formatCurrency(fe.total)}</dd></div>
			</dl>

			{#if feRechazo}
				<FeRechazoDetail formatted={feRechazo} />
			{:else if feErrorPlain}
				<p class="invoice-detail__error" role="alert">{feErrorPlain}</p>
			{/if}
		{/if}

		{#if fe && feComprobanteCanReemit(fe.estado)}
			<p class="type-caption invoice-detail__reemit-hint">
				Corrija emisor, cliente o líneas (CABYS, dirección, etc.) y use <strong>Reemitir FE</strong> para
				generar un nuevo consecutivo y clave. El comprobante rechazado anterior se reemplaza en este registro.
			</p>
		{/if}

		<div class="invoice-detail__fe-actions">
			{#if canEmitFe}
				<form
					bind:this={emitFormEl}
					method="POST"
					action="?/emitir"
					class="fe-emit-form-hidden"
					aria-hidden="true"
					use:enhance={() => {
						return async ({ update }) => {
							emittingFe = true;
							try {
								await update({ reset: false });
								await invalidate('app:invoice-detail');
							} finally {
								emittingFe = false;
							}
						};
					}}
				>
					<input type="hidden" name="invoice_id" value={invoice.id} />
					<input type="hidden" name="medios_pago" value={mediosPagoJson} />
				</form>
				<button type="button" class="btn-primary" onclick={openEmitModal} disabled={feBusy}>
					{emittingFe ? 'Enviando…' : emitFeLabel}
				</button>
			{/if}
			{#if fe && feComprobanteCanConsultar(fe.estado) && fe.clave}
				<form
					method="POST"
					action="?/consultar"
					use:enhance={() => {
						consultingFe = true;
						return async ({ update }) => {
							try {
								await update({ reset: false });
								await invalidate('app:invoice-detail');
							} finally {
								consultingFe = false;
							}
						};
					}}
				>
					<input type="hidden" name="invoice_id" value={invoice.id} />
					<button type="submit" class="btn-secondary-pill" disabled={feBusy}>
						{consultingFe ? 'Consultando…' : 'Consultar Hacienda'}
					</button>
				</form>
			{/if}
		</div>
	</section>

	{#if fe && (fe.xml_firmado || fe.respuesta_xml)}
		<section class="dash-panel dash-panel--section">
			<div class="invoice-detail__xml-head">
				<h2 class="dash-panel__section-title">XML</h2>
				<div class="invoice-detail__xml-tabs">
					<button
						type="button"
						class="invoice-detail__xml-tab"
						class:invoice-detail__xml-tab--active={xmlTab === 'firmado'}
						disabled={!fe.xml_firmado}
						onclick={() => (xmlTab = 'firmado')}
					>
						XML firmado
					</button>
					<button
						type="button"
						class="invoice-detail__xml-tab"
						class:invoice-detail__xml-tab--active={xmlTab === 'respuesta'}
						disabled={!fe.respuesta_xml}
						onclick={() => (xmlTab = 'respuesta')}
					>
						Respuesta Hacienda
					</button>
					<button type="button" class="btn-secondary-pill" onclick={copyXml} disabled={!xmlContent.trim()}>
						{copyHint || 'Copiar'}
					</button>
				</div>
			</div>
			<textarea class="invoice-detail__xml" readonly value={xmlContent || 'Sin contenido.'}></textarea>
		</section>
	{/if}

	<FeMediosPagoModal
		bind:open={emitModalOpen}
		total={computedTotals.total}
		subtitle={`Factura ${invoice.invoice_number}`}
		onCancel={() => {}}
		onConfirm={onMediosConfirm}
	/>
</div>

<style>
	.invoice-detail__head {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: flex-start;
		gap: var(--spacing-md);
		margin-bottom: var(--spacing-lg);
	}

	.invoice-detail__eyebrow {
		margin: 0 0 0.25rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.invoice-detail__title {
		margin: 0 0 0.35rem;
		font-size: 1.5rem;
	}

	.invoice-detail__head-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
	}

	.invoice-detail__grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--spacing-lg);
		margin-bottom: var(--spacing-lg);
	}

	@media (max-width: 768px) {
		.invoice-detail__grid {
			grid-template-columns: 1fr;
		}
	}

	.invoice-detail__dl {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.65rem 1.25rem;
		margin: 0;
	}

	.invoice-detail__dl--fe {
		margin-bottom: var(--spacing-md);
	}

	.invoice-detail__dl div {
		min-width: 0;
	}

	.invoice-detail__dl dt {
		margin: 0;
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-muted-foreground, #64748b);
	}

	.invoice-detail__dl dd {
		margin: 0.15rem 0 0;
		font-size: 0.9375rem;
	}

	.invoice-detail__mono {
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.8125rem;
		word-break: break-all;
	}

	.invoice-detail__clave {
		grid-column: 1 / -1;
	}

	.invoice-detail__estado-form {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--spacing-md);
		margin-top: var(--spacing-lg);
		padding-top: var(--spacing-md);
		border-top: 1px solid var(--color-border, #e2e8f0);
	}

	.invoice-detail__estado-form .field {
		flex: 1;
		min-width: 10rem;
	}

	.invoice-detail__fe-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-sm);
		margin-top: var(--spacing-md);
	}

	.fe-emit-form-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.fe-emit-overlay {
		position: fixed;
		inset: 0;
		z-index: 200;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		background: rgb(15 23 42 / 45%);
		backdrop-filter: blur(2px);
	}

	.fe-emit-overlay__panel {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.65rem;
		padding: 1.75rem 2rem;
		min-width: min(20rem, calc(100vw - 2rem));
		border-radius: 10px;
		background: var(--color-card, #fff);
		border: 1px solid var(--color-border, #e2e8f0);
		box-shadow: 0 20px 48px rgb(15 23 42 / 25%);
		text-align: center;
	}

	.fe-emit-overlay__title {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
	}

	.fe-emit-overlay__subtitle {
		margin: 0;
		font-weight: 500;
	}

	.fe-emit-overlay__spinner {
		width: 2.25rem;
		height: 2.25rem;
		border: 3px solid color-mix(in srgb, var(--color-border, #cbd5e1) 60%, transparent);
		border-top-color: var(--color-primary, #0f172a);
		border-radius: 50%;
		animation: fe-emit-spin 0.75s linear infinite;
	}

	@keyframes fe-emit-spin {
		to {
			transform: rotate(360deg);
		}
	}

	.invoice-detail__reemit-hint {
		margin: var(--spacing-md) 0 0;
		max-width: 42rem;
		line-height: 1.45;
	}

	.invoice-detail__alert {
		margin: 0 0 var(--spacing-md);
		padding: 0.65rem 0.85rem;
		border-radius: 6px;
		background: color-mix(in srgb, var(--color-danger) 10%, transparent);
		color: var(--color-danger);
	}

	.invoice-detail__alert--ok {
		background: color-mix(in srgb, var(--color-success) 12%, transparent);
		color: var(--color-success);
	}

	.invoice-detail__error {
		margin: 0 0 var(--spacing-md);
		padding: 0.5rem 0.75rem;
		border-radius: 6px;
		font-size: 0.875rem;
		background: color-mix(in srgb, var(--color-danger) 10%, transparent);
		color: var(--color-danger);
	}

	.invoice-detail__pre {
		margin: 0 0 var(--spacing-md);
		padding: 0.75rem;
		overflow: auto;
		max-height: 12rem;
		font-size: 0.75rem;
		background: var(--color-muted, #f1f5f9);
		border-radius: 6px;
	}

	.invoice-detail__xml-head {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: var(--spacing-md);
		margin-bottom: var(--spacing-md);
	}

	.invoice-detail__xml-head .dash-panel__section-title {
		margin: 0;
	}

	.invoice-detail__xml-tabs {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}

	.invoice-detail__xml-tab {
		border: 1px solid var(--color-border, #e2e8f0);
		background: transparent;
		padding: 0.35rem 0.75rem;
		border-radius: 999px;
		font: inherit;
		font-size: 0.8125rem;
		cursor: pointer;
	}

	.invoice-detail__xml-tab--active {
		background: var(--color-primary, #0f172a);
		color: var(--color-primary-foreground, #fff);
		border-color: transparent;
	}

	.invoice-detail__xml-tab:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.invoice-detail__xml {
		width: 100%;
		min-height: 16rem;
		max-height: 32rem;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.75rem;
		line-height: 1.45;
		padding: 0.75rem;
		border: 1px solid var(--color-border, #e2e8f0);
		border-radius: 6px;
		resize: vertical;
	}

	.invoice-detail__lines-panel {
		margin-bottom: var(--spacing-lg);
	}

	.invoice-detail__lines-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: var(--spacing-md);
	}

	.invoice-detail__lines-head .dash-panel__section-title {
		margin: 0;
	}

	.invoice-detail__unsaved {
		color: var(--color-warning, #b45309);
	}

	.invoice-detail__num {
		text-align: right;
		white-space: nowrap;
	}

	.invoice-detail__price-input {
		width: 6.5rem;
		text-align: right;
		padding: 0.35rem 0.5rem;
		font-size: 0.875rem;
	}

	.invoice-detail__totals td {
		border-top: 1px solid var(--color-border, #e2e8f0);
		padding-top: 0.5rem;
		padding-bottom: 0.5rem;
	}

	.invoice-detail__totals-label {
		text-align: right;
		font-weight: 600;
		color: var(--color-muted-foreground, #64748b);
	}

	.invoice-detail__totals-row--total td {
		border-top-width: 2px;
		font-size: 1.0625rem;
	}

	.invoice-detail__totals-total {
		font-weight: 700;
	}

	.invoice-detail__lines-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--spacing-sm);
		margin-top: var(--spacing-md);
	}

	.invoice-detail__lines-save {
		margin-top: 0;
	}

	.invoice-detail__totals-warn {
		margin: var(--spacing-md) 0 0;
		color: var(--color-warning, #b45309);
	}

	.invoice-detail__lines-locked {
		margin: var(--spacing-md) 0 0;
		opacity: 0.85;
	}
</style>
