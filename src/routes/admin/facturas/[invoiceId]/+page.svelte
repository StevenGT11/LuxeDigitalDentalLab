<script lang="ts">
	import { enhance, deserialize, applyAction } from '$app/forms';
	import { goto, invalidate } from '$app/navigation';
	import { tick } from 'svelte';
	import FeMediosPagoModal, {
		type FeMediosPagoConfirm
	} from '$lib/components/fe/FeMediosPagoModal.svelte';
	import InvoicePdfPreview from '$lib/components/lab/InvoicePdfPreview.svelte';
	import FeNotaEmitModal from '$lib/components/fe/FeNotaEmitModal.svelte';
	import FeCorreosField from '$lib/components/fe/FeCorreosField.svelte';
	import { formatFeCorreosLabel } from '$lib/fe/fe-correos';
	import type { FeMedioPagoItem } from '$lib/fe/medios-pago';
	import {
		feComprobanteBlocksEmit,
		feComprobanteCanReemit,
		feComprobanteCanConsultar,
		feComprobanteNeedsEnviar,
		FE_TIPO_IDENTIFICACION_OPTIONS,
		getFeComprobanteEstadoClass,
		getFeComprobanteEstadoLabel,
		getFeTipoDocumentoLabel
	} from '$lib/fe/constants';
	import {
		getInvoiceEstadoClass,
		getInvoiceEstadoLabel,
		INVOICE_ESTADOS
	} from '$lib/lab/invoice-estado';
	import { formatCurrency, formatDate } from '$lib/lab/helpers';
	import { computeInvoiceTaxTotals } from '$lib/lab/invoice-tax';
	import type { InvoiceLineDetail } from '$lib/lab/invoice-detail.server';
	import FeProcessingBanner from '$lib/components/fe/FeProcessingBanner.svelte';
	import FeRechazoDetail from '$lib/components/fe/FeRechazoDetail.svelte';
	import { parseFeRechazoFromStored, parseFeRechazoObject } from '$lib/fe/format-rechazo';
	import { defaultRazonForCodigo } from '$lib/fe/fe-referencia';
	import type { FeComprobanteEstado } from '$lib/fe/types';
	import {
		canReemitFacturaTrasNc as computeReemitFacturaEligible,
		isFeEstadoAceptado,
		isNotaCreditoAceptada,
		isNotaCreditoComprobante
	} from '$lib/fe/reemit-factura';

	let { data, form } = $props();

	let xmlTab = $state<'firmado' | 'respuesta'>('firmado');
	let copyHint = $state('');

	const invoice = $derived(data.invoice);
	const fe = $derived(data.fe);
	const notas = $derived(data.notas ?? []);
	const client = $derived(data.client);

	const tipoIdLabel = $derived(
		FE_TIPO_IDENTIFICACION_OPTIONS.find((o) => o.value === client.fe_tipo_identificacion)?.label ??
			client.fe_tipo_identificacion ??
			'—'
	);

	let emittingFe = $state(false);
	let emittingNota = $state(false);
	let reemittingFactura = $state(false);
	let consultingFe = $state(false);
	let consultingNotaId = $state<string | null>(null);
	let sendingFeEmail = $state(false);
	let extraCorreos = $state('');

	const feBusy = $derived(
		emittingFe ||
			consultingFe ||
			emittingNota ||
			consultingNotaId !== null ||
			reemittingFactura ||
			sendingFeEmail
	);

	let lastFe = $state<(typeof data.fe)>(null);
	let pendingFeEstado = $state<FeComprobanteEstado | null>(null);

	$effect(() => {
		if (fe) lastFe = fe;
	});

	$effect(() => {
		if (fe && (isFeEstadoAceptado(fe.estado) || fe.estado === 'rechazado' || fe.estado === 'error')) {
			pendingFeEstado = null;
		}
	});

	/** Estado FE unificado: datos recargados + snapshot mientras procesa + estado devuelto por la acción. */
	const feDisplay = $derived.by(() => {
		const base = fe ?? (feBusy && lastFe ? lastFe : null);
		if (!base) return null;
		if (pendingFeEstado) return { ...base, estado: pendingFeEstado };
		return base;
	});

	const feAceptada = $derived(
		isFeEstadoAceptado(feDisplay?.estado) || pendingFeEstado === 'aceptado'
	);

	const feProcessingBanner = $derived.by(() => {
		if (emittingFe) {
			return {
				title:
					fe && feComprobanteCanReemit(fe.estado)
						? 'Reemitiendo factura electrónica'
						: 'Generando factura electrónica',
				subtitle: invoice.invoice_number,
				detail: 'Firmando XML, enviando y consultando en Hacienda…'
			};
		}
		if (emittingNota) {
			return {
				title: 'Emitiendo nota de crédito/débito',
				subtitle: invoice.invoice_number,
				detail: 'Firmando XML, enviando y consultando en Hacienda…'
			};
		}
		if (reemittingFactura) {
			return {
				title: 'Reemitiendo factura',
				subtitle: invoice.invoice_number,
				detail: 'Creando copia corregida con los mismos ítems…'
			};
		}
		if (consultingFe || consultingNotaId) {
			return {
				title: 'Consultando Hacienda',
				subtitle: invoice.invoice_number,
				detail: 'Obteniendo el estado del comprobante…'
			};
		}
		return null;
	});

	const xmlContent = $derived(
		xmlTab === 'firmado' ? (feDisplay?.xml_firmado ?? '') : (feDisplay?.respuesta_xml ?? '')
	);

	const feRechazo = $derived.by(() => {
		if (!feDisplay) return null;
		if (feDisplay.rechazo && Object.keys(feDisplay.rechazo).length > 0) {
			return parseFeRechazoObject(feDisplay.rechazo);
		}
		const err = feDisplay.ultimo_error?.trim();
		if (err?.startsWith('{')) return parseFeRechazoFromStored(null, err);
		return null;
	});

	const feErrorPlain = $derived(
		feDisplay && !feRechazo && feDisplay.ultimo_error?.trim()
			? feDisplay.ultimo_error.trim()
			: null
	);

	const canEmitFe = $derived(
		data.hasActiveEmisor &&
			data.facturadorOk &&
			(!fe || !feComprobanteBlocksEmit(fe.estado)) &&
			(!data.correctionContext || data.correctionContext.sourceNcAceptada)
	);
	const correctionFeBlocked = $derived(
		Boolean(data.correctionContext && !data.correctionContext.sourceNcAceptada)
	);
	const isCorrectionInvoice = $derived(Boolean(invoice.source_invoice_id && data.correctionContext));
	const notaNcAceptada = $derived(notas.some(isNotaCreditoAceptada));
	const canReemitFacturaTrasNc = $derived(
		data.reemitFacturaEligible ??
			computeReemitFacturaEligible({
				feEstado: fe?.estado,
				notas
			})
	);

	const notaNcPendienteCorreccion = $derived(
		feAceptada &&
			!notaNcAceptada &&
			notas.some((n) => isNotaCreditoComprobante(n) && n.estado !== 'aceptado')
	);
	const emitFeLabel = $derived(fe && feComprobanteCanReemit(fe.estado) ? 'Reemitir FE' : 'Generar factura');

	let pdfPreviewOpen = $state(false);
	let emitModalOpen = $state(false);
	let notaModalOpen = $state(false);
	let emitFormEl = $state<HTMLFormElement | null>(null);
	let mediosPagoJson = $state('');
	let emitMoneda = $state('USD');
	let emitTipoCambio = $state('1');
	let mediosModalMode = $state<'fe' | 'nota'>('fe');
	let notaDraft = $state<{
		tipoDocumento: '02' | '03';
		codigoReferencia: string;
		razon: string;
		feComprobanteId?: string;
	} | null>(null);
	let notaFormTipo = $state('');
	let notaFormCodigo = $state('');
	let notaFormRazon = $state('');
	let notaFormFeId = $state('');
	let reemitNotaId = $state<string | undefined>(undefined);
	let savingLineas = $state(false);
	let reconcilingMontos = $state(false);
	let feFeedback = $state<{ kind: 'success' | 'error'; message: string } | null>(null);

	const canEmitNota = $derived(
		data.hasActiveEmisor &&
			data.facturadorOk &&
			feAceptada &&
			Boolean(feDisplay?.clave)
	);
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

	const mediosModalTotal = $derived(
		mediosModalMode === 'nota' ? (fe?.total ?? computedTotals.total) : computedTotals.total
	);
	const mediosModalSubtitle = $derived(
		mediosModalMode === 'nota'
			? `Nota — ${invoice.invoice_number}`
			: `Factura ${invoice.invoice_number}`
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

	function notaRechazoDetail(nota: (typeof notas)[number]) {
		return parseFeRechazoFromStored(nota.rechazo, nota.ultimo_error);
	}

	function notaShowRechazo(nota: (typeof notas)[number]): boolean {
		return (
			nota.estado === 'rechazado' ||
			nota.estado === 'error' ||
			Boolean(nota.ultimo_error?.trim()) ||
			Boolean(nota.rechazo && Object.keys(nota.rechazo).length > 0)
		);
	}

	function lineasPayloadJson(): string {
		return JSON.stringify(
			invoice.lineas.map((l: InvoiceLineDetail) => ({
				lineId: l.id,
				precio_unitario: Number(priceDrafts[l.id] ?? l.precio_unitario)
			}))
		);
	}

	function openEmitModal() {
		mediosModalMode = 'fe';
		mediosPagoJson = '';
		emitModalOpen = true;
	}

	function setNotaFormFields(draft: {
		tipoDocumento: '02' | '03';
		codigoReferencia: string;
		razon: string;
		feComprobanteId?: string;
	}) {
		notaFormTipo = draft.tipoDocumento;
		notaFormCodigo = draft.codigoReferencia;
		notaFormRazon = draft.razon;
		notaFormFeId = draft.feComprobanteId ?? '';
	}

	function openNotaModal(reemitId?: string) {
		reemitNotaId = reemitId;
		notaModalOpen = true;
	}

	function enviarNotaPendiente(nota: (typeof notas)[number]) {
		setNotaFormFields({
			tipoDocumento: nota.tipo_documento as '02' | '03',
			codigoReferencia: nota.referencia_codigo ?? '01',
			razon:
				nota.referencia_razon ??
				defaultRazonForCodigo(
					nota.referencia_codigo ?? '01',
					nota.tipo_documento === '02' ? '02' : '03'
				),
			feComprobanteId: nota.id
		});
		void emitNotaAction();
	}

	async function emitNotaAction(medios?: FeMedioPagoItem[]) {
		if (!notaFormTipo || !notaFormCodigo || !notaFormRazon) {
			feFeedback = { kind: 'error', message: 'Complete tipo, motivo y razón de la nota.' };
			return;
		}

		emittingNota = true;
		feFeedback = null;

		const formData = new FormData();
		formData.set('invoice_id', invoice.id);
		formData.set('tipo_documento', notaFormTipo);
		formData.set('codigo_referencia', notaFormCodigo);
		formData.set('razon', notaFormRazon);
		if (notaFormFeId) formData.set('fe_comprobante_id', notaFormFeId);
		if (medios?.length) formData.set('medios_pago', JSON.stringify(medios));

		try {
			const response = await fetch('?/emitirNota', { method: 'POST', body: formData });
			const result = deserialize(await response.text());
			await applyAction(result);

			if (result.type === 'success') {
				const data = result.data as Record<string, unknown> | undefined;
				applyActionFeEstado(data);
				feFeedback = {
					kind: 'success',
					message: actionResultMessage(data, 'Nota enviada a Hacienda.')
				};
				notaDraft = null;
				await invalidate('app:invoice-detail');
			} else if (result.type === 'failure') {
				feFeedback = {
					kind: 'error',
					message: actionResultMessage(result.data as Record<string, unknown>, 'No se pudo emitir la nota.')
				};
				await invalidate('app:invoice-detail');
			}
		} catch {
			feFeedback = { kind: 'error', message: 'No se pudo enviar la nota a Hacienda.' };
		} finally {
			emittingNota = false;
		}
	}

	function onNotaModalConfirm(draft: {
		tipoDocumento: '02' | '03';
		codigoReferencia: string;
		razon: string;
	}) {
		notaDraft = { ...draft, feComprobanteId: reemitNotaId };
		setNotaFormFields({ ...notaDraft, feComprobanteId: reemitNotaId });
		reemitNotaId = undefined;
		void emitNotaAction();
	}

	function openNotaMediosModal() {
		mediosModalMode = 'nota';
		mediosPagoJson = '';
		emitModalOpen = true;
	}

	function onNotaModalMedios(draft: {
		tipoDocumento: '02' | '03';
		codigoReferencia: string;
		razon: string;
	}) {
		notaDraft = { ...draft, feComprobanteId: reemitNotaId };
		setNotaFormFields({ ...notaDraft, feComprobanteId: reemitNotaId });
		reemitNotaId = undefined;
		openNotaMediosModal();
	}

	async function onMediosConfirm(result: FeMediosPagoConfirm) {
		feFeedback = null;
		emitModalOpen = false;
		if (mediosModalMode === 'nota') {
			await emitNotaAction(result.medios);
			return;
		}
		mediosPagoJson = JSON.stringify(result.medios);
		emitMoneda = result.moneda;
		emitTipoCambio = String(result.tipoCambio);
		await tick();
		emittingFe = true;
		emitFormEl?.requestSubmit();
	}

	function actionResultMessage(data: Record<string, unknown> | undefined, fallback: string): string {
		return typeof data?.message === 'string' && data.message.trim() ? data.message : fallback;
	}

	function applyActionFeEstado(data: Record<string, unknown> | undefined) {
		const raw = data?.feEstado;
		if (typeof raw === 'string' && raw.trim()) {
			pendingFeEstado = raw as FeComprobanteEstado;
		}
	}

	async function afterFeFormAction(
		result: import('@sveltejs/kit').ActionResult,
		update: (opts?: { reset?: boolean }) => Promise<void>
	) {
		await update({ reset: false });
		if (result.type === 'success') {
			const data = result.data as Record<string, unknown> | undefined;
			applyActionFeEstado(data);
			feFeedback = {
				kind: 'success',
				message: actionResultMessage(data, 'Operación completada.')
			};
			const redirectTo = typeof data?.redirectTo === 'string' ? data.redirectTo : null;
			if (redirectTo) {
				await goto(redirectTo);
				return;
			}
			await invalidate('app:invoice-detail');
		} else if (result.type === 'failure') {
			feFeedback = {
				kind: 'error',
				message: actionResultMessage(result.data as Record<string, unknown>, 'No se pudo completar la operación.')
			};
			await invalidate('app:invoice-detail');
		}
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
	{#if feProcessingBanner}
		<FeProcessingBanner
			title={feProcessingBanner.title}
			subtitle={feProcessingBanner.subtitle}
			detail={feProcessingBanner.detail}
		/>
	{/if}

	<div class="invoice-detail__main" class:fe-processing-blocked={feBusy}>
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
			<button type="button" class="btn-secondary-pill" onclick={() => (pdfPreviewOpen = true)}>
				PDF
			</button>
			<span class={getInvoiceEstadoClass(invoice.estado, feDisplay?.estado)}>{getInvoiceEstadoLabel(invoice.estado)}</span>
			{#if feDisplay}
				<span class={getFeComprobanteEstadoClass(feDisplay.estado)}>
					{getFeComprobanteEstadoLabel(feDisplay.estado)}
				</span>
			{/if}
		</div>
	</header>

		{#if isCorrectionInvoice && data.correctionContext}
			{#if correctionFeBlocked}
				<p class="invoice-detail__alert invoice-detail__alert--pre" role="alert">
					Esta factura es una corrección de
					<a href="/admin/facturas/{data.correctionContext.sourceInvoiceId}" class="text-link">
						{data.correctionContext.sourceInvoiceNumber}
					</a>.
					Debe existir una <strong>nota de crédito aceptada</strong> en la factura original antes de emitir la
					nueva FE. Corrija y reenvíe la NC hasta que Hacienda la acepte.
				</p>
			{:else if feAceptada}
				<p class="invoice-detail__alert invoice-detail__alert--ok" role="status">
					<strong>Factura corregida.</strong>
					Copia de
					<a href="/admin/facturas/{data.correctionContext.sourceInvoiceId}" class="text-link">
						{data.correctionContext.sourceInvoiceNumber}
					</a>.
					{#if canReemitFacturaTrasNc}
						Tras la NC aceptada en esta factura, use <strong>Reemitir factura</strong> para crear otra copia
						corregida.
					{:else if data.correctionInvoice}
						Ya existe una copia posterior:
						<a href="/admin/facturas/{data.correctionInvoice.id}" class="text-link">
							{data.correctionInvoice.invoice_number}
						</a>.
					{:else}
						Si necesita corregir de nuevo, emita una NC aquí y luego use <strong>Reemitir factura</strong>.
					{/if}
				</p>
			{:else}
				<p class="invoice-detail__alert invoice-detail__alert--ok" role="status">
					<strong>Factura corregida.</strong>
					Copia de
					<a href="/admin/facturas/{data.correctionContext.sourceInvoiceId}" class="text-link">
						{data.correctionContext.sourceInvoiceNumber}
					</a>
					— emita la nueva FE en esta factura cuando los datos estén listos.
				</p>
			{/if}
		{/if}

		{#if feFeedback || form?.message}
		<div
			class="invoice-detail__alert"
			class:invoice-detail__alert--ok={feFeedback?.kind === 'success' || (!feFeedback && form?.success === true)}
			class:invoice-detail__alert--pre={feFeedback?.kind === 'error' || (!feFeedback && form?.success !== true)}
			role="alert"
		>
			{feFeedback?.message ?? form?.message}
		</div>
	{/if}

	{#if !data.facturadorOk && !feBusy}
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
				<div><dt>Correo FE</dt><dd>{formatFeCorreosLabel(client.fe_correo_facturacion, client.email)}</dd></div>
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
		{:else if feAceptada}
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

		{#if !feDisplay}
			{#if feBusy}
				<p class="type-caption">Procesando comprobante con Hacienda…</p>
			{:else}
				<p class="type-caption">Aún no hay comprobante electrónico registrado para esta factura.</p>
			{/if}
		{:else}
			<dl class="invoice-detail__dl invoice-detail__dl--fe">
				<div><dt>Estado</dt><dd>{getFeComprobanteEstadoLabel(feDisplay.estado)}</dd></div>
				<div><dt>Consecutivo</dt><dd>{feDisplay.consecutivo ?? feDisplay.consecutivo_num}</dd></div>
				<div><dt>Clave</dt><dd class="invoice-detail__mono invoice-detail__clave">{feDisplay.clave ?? '—'}</dd></div>
				<div><dt>HTTP Hacienda</dt><dd>{feDisplay.hacienda_status ?? '—'}</dd></div>
				<div><dt>Moneda</dt><dd>{feDisplay.moneda}</dd></div>
				<div><dt>Enviado</dt><dd>{feDisplay.enviado_at ? formatDate(feDisplay.enviado_at) : '—'}</dd></div>
				<div><dt>Resuelto</dt><dd>{feDisplay.resuelto_at ? formatDate(feDisplay.resuelto_at) : '—'}</dd></div>
				<div><dt>Subtotal FE</dt><dd>{formatCurrency(feDisplay.subtotal)}</dd></div>
				<div><dt>Impuesto FE</dt><dd>{formatCurrency(feDisplay.impuesto)}</dd></div>
				<div><dt>Total FE</dt><dd>{formatCurrency(feDisplay.total)}</dd></div>
			</dl>

			{#if feRechazo}
				<FeRechazoDetail formatted={feRechazo} />
			{:else if feErrorPlain}
				<p class="invoice-detail__error" role="alert">{feErrorPlain}</p>
			{/if}
		{/if}

		{#if feFeedback}
			<div
				class="invoice-detail__fe-feedback"
				class:invoice-detail__fe-feedback--ok={feFeedback.kind === 'success'}
				class:invoice-detail__fe-feedback--error={feFeedback.kind === 'error'}
				role="alert"
			>
				{feFeedback.message}
			</div>
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
						return async ({ update, result }) => {
							emittingFe = true;
							feFeedback = null;
							try {
								await afterFeFormAction(result, update);
							} finally {
								emittingFe = false;
							}
						};
					}}
				>
					<input type="hidden" name="invoice_id" value={invoice.id} />
					<input type="hidden" name="medios_pago" value={mediosPagoJson} />
					<input type="hidden" name="moneda" value={emitMoneda} />
					<input type="hidden" name="tipo_cambio" value={emitTipoCambio} />
					<input type="hidden" name="extra_correos" value={extraCorreos} />
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
						feFeedback = null;
						return async ({ update, result }) => {
							try {
								await afterFeFormAction(result, update);
							} finally {
								consultingFe = false;
							}
						};
					}}
				>
					<input type="hidden" name="invoice_id" value={invoice.id} />
					<input type="hidden" name="extra_correos" value={extraCorreos} />
					<button type="submit" class="btn-secondary-pill" disabled={feBusy}>
						{consultingFe ? 'Consultando…' : 'Consultar Hacienda'}
					</button>
				</form>
			{/if}
		</div>

		<div class="invoice-detail__fe-copy">
			<FeCorreosField
				bind:value={extraCorreos}
				name="extra_correos_ui"
				label="Copia a otros correos"
				placeholder="otro@clinica.com, contabilidad@clinica.com"
			/>
			{#if feAceptada}
				<form
					method="POST"
					action="?/enviarPaquete"
					use:enhance={() => {
						sendingFeEmail = true;
						feFeedback = null;
						return async ({ update, result }) => {
							try {
								await afterFeFormAction(result, update);
							} finally {
								sendingFeEmail = false;
							}
						};
					}}
				>
					<input type="hidden" name="invoice_id" value={invoice.id} />
					<input type="hidden" name="extra_correos" value={extraCorreos} />
					<button type="submit" class="btn-secondary-pill" disabled={feBusy || !extraCorreos.trim()}>
						{sendingFeEmail ? 'Enviando…' : 'Enviar copia ahora'}
					</button>
				</form>
			{/if}
			<p class="type-caption">
				El cliente sigue como destinatario. Estos correos van en copia (CC). Si la FE ya está aceptada,
				use «Enviar copia ahora» sin volver a Hacienda.
			</p>
		</div>
	</section>

	{#if feAceptada}
		<section class="dash-panel dash-panel--section">
			<div class="invoice-detail__lines-head">
				<h2 class="dash-panel__section-title">Notas de crédito / débito</h2>
				<div class="invoice-detail__notas-head-actions">
					{#if canReemitFacturaTrasNc}
						{#if data.correctionInvoice}
							<a
								href="/admin/facturas/{data.correctionInvoice.id}"
								class="btn-primary invoice-detail__correction-link"
							>
								Ir a factura corregida
							</a>
						{:else}
							<form
								method="POST"
								action="?/crearFacturaCorreccion"
								use:enhance={() => {
									feFeedback = null;
									reemittingFactura = true;
									return async ({ result, update }) => {
										try {
											await update({ reset: false });
											if (result.type === 'success') {
												const payload = result.data as Record<string, unknown> | undefined;
												feFeedback = {
													kind: 'success',
													message: actionResultMessage(payload, 'Factura corregida lista.')
												};
												const redirectTo =
													typeof payload?.redirectTo === 'string' ? payload.redirectTo : null;
												if (redirectTo) {
													await goto(redirectTo);
													return;
												}
												await invalidate('app:invoice-detail');
											} else if (result.type === 'failure') {
												feFeedback = {
													kind: 'error',
													message: actionResultMessage(
														result.data as Record<string, unknown>,
														'No se pudo crear la factura corregida.'
													)
												};
											}
										} finally {
											reemittingFactura = false;
										}
									};
								}}
							>
								<input type="hidden" name="invoice_id" value={invoice.id} />
								<button type="submit" class="btn-primary" disabled={feBusy}>
									Reemitir factura
								</button>
							</form>
						{/if}
					{/if}
					{#if canEmitNota}
						<button type="button" class="btn-primary-pill" onclick={() => openNotaModal()} disabled={feBusy}>
							Emitir y enviar a Hacienda
						</button>
					{/if}
				</div>
			</div>

			{#if canReemitFacturaTrasNc}
				<div class="invoice-detail__reemit-nc">
					<p class="type-caption">
						La nota de crédito fue aceptada por Hacienda. Cree una nueva factura interna con los mismos ítems
						y emita la FE corregida en esa copia.
						{#if data.correctionInvoice}
							Ya existe
							<a href="/admin/facturas/{data.correctionInvoice.id}" class="text-link">
								{data.correctionInvoice.invoice_number}
							</a>.
						{/if}
					</p>
				</div>
			{/if}

			{#if notaNcPendienteCorreccion}
				<p class="invoice-detail__alert invoice-detail__alert--pre" role="alert">
					Hay una nota de crédito sin aceptar (rechazada, en trámite o sin enviar). Debe quedar
					<strong>aceptada por Hacienda</strong> antes de crear la factura corregida o emitir una nueva FE sobre la original.
				</p>
			{/if}

			{#if notas.length === 0}
				<p class="type-caption">No hay notas emitidas para esta factura.</p>
			{:else}
				<div class="data-table-wrap">
					<table class="data-table">
						<thead>
							<tr>
								<th>Tipo</th>
								<th>Estado</th>
								<th>Clave</th>
								<th>Total</th>
								<th>Enviado</th>
								<th>Acciones</th>
							</tr>
						</thead>
						<tbody>
							{#each notas as nota (nota.id)}
								<tr>
									<td>{getFeTipoDocumentoLabel(nota.tipo_documento)}</td>
									<td>
										<span class={getFeComprobanteEstadoClass(nota.estado)}>
											{getFeComprobanteEstadoLabel(nota.estado)}
										</span>
									</td>
									<td class="invoice-detail__mono" title={nota.clave ?? ''}>
										{nota.clave ? `…${nota.clave.slice(-10)}` : '—'}
									</td>
									<td>{formatCurrency(nota.total)}</td>
									<td>{nota.enviado_at ? formatDate(nota.enviado_at) : '—'}</td>
									<td class="invoice-detail__nota-actions">
										{#if feComprobanteNeedsEnviar(nota.estado)}
											<button
												type="button"
												class="btn-primary-pill btn-secondary-pill--sm"
												disabled={feBusy}
												onclick={() => enviarNotaPendiente(nota)}
											>
												Enviar a Hacienda
											</button>
										{/if}
										{#if feComprobanteCanReemit(nota.estado)}
											<button
												type="button"
												class="btn-secondary-pill btn-secondary-pill--sm"
												disabled={feBusy}
												onclick={() => openNotaModal(nota.id)}
											>
												Reemitir
											</button>
										{/if}
										{#if feComprobanteCanConsultar(nota.estado) && nota.clave}
											<form
												method="POST"
												action="?/consultarNota"
												use:enhance={() => {
													consultingNotaId = nota.id;
													feFeedback = null;
													return async ({ update, result }) => {
														try {
															await afterFeFormAction(result, update);
														} finally {
															consultingNotaId = null;
														}
													};
												}}
											>
												<input type="hidden" name="fe_comprobante_id" value={nota.id} />
												<button type="submit" class="btn-secondary-pill btn-secondary-pill--sm" disabled={feBusy}>
													{consultingNotaId === nota.id ? 'Consultando…' : 'Consultar'}
												</button>
											</form>
										{/if}
									</td>
								</tr>
								{#if notaShowRechazo(nota)}
									{@const rechazo = notaRechazoDetail(nota)}
									<tr>
										<td colspan="6" class="invoice-detail__nota-rechazo">
											{#if rechazo}
												<FeRechazoDetail formatted={rechazo} />
											{:else}
												<div class="invoice-detail__error" role="alert">
													Rechazada por Hacienda. Use «Consultar» para actualizar el detalle o «Reemitir» tras corregir los datos.
												</div>
											{/if}
										</td>
									</tr>
								{/if}
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>
	{/if}

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
	</div>

	<FeNotaEmitModal
		bind:open={notaModalOpen}
		onConfirm={onNotaModalConfirm}
		onMedios={onNotaModalMedios}
	/>

	<InvoicePdfPreview
		bind:open={pdfPreviewOpen}
		invoiceId={invoice.id}
		invoiceNumber={invoice.invoice_number}
	/>

	<FeMediosPagoModal
		bind:open={emitModalOpen}
		total={mediosModalTotal}
		subtitle={mediosModalSubtitle}
		showCurrency={mediosModalMode === 'fe'}
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

	.invoice-detail__fe-copy {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
		margin-top: var(--spacing-md);
		max-width: 32rem;
	}

	.invoice-detail__nota-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		align-items: center;
	}

	.invoice-detail__nota-rechazo {
		padding-top: 0;
		padding-bottom: var(--spacing-md);
		vertical-align: top;
	}

	.invoice-detail__nota-rechazo :global(.fe-rechazo) {
		margin-bottom: 0;
	}

	.btn-secondary-pill--sm {
		padding: 0.35rem 0.75rem;
		font-size: 0.8125rem;
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

	.invoice-detail__notas-head-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}

	.invoice-detail__reemit-nc {
		margin: 0 0 var(--spacing-md);
		padding: var(--spacing-md);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--color-primary) 4%, transparent);
	}

	.invoice-detail__reemit-nc p {
		margin: 0;
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

	.invoice-detail__alert--pre {
		white-space: pre-wrap;
		line-height: 1.45;
		font-size: 0.875rem;
	}

	.invoice-detail__fe-feedback {
		margin: var(--spacing-md) 0 0;
		padding: 0.75rem 0.9rem;
		border-radius: 6px;
		font-size: 0.875rem;
		line-height: 1.45;
		white-space: pre-wrap;
	}

	.invoice-detail__fe-feedback--error {
		background: color-mix(in srgb, var(--color-danger) 10%, transparent);
		color: var(--color-danger);
		border: 1px solid color-mix(in srgb, var(--color-danger) 25%, transparent);
	}

	.invoice-detail__fe-feedback--ok {
		background: color-mix(in srgb, var(--color-success) 12%, transparent);
		color: var(--color-success);
		border: 1px solid color-mix(in srgb, var(--color-success) 25%, transparent);
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
