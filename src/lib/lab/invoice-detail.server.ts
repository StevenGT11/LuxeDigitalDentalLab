import { feComprobanteMatchesEmitAmbiente } from '$lib/fe/ambiente';
import { hasAcceptedNotaCreditoForInvoice } from '$lib/fe/comprobantes.server';
import { getEmitAmbiente } from '$lib/fe/hacienda-settings.server';
import type { FeAmbiente, FeComprobanteEstado } from '$lib/fe/types';
import { createSupabaseAdminClient } from '$lib/supabase/admin';
import { canReemitFacturaTrasNc } from '$lib/fe/reemit-factura';
import { loadCabysCatalog } from '$lib/cabys/loadCatalog.server';
import { findCabysByCodigo } from '$lib/cabys/searchCatalog';
import { isValidFeCabys } from '$lib/fe/constants';
import { normalizeFeUnidadMedida } from '$lib/fe/emisor-normalize';
import { resolveFeUnidadMedidaForCabys } from '$lib/fe/fe-unidad-medida';
import { normalizeImpuestoTarifaForFe } from '$lib/fe/impuesto-tarifa';
import { computeInvoiceTaxTotals } from '$lib/lab/invoice-tax';
import {
	invoiceLineAmounts,
	normalizeInvoiceLineAmounts,
	roundMoney
} from '$lib/lab/invoice-line-amounts';
import type { InvoiceEstado, InvoiceLineDetail } from './types';

export type { InvoiceLineDetail };

function lineSubtotal(cantidad: number, precioUnitario: number): number {
	return roundMoney(Math.max(0, cantidad) * Math.max(0, precioUnitario));
}

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
	notas: string;
};

export type ClientFiscalSnapshot = {
	nombre: string;
	email: string;
	fe_tipo_identificacion: string | null;
	fe_numero_identificacion: string | null;
	fe_codigo_actividad: string | null;
	fe_correo_facturacion: string | null;
	fe_provincia: number | null;
	fe_canton: string | null;
	fe_distrito: string | null;
	fe_otras_senas: string | null;
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
	fe_provincia: number | null;
	fe_canton: string | null;
	fe_distrito: string | null;
	fe_otras_senas: string | null;
};

