import { createSupabaseAdminClient } from '$lib/supabase/admin';
import type { FeComprobanteEstado } from '$lib/fe/types';
import { hasAcceptedNotaCreditoForInvoice } from '$lib/fe/comprobantes.server';
import { normalizeImpuestoTarifaForFe } from '$lib/fe/impuesto-tarifa';
import { computeInvoiceTaxTotals } from '$lib/lab/invoice-tax';
import {
	normalizeInvoiceLineAmounts,
	roundMoney
} from '$lib/lab/invoice-line-amounts';
import type { InvoiceEstado } from './types';

function lineSubtotal(cantidad: number, precioUnitario: number): number {
	return roundMoney(Math.max(0, cantidad) * Math.max(0, precioUnitario));
}

export type InvoiceLineDetail = {
	id: string;
	sort_order: number;
	descripcion: string;
	cantidad: number;
	precio_unitario: number;
	subtotal: number;
	fe_cabys: string | null;
	fe_unidad_medida: string;
	impuesto_tarifa: number;
};

export type InvoiceDetail = {
	id: string;
	invoice_number: string;
	client_id: string;
	case_id: string;
	client_name: string;
	client_clinica: string;
	case_number: string;
	paciente_name: string;
	subtotal: number;
	impuesto: number;
	total: number;
	fecha_emision: string;
	fecha_vencimiento: string;
	estado: InvoiceEstado;
	lineas: InvoiceLineDetail[];
	source_invoice_id: string | null;
};

export type ClientFiscalSnapshot = {
	nombre: string;
	email: string;
	fe_tipo_identificacion: string | null;
	fe_numero_identificacion: string | null;
	fe_codigo_actividad: string | null;
	fe_correo_facturacion: string | null;
};

export type FeComprobanteDetail = {
	id: string;
	tipo_documento: string;
	consecutivo_num: number;
	clave: string | null;
	consecutivo: string | null;
	estado: FeComprobanteEstado;
	hacienda_status: number | null;
	subtotal: number;
	impuesto: number;
	total: number;
	fecha_emision: string | null;
	moneda: string;
	ultimo_error: string | null;
	enviado_at: string | null;
	resuelto_at: string | null;
	xml_firmado: string | null;
	respuesta_xml: string | null;
	rechazo: Record<string, unknown> | null;
	referencia_codigo: string | null;
	referencia_razon: string | null;
};

type ClientEmbedRow = {
	nombre: string;
	email: string;
	fe_tipo_identificacion: string | null;
	fe_numero_identificacion: string | null;
	fe_codigo_actividad: string | null;
	fe_correo_facturacion: string | null;
};

type FeEmbedDetailRow = {
	id: string;
	tipo_documento: string;
	consecutivo_num: number;
	clave: string | null;
	consecutivo: string | null;
	estado: FeComprobanteEstado;
	hacienda_status: number | null;
	subtotal: number;
	impuesto: number;
	total: number;
	fecha_emision: string | null;
	moneda: string;
	ultimo_error: string | null;
	enviado_at: string | null;
	resuelto_at: string | null;
	xml_firmado: string | null;
	respuesta_xml: string | null;
	rechazo: Record<string, unknown> | null;
	referencia_codigo?: string | null;
	referencia_razon?: string | null;
};

function mapFeComprobanteDetail(row: FeEmbedDetailRow): FeComprobanteDetail {
	return {
		id: row.id,
		tipo_documento: row.tipo_documento,
		consecutivo_num: Number(row.consecutivo_num),
		clave: row.clave,
		consecutivo: row.consecutivo,
		estado: row.estado as FeComprobanteEstado,
		hacienda_status: row.hacienda_status,
		subtotal: Number(row.subtotal),
		impuesto: Number(row.impuesto),
		total: Number(row.total),
		fecha_emision: row.fecha_emision,
		moneda: row.moneda ?? 'CRC',
		ultimo_error: row.ultimo_error,
		enviado_at: row.enviado_at,
		resuelto_at: row.resuelto_at,
		xml_firmado: row.xml_firmado,
		respuesta_xml: row.respuesta_xml,
		rechazo: (row.rechazo as Record<string, unknown> | null) ?? null,
		referencia_codigo: row.referencia_codigo ?? null,
		referencia_razon: row.referencia_razon ?? null
	};
}

