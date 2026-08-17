<script lang="ts">
	import { enhance } from '$app/forms';
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
	} from '$lib/lab/constants';
	import { formatCurrency, formatDate } from '$lib/lab/helpers';
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

	function openEmitModal() {
		mediosPagoJson = '';
		emitModalOpen = true;
	}

	async function onMediosConfirm(medios: FeMedioPagoItem[]) {
		mediosPagoJson = JSON.stringify(medios);
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
			Facturador no disponible en <code>{data.facturadorUrl}</code>. {data.facturadorError}
		</p>
	{/if}

	<div class="invoice-detail__grid">
		<section class="dash-panel dash-panel--section">
			<h2 class="dash-panel__section-title">Importes y fechas</h2>
			<dl class="invoice-detail__dl">
				<div><dt>Subtotal</dt><dd>{formatCurrency(invoice.subtotal)}</dd></div>
				<div><dt>Impuesto</dt><dd>{formatCurrency(invoice.impuesto)}</dd></div>
				<div><dt>Total</dt><dd class="type-body-strong">{formatCurrency(invoice.total)}</dd></div>
				<div><dt>Emisión</dt><dd>{formatDate(invoice.fecha_emision)}</dd></div>
				<div><dt>Vencimiento</dt><dd>{formatDate(invoice.fecha_vencimiento)}</dd></div>
			</dl>

			<form
				method="POST"
				action="?/updateEstado"
				class="invoice-detail__estado-form"
				use:enhance={() =>
					async ({ update }) => {
						await update({ reset: false, invalidateAll: true });
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

	<section class="dash-panel dash-panel--section">
		<h2 class="dash-panel__section-title">Líneas de factura</h2>
		<div class="data-table-wrap">
			<table class="data-table">
				<thead>
					<tr>
						<th>Descripción</th>
						<th>Cant.</th>
						<th>P. unit.</th>
						<th>Subtotal</th>
						<th>CABYS</th>
						<th>IVA %</th>
						<th>Unidad</th>
					</tr>
				</thead>
				<tbody>
					{#each invoice.lineas as line (line.id)}
						<tr>
							<td>{line.descripcion}</td>
							<td>{line.cantidad}</td>
							<td>{formatCurrency(line.precio_unitario)}</td>
							<td>{formatCurrency(line.subtotal)}</td>
							<td class="invoice-detail__mono">{line.fe_cabys ?? '—'}</td>
							<td>{line.impuesto_tarifa}%</td>
							<td>{line.fe_unidad_medida}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
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
					use:enhance={() =>
						async ({ update }) => {
							await update({ reset: false, invalidateAll: true });
						}}
				>
					<input type="hidden" name="invoice_id" value={invoice.id} />
					<input type="hidden" name="medios_pago" value={mediosPagoJson} />
				</form>
				<button type="button" class="btn-primary" onclick={openEmitModal}>{emitFeLabel}</button>
			{/if}
			{#if fe && feComprobanteCanConsultar(fe.estado) && fe.clave}
				<form
					method="POST"
					action="?/consultar"
					use:enhance={() =>
						async ({ update }) => {
							await update({ reset: false, invalidateAll: true });
						}}
				>
					<input type="hidden" name="invoice_id" value={invoice.id} />
					<button type="submit" class="btn-secondary-pill">Consultar Hacienda</button>
				</form>
			{/if}
			<a href="/admin/factura-electronica" class="btn-secondary-pill">Configuración emisor</a>
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
		total={invoice.total}
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
</style>