type FeEmbedDetailRow = {
	id: string;
	tipo_documento: string;
	ambiente?: string | null;
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
				ambiente,
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
				fe_correo_facturacion,
				fe_provincia,
				fe_canton,
				fe_distrito,
				fe_otras_senas
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

function filterFeRowsForAmbiente(rows: FeEmbedDetailRow[], emitAmbiente: FeAmbiente): FeEmbedDetailRow[] {
	return rows.filter((r) => feComprobanteMatchesEmitAmbiente(r.ambiente, emitAmbiente));
}

/** Una consulta: factura + líneas + cliente fiscal + comprobantes FE (01 + NC/ND). */
export async function loadInvoiceDetailPage(
	invoiceId: string,
	emitAmbiente: FeAmbiente
): Promise<{
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
	correctionInvoice: { id: string; invoice_number: string } | null;
	reemitFacturaEligible: boolean;
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
	const feRows = filterFeRowsForAmbiente(
		collectFeComprobantes(
			inv.fe_comprobantes as FeEmbedDetailRow[] | FeEmbedDetailRow | null | undefined
		),
		emitAmbiente
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
		notas: '',
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
		fe_correo_facturacion: clientRow?.fe_correo_facturacion ?? null,
		fe_provincia: clientRow?.fe_provincia ?? null,
		fe_canton: clientRow?.fe_canton ?? null,
		fe_distrito: clientRow?.fe_distrito ?? null,
		fe_otras_senas: clientRow?.fe_otras_senas ?? null
	};

	const { data: notasRow, error: notasError } = await admin
		.from('invoices')
		.select('notas')
		.eq('id', invoiceId)
		.maybeSingle();
	if (!notasError) {
		invoice.notas = String((notasRow as { notas?: string | null } | null)?.notas ?? '').trim();
	}

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
		const sourceNcAceptada = await hasAcceptedNotaCreditoForInvoice(
			invoice.source_invoice_id,
			emitAmbiente
		);
		correctionContext = {
			sourceInvoiceId: invoice.source_invoice_id,
			sourceInvoiceNumber: String(srcInv?.invoice_number ?? invoice.source_invoice_id),
			sourceNcAceptada
		};
	}

	let correctionInvoice: { id: string; invoice_number: string } | null = null;
	const reemitFacturaEligible = canReemitFacturaTrasNc({
		feEstado: fe?.estado,
		notas,
		sourceInvoiceId: invoice.source_invoice_id
	});

	if (reemitFacturaEligible) {
		correctionInvoice = await findCorrectionInvoiceForSource(invoiceId);
	}

	return {
		invoice,
		client,
		fe,
		notas,
		lineAmountsNeedReconcile: invoiceAmountsNeedReconcile(lineas, invoice),
		correctionContext,
		correctionInvoice,
		reemitFacturaEligible
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

export type InvoiceLineWrite = {
	id?: string;
	descripcion: string;
	cantidad: number;
	precio_unitario: number;
	fe_cabys: string;
	fe_unidad_medida: string;
	impuesto_tarifa: number;
};

export function parseInvoiceLinesJson(raw: unknown): InvoiceLineWrite[] {
	let parsed: unknown = raw;
	if (typeof raw === 'string') {
		try {
			parsed = JSON.parse(raw);
		} catch {
			throw new Error('Formato de líneas inválido.');
		}
	}
	if (!Array.isArray(parsed) || parsed.length === 0) {
		throw new Error('La factura debe tener al menos una línea.');
	}

	const lines: InvoiceLineWrite[] = [];
	for (const [index, row] of parsed.entries()) {
		if (!row || typeof row !== 'object') continue;
		const r = row as Record<string, unknown>;
		const descripcion = String(r.descripcion ?? '').trim();
		const cabys = String(r.fe_cabys ?? r.cabys ?? '').replace(/\D/g, '');
		if (!descripcion) {
			throw new Error(`La línea ${index + 1} no tiene descripción.`);
		}
		if (!/^\d{13}$/.test(cabys) || !isValidFeCabys(cabys)) {
			throw new Error(`La línea «${descripcion}» necesita un CABYS de 13 dígitos.`);
		}
		const amounts = invoiceLineAmounts(Number(r.cantidad), Number(r.precio_unitario));
		lines.push({
			id: String(r.id ?? '').trim() || undefined,
			descripcion,
			cantidad: Math.max(1, Math.round(amounts.cantidad)),
			precio_unitario: amounts.precio_unitario,
			fe_cabys: cabys,
			fe_unidad_medida: normalizeFeUnidadMedida(r.fe_unidad_medida ?? r.unidad),
			impuesto_tarifa: normalizeImpuestoTarifaForFe(r.impuesto_tarifa)
		});
	}
	if (lines.length === 0) throw new Error('La factura debe tener al menos una línea.');

	const catalog = loadCabysCatalog();
	const cabysLookup = (code: string) => findCabysByCodigo(catalog, code);
	return lines.map((line) => ({
		...line,
		fe_unidad_medida: resolveFeUnidadMedidaForCabys(line.fe_cabys, line.fe_unidad_medida, cabysLookup)
	}));
}

/** Reemplaza las líneas de una factura (alta, baja y edición) y recalcula totales. */
export async function replaceInvoiceLines(invoiceId: string, incoming: InvoiceLineWrite[]): Promise<void> {
	if (incoming.length === 0) throw new Error('La factura debe tener al menos una línea.');

	const admin = createSupabaseAdminClient();
	const { data: feRow } = await admin
		.from('fe_comprobantes')
		.select('estado')
		.eq('invoice_id', invoiceId)
		.eq('tipo_documento', '01')
		.maybeSingle();
	if (feRow?.estado === 'aceptado') {
		throw new Error('No se pueden editar líneas de una FE aceptada.');
	}

	const { data: current, error: curErr } = await admin
		.from('invoice_lines')
		.select('id')
		.eq('invoice_id', invoiceId);
	if (curErr) throw curErr;

	const currentIds = new Set((current ?? []).map((r) => r.id));
	const keepIds = new Set<string>();

	for (const [i, line] of incoming.entries()) {
		const amounts = invoiceLineAmounts(line.cantidad, line.precio_unitario);
		const payload = {
			sort_order: i,
			descripcion: line.descripcion,
			cantidad: amounts.cantidad,
			precio_unitario: amounts.precio_unitario,
			subtotal: amounts.subtotal,
			fe_cabys: line.fe_cabys,
			fe_unidad_medida: line.fe_unidad_medida,
			impuesto_tarifa: line.impuesto_tarifa
		};
		if (line.id && currentIds.has(line.id)) {
			const { error } = await admin.from('invoice_lines').update(payload).eq('id', line.id);
			if (error) throw error;
			keepIds.add(line.id);
		} else {
			const { error } = await admin.from('invoice_lines').insert({
				id: crypto.randomUUID(),
				invoice_id: invoiceId,
				...payload
			});
			if (error) throw error;
		}
	}

	const toDelete = [...currentIds].filter((id) => !keepIds.has(id));
	if (toDelete.length > 0) {
		const { error } = await admin.from('invoice_lines').delete().in('id', toDelete);
		if (error) throw error;
	}

	const totals = computeInvoiceTaxTotals(
		incoming.map((l) => {
			const amounts = invoiceLineAmounts(l.cantidad, l.precio_unitario);
			return { subtotal: amounts.subtotal, impuesto_tarifa: l.impuesto_tarifa };
		})
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

const INVOICE_NOTAS_MAX = 800;

export function normalizeInvoiceNotas(raw: unknown): string {
	return String(raw ?? '')
		.replace(/\r\n/g, '\n')
		.trim()
		.slice(0, INVOICE_NOTAS_MAX);
}

export async function updateInvoiceNotas(invoiceId: string, notas: string): Promise<void> {
	const admin = createSupabaseAdminClient();
	const { error } = await admin
		.from('invoices')
		.update({ notas: normalizeInvoiceNotas(notas) })
		.eq('id', invoiceId);
	if (error && isUndefinedColumnError(error, 'notas')) return;
	if (error) throw error;
}

/** Factura corregida ya creada a partir de la factura origen (si existe). */
export async function findCorrectionInvoiceForSource(sourceInvoiceId: string): Promise<{
	id: string;
	invoice_number: string;
} | null> {
	const admin = createSupabaseAdminClient();
	const { data, error } = await admin
		.from('invoices')
		.select('id, invoice_number')
		.eq('source_invoice_id', sourceInvoiceId)
		.order('created_at', { ascending: false })
		.limit(1)
		.maybeSingle();
	if (error && isUndefinedColumnError(error, 'source_invoice_id')) return null;
	if (error) throw error;
	if (!data?.id) return null;
	return { id: data.id, invoice_number: String(data.invoice_number) };
}

/** Copia factura interna y líneas para re-facturar tras NC (mismo caso/cliente). */
export async function duplicateInvoiceForCorrection(sourceInvoiceId: string): Promise<{
	id: string;
	invoice_number: string;
}> {
	const emitAmbiente = await getEmitAmbiente();
	const detail = await loadInvoiceDetailPage(sourceInvoiceId, emitAmbiente);
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
		estado: 'pendiente' as const,
		notas: inv.notas
	};

	let invError = (
		await admin.from('invoices').insert({ ...headerBase, source_invoice_id: sourceInvoiceId })
	).error;
	if (invError && isUndefinedColumnError(invError, 'notas')) {
		const { notas: _omit, ...withoutNotas } = headerBase;
		invError = (
			await admin.from('invoices').insert({ ...withoutNotas, source_invoice_id: sourceInvoiceId })
		).error;
		if (invError && isUndefinedColumnError(invError, 'source_invoice_id')) {
			invError = (await admin.from('invoices').insert(withoutNotas)).error;
		}
	} else if (invError && isUndefinedColumnError(invError, 'source_invoice_id')) {
		invError = (await admin.from('invoices').insert(headerBase)).error;
		if (invError && isUndefinedColumnError(invError, 'notas')) {
			const { notas: _omit, ...withoutNotas } = headerBase;
			invError = (await admin.from('invoices').insert(withoutNotas)).error;
		}
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