function collectFeComprobantes(
	raw: FeEmbedDetailRow[] | FeEmbedDetailRow | null | undefined
): FeEmbedDetailRow[] {
	if (!raw) return [];
	return Array.isArray(raw) ? raw : [raw];
}

const FE_EMBED_SELECT_BASE = `
				id,
				tipo_documento,
				consecutivo_num,
				clave,
				consecutivo,
				estado,
				hacienda_status,
				subtotal,
				impuesto,
				total,
				fecha_emision,
				moneda,
				ultimo_error,
				enviado_at,
				resuelto_at,
				xml_firmado,
				respuesta_xml,
				rechazo`;

function isUndefinedColumnError(error: unknown, column?: string): boolean {
	if (!error || typeof error !== 'object') return false;
	const e = error as { code?: string; message?: string; details?: string };
	const msg = `${e.message ?? ''} ${e.details ?? ''}`.toLowerCase();
	const missingColumn =
		e.code === '42703' ||
		e.code === 'PGRST204' ||
		msg.includes('does not exist') ||
		msg.includes('column') && msg.includes('not exist');
	if (!missingColumn) return false;
	if (!column) return true;
	return msg.includes(column.toLowerCase());
}

type InvoiceDetailQueryFlags = {
	referenciaCols: boolean;
	sourceInvoiceCol: boolean;
};

function invoiceDetailSelect(flags: InvoiceDetailQueryFlags): string {
	const feCols = flags.referenciaCols
		? `${FE_EMBED_SELECT_BASE},
				referencia_codigo,
				referencia_razon`
		: FE_EMBED_SELECT_BASE;

	const sourceInvoiceCol = flags.sourceInvoiceCol ? 'source_invoice_id,' : '';

	return `
			id,
			invoice_number,
			client_id,
			case_id,
			client_name,
			client_clinica,
			case_number,
			paciente_name,
			subtotal,
			impuesto,
			total,
			fecha_emision,
			fecha_vencimiento,
			estado,
			${sourceInvoiceCol}
			invoice_lines (
				id,
				sort_order,
				descripcion,
				cantidad,
				precio_unitario,
				subtotal,
				fe_cabys,
				fe_unidad_medida,
				impuesto_tarifa
			),
			clients (
				nombre,
				email,
				fe_tipo_identificacion,
				fe_numero_identificacion,
				fe_codigo_actividad,
				fe_correo_facturacion
			),
			fe_comprobantes (${feCols}
			)`;
}

async function fetchInvoiceDetailRow(admin: ReturnType<typeof createSupabaseAdminClient>, invoiceId: string) {
	const attempts: InvoiceDetailQueryFlags[] = [
		{ referenciaCols: true, sourceInvoiceCol: true },
		{ referenciaCols: false, sourceInvoiceCol: true },
		{ referenciaCols: true, sourceInvoiceCol: false },
		{ referenciaCols: false, sourceInvoiceCol: false }
	];

	let lastError: unknown = null;
	for (const flags of attempts) {
		const result = await admin
			.from('invoices')
			.select(invoiceDetailSelect(flags))
			.eq('id', invoiceId)
			.maybeSingle();
		if (!result.error) return result;
		lastError = result.error;
		if (!isUndefinedColumnError(result.error)) break;
	}

	if (lastError) throw lastError;
	return { data: null, error: null };
}

/** Una consulta: factura + líneas + cliente fiscal + comprobantes FE (01 + NC/ND). */
export async function loadInvoiceDetailPage(invoiceId: string): Promise<{
	invoice: InvoiceDetail;
	client: ClientFiscalSnapshot;
	fe: FeComprobanteDetail | null;
	notas: FeComprobanteDetail[];
	lineAmountsNeedReconcile: boolean;
	correctionContext: {
		sourceInvoiceId: string;
		sourceInvoiceNumber: string;
		sourceNcAceptada: boolean;
	} | null;
} | null> {
	const admin = createSupabaseAdminClient();

	const invResult = await fetchInvoiceDetailRow(admin, invoiceId);
	const { data: inv, error: invError } = invResult;

	if (invError) throw invError;
	if (!inv) return null;

	const clientRow = (Array.isArray(inv.clients) ? inv.clients[0] : inv.clients) as
		| ClientEmbedRow
		| null
		| undefined;
	const feRows = collectFeComprobantes(
		inv.fe_comprobantes as FeEmbedDetailRow[] | FeEmbedDetailRow | null | undefined
	);
	const feRow = feRows.find((r) => r.tipo_documento === '01') ?? null;
	const notaRows = feRows
		.filter((r) => r.tipo_documento === '02' || r.tipo_documento === '03')
		.sort((a, b) => new Date(b.enviado_at ?? 0).getTime() - new Date(a.enviado_at ?? 0).getTime());

	const lineas = ((inv.invoice_lines ?? []) as InvoiceLineDetail[]).sort(
		(a, b) => a.sort_order - b.sort_order
	);

	const invoice: InvoiceDetail = {
		id: inv.id,
		invoice_number: inv.invoice_number,
		client_id: inv.client_id,
		case_id: inv.case_id,
		client_name: inv.client_name,
		client_clinica: inv.client_clinica,
		case_number: inv.case_number,
		paciente_name: inv.paciente_name,
		subtotal: Number(inv.subtotal),
		impuesto: Number(inv.impuesto),
		total: Number(inv.total),
		fecha_emision: inv.fecha_emision,
		fecha_vencimiento: inv.fecha_vencimiento,
		estado: inv.estado as InvoiceEstado,
		source_invoice_id: (inv.source_invoice_id as string | null | undefined) ?? null,
		lineas: lineas.map((l) => {
			const normalized = normalizeInvoiceLineAmounts({
				cantidad: Number(l.cantidad),
				precio_unitario: Number(l.precio_unitario),
				subtotal: Number(l.subtotal)
			});
			return {
				...l,
				cantidad: normalized.cantidad,
				precio_unitario: normalized.precio_unitario,
				subtotal: normalized.subtotal,
				impuesto_tarifa: normalizeImpuestoTarifaForFe(l.impuesto_tarifa),
				fe_unidad_medida: l.fe_unidad_medida ?? 'Sp'
			};
		})
	};

	const client: ClientFiscalSnapshot = {
		nombre: clientRow?.nombre ?? inv.client_name,
		email: clientRow?.email ?? '',
		fe_tipo_identificacion: clientRow?.fe_tipo_identificacion ?? null,
		fe_numero_identificacion: clientRow?.fe_numero_identificacion ?? null,
		fe_codigo_actividad: clientRow?.fe_codigo_actividad ?? null,
		fe_correo_facturacion: clientRow?.fe_correo_facturacion ?? null
	};

	const fe: FeComprobanteDetail | null = feRow ? mapFeComprobanteDetail(feRow) : null;
	const notas: FeComprobanteDetail[] = notaRows.map(mapFeComprobanteDetail);

	let correctionContext: {
		sourceInvoiceId: string;
		sourceInvoiceNumber: string;
		sourceNcAceptada: boolean;
	} | null = null;

	if (invoice.source_invoice_id) {
		const { data: srcInv } = await admin
			.from('invoices')
			.select('invoice_number')
			.eq('id', invoice.source_invoice_id)
			.maybeSingle();
		const sourceNcAceptada = await hasAcceptedNotaCreditoForInvoice(invoice.source_invoice_id);
		correctionContext = {
			sourceInvoiceId: invoice.source_invoice_id,
			sourceInvoiceNumber: String(srcInv?.invoice_number ?? invoice.source_invoice_id),
			sourceNcAceptada
		};
	}

	return {
		invoice,
		client,
		fe,
		notas,
		lineAmountsNeedReconcile: invoiceAmountsNeedReconcile(lineas, invoice),
		correctionContext
	};
}

function invoiceAmountsNeedReconcile(
	rawLineas: InvoiceLineDetail[],
	invoice: InvoiceDetail
): boolean {
	const normalizedLines = rawLineas.map((l) => {
		const normalized = normalizeInvoiceLineAmounts({
			cantidad: Number(l.cantidad),
			precio_unitario: Number(l.precio_unitario),
			subtotal: Number(l.subtotal)
		});
		return {
			subtotal: normalized.subtotal,
			impuesto_tarifa: normalizeImpuestoTarifaForFe(l.impuesto_tarifa)
		};
	});

	const linesStale = rawLineas.some((l) => {
		const normalized = normalizeInvoiceLineAmounts({
			cantidad: Number(l.cantidad),
			precio_unitario: Number(l.precio_unitario),
			subtotal: Number(l.subtotal)
		});
		return (
			Math.abs(normalized.subtotal - Number(l.subtotal)) > 0.01 ||
			Math.abs(normalized.precio_unitario - Number(l.precio_unitario)) > 0.01
		);
	});

	const totals = computeInvoiceTaxTotals(normalizedLines);
	const headerStale =
		Math.abs(totals.subtotal - invoice.subtotal) > 0.01 ||
		Math.abs(totals.impuesto - invoice.impuesto) > 0.01 ||
		Math.abs(totals.total - invoice.total) > 0.01;

	return linesStale || headerStale;
}

/** Corrige líneas (cantidad × precio = subtotal) y totales del encabezado en BD. */
export async function reconcileInvoiceAmounts(invoiceId: string): Promise<{
	linesUpdated: number;
	subtotal: number;
	impuesto: number;
	total: number;
}> {
	const linesUpdated = await reconcileInvoiceLineSubtotals(invoiceId);

	const admin = createSupabaseAdminClient();
	const { data: freshLines, error: freshErr } = await admin
		.from('invoice_lines')
		.select('subtotal, impuesto_tarifa')
		.eq('invoice_id', invoiceId);
	if (freshErr) throw freshErr;

	const totals = computeInvoiceTaxTotals(
		(freshLines ?? []).map((l) => ({
			subtotal: Number(l.subtotal),
			impuesto_tarifa: normalizeImpuestoTarifaForFe(l.impuesto_tarifa)
		}))
	);

	const { error: invErr } = await admin
		.from('invoices')
		.update({
			subtotal: totals.subtotal,
			impuesto: totals.impuesto,
			total: totals.total
		})
		.eq('id', invoiceId);
	if (invErr) throw invErr;

	return { linesUpdated, ...totals };
}

/** Corrige subtotales cuando cantidad × precio_unitario no coincide con subtotal guardado. */
export async function reconcileInvoiceLineSubtotals(invoiceId: string): Promise<number> {
	const admin = createSupabaseAdminClient();
	const { data: lines, error } = await admin
		.from('invoice_lines')
		.select('id, cantidad, precio_unitario, subtotal')
		.eq('invoice_id', invoiceId);
	if (error) throw error;

	let updated = 0;
	for (const line of lines ?? []) {
		const normalized = normalizeInvoiceLineAmounts({
			cantidad: Number(line.cantidad),
			precio_unitario: Number(line.precio_unitario),
			subtotal: Number(line.subtotal)
		});
		const storedSubtotal = roundMoney(Number(line.subtotal));
		const storedPrecio = roundMoney(Number(line.precio_unitario));
		if (
			Math.abs(normalized.subtotal - storedSubtotal) <= 0.01 &&
			Math.abs(normalized.precio_unitario - storedPrecio) <= 0.01
		) {
			continue;
		}

		const { error: upErr } = await admin
			.from('invoice_lines')
			.update({
				precio_unitario: normalized.precio_unitario,
				subtotal: normalized.subtotal
			})
			.eq('id', line.id)
			.eq('invoice_id', invoiceId);
		if (upErr) throw upErr;
		updated++;
	}

	return updated;
}

/** Actualiza precios de líneas y recalcula subtotal / IVA / total del encabezado. */
export async function updateInvoiceLinePrices(
	invoiceId: string,
	updates: { lineId: string; precio_unitario: number }[]
): Promise<void> {
	const admin = createSupabaseAdminClient();
	const byId = new Map(updates.map((u) => [u.lineId, u.precio_unitario]));

	const { data: lines, error: linesErr } = await admin
		.from('invoice_lines')
		.select('id, cantidad, precio_unitario, subtotal, impuesto_tarifa')
		.eq('invoice_id', invoiceId);
	if (linesErr) throw linesErr;
	if (!lines?.length) throw new Error('La factura no tiene líneas.');

	for (const line of lines) {
		const nextPrecio = byId.get(line.id) ?? Number(line.precio_unitario);
		if (!Number.isFinite(nextPrecio) || nextPrecio < 0) {
			throw new Error('Precio unitario inválido.');
		}

		const normalized = normalizeInvoiceLineAmounts({
			cantidad: Number(line.cantidad),
			precio_unitario: nextPrecio,
			subtotal: lineSubtotal(Number(line.cantidad), nextPrecio)
		});
		const { error: upErr } = await admin
			.from('invoice_lines')
			.update({
				precio_unitario: normalized.precio_unitario,
				subtotal: normalized.subtotal
			})
			.eq('id', line.id)
			.eq('invoice_id', invoiceId);
		if (upErr) throw upErr;
		line.precio_unitario = normalized.precio_unitario;
		line.subtotal = normalized.subtotal;
	}

	const { data: freshLines, error: freshErr } = await admin
		.from('invoice_lines')
		.select('subtotal, impuesto_tarifa')
		.eq('invoice_id', invoiceId);
	if (freshErr) throw freshErr;

	const totals = computeInvoiceTaxTotals(
		(freshLines ?? []).map((l) => ({
			subtotal: Number(l.subtotal),
			impuesto_tarifa: normalizeImpuestoTarifaForFe(l.impuesto_tarifa)
		}))
	);

	const { error: invErr } = await admin
		.from('invoices')
		.update({
			subtotal: totals.subtotal,
			impuesto: totals.impuesto,
			total: totals.total
		})
		.eq('id', invoiceId);
	if (invErr) throw invErr;
}

/** Copia factura interna y líneas para re-facturar tras NC (mismo caso/cliente). */
export async function duplicateInvoiceForCorrection(sourceInvoiceId: string): Promise<{
	id: string;
	invoice_number: string;
}> {
	const detail = await loadInvoiceDetailPage(sourceInvoiceId);
	if (!detail) throw new Error('Factura origen no encontrada.');

	const admin = createSupabaseAdminClient();
	const { data: invoiceNumber, error: seqError } = await admin.rpc('next_invoice_number');
	if (seqError) throw seqError;

	const inv = detail.invoice;
	const newId = crypto.randomUUID();

	const headerBase = {
		id: newId,
		invoice_number: String(invoiceNumber),
		client_id: inv.client_id,
		case_id: inv.case_id,
		client_name: inv.client_name,
		client_clinica: inv.client_clinica,
		case_number: inv.case_number,
		paciente_name: inv.paciente_name,
		subtotal: inv.subtotal,
		impuesto: inv.impuesto,
		total: inv.total,
		fecha_emision: new Date().toISOString(),
		fecha_vencimiento: inv.fecha_vencimiento,
		estado: 'pendiente' as const
	};

	let invError = (
		await admin.from('invoices').insert({ ...headerBase, source_invoice_id: sourceInvoiceId })
	).error;
	if (invError && isUndefinedColumnError(invError, 'source_invoice_id')) {
		invError = (await admin.from('invoices').insert(headerBase)).error;
	}
	if (invError?.code === '23505') {
		throw new Error(
			'Aplique la migración 20260729210000_invoice_correction_and_fe_referencia.sql para crear facturas corregidas del mismo caso.'
		);
	}
	if (invError) throw invError;

	const lineRows = inv.lineas.map((l) => ({
		invoice_id: newId,
		sort_order: l.sort_order,
		descripcion: l.descripcion,
		cantidad: l.cantidad,
		precio_unitario: l.precio_unitario,
		subtotal: l.subtotal,
		fe_cabys: l.fe_cabys,
		fe_unidad_medida: l.fe_unidad_medida,
		impuesto_tarifa: l.impuesto_tarifa
	}));

	if (lineRows.length > 0) {
		const { error: linesError } = await admin.from('invoice_lines').insert(lineRows);
		if (linesError) throw linesError;
	}

	return { id: newId, invoice_number: String(invoiceNumber) };
}
