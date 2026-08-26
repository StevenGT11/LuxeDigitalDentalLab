import { createSupabaseAdminClient } from '$lib/supabase/admin';
import type { FeAmbiente, FeComprobanteEstado, FeComprobanteSummary } from './types';

type DbFe = {
	id: string;
	invoice_id: string | null;
	consecutivo_num: number;
	clave: string | null;
	consecutivo: string | null;
	estado: FeComprobanteEstado;
	hacienda_status: number | null;
	ultimo_error: string | null;
	enviado_at: string | null;
	resuelto_at: string | null;
};

const SUMMARY_COLS =
	'id, invoice_id, clave, consecutivo, estado, hacienda_status, ultimo_error, enviado_at, resuelto_at';

function mapSummary(row: DbFe): FeComprobanteSummary {
	return {
		id: row.id,
		invoice_id: row.invoice_id ?? '',
		clave: row.clave,
		consecutivo: row.consecutivo,
		estado: row.estado,
		hacienda_status: row.hacienda_status,
		ultimo_error: row.ultimo_error,
		enviado_at: row.enviado_at,
		resuelto_at: row.resuelto_at
	};
}

export async function fetchFeSummariesByInvoiceIds(
	invoiceIds: string[]
): Promise<Record<string, FeComprobanteSummary>> {
	if (invoiceIds.length === 0) return {};
	const admin = createSupabaseAdminClient();
	const { data, error } = await admin
		.from('fe_comprobantes')
		.select(SUMMARY_COLS)
		.in('invoice_id', invoiceIds)
		.eq('tipo_documento', '01');
	if (error) throw error;

	const map: Record<string, FeComprobanteSummary> = {};
	for (const row of (data ?? []) as DbFe[]) {
		if (row.invoice_id) map[row.invoice_id] = mapSummary(row);
	}
	return map;
}

export async function fetchFeComprobanteForInvoice(invoiceId: string): Promise<DbFe | null> {
	const admin = createSupabaseAdminClient();
	const { data, error } = await admin
		.from('fe_comprobantes')
		.select('*')
		.eq('invoice_id', invoiceId)
		.eq('tipo_documento', '01')
		.maybeSingle();
	if (error) throw error;
	return (data as DbFe | null) ?? null;
}

export async function reserveNextFeConsecutivo(
	tipoDocumento: string,
	ambiente: FeAmbiente
): Promise<number> {
	const admin = createSupabaseAdminClient();
	const { data, error } = await admin.rpc('next_fe_consecutivo_num', {
		p_tipo_documento: tipoDocumento,
		p_ambiente: ambiente
	});
	if (error) throw error;
	return Number(data);
}

export async function insertFeComprobanteDraft(input: {
	invoice_id: string;
	consecutivo_num: number;
	ambiente: FeAmbiente;
	subtotal: number;
	impuesto: number;
	total: number;
}): Promise<string> {
	const admin = createSupabaseAdminClient();
	const id = crypto.randomUUID();
	const { error } = await admin.from('fe_comprobantes').insert({
		id,
		invoice_id: input.invoice_id,
		tipo_documento: '01',
		ambiente: input.ambiente,
		consecutivo_num: input.consecutivo_num,
		estado: 'pendiente_envio',
		subtotal: input.subtotal,
		impuesto: input.impuesto,
		total: input.total,
		moneda: 'CRC'
	});
	if (error) throw error;
	return id;
}

/** Limpia el comprobante rechazado/erróneo y reserva nuevo consecutivo para reenvío. */
export async function 	resetFeComprobanteForReemit(
	id: string,
	input: {
		consecutivo_num: number;
		ambiente: FeAmbiente;
		subtotal: number;
		impuesto: number;
		total: number;
	}
): Promise<void> {
	const admin = createSupabaseAdminClient();
	const { error } = await admin
		.from('fe_comprobantes')
		.update({
			consecutivo_num: input.consecutivo_num,
			ambiente: input.ambiente,
			subtotal: input.subtotal,
			impuesto: input.impuesto,
			total: input.total,
			estado: 'pendiente_envio',
			clave: null,
			consecutivo: null,
			hacienda_status: null,
			fecha_emision: null,
			xml_firmado: null,
			respuesta_xml: null,
			rechazo: null,
			ultimo_error: null,
			enviado_at: null,
			resuelto_at: null
		})
		.eq('id', id);
	if (error) throw error;
}

export async function updateFeComprobanteAfterEnviar(
	id: string,
	patch: {
		clave: string;
		consecutivo: string;
		hacienda_status: number;
		xml_firmado: string;
		fecha_emision: string;
		subtotal: number;
		impuesto: number;
		total: number;
		estado: FeComprobanteEstado;
	}
): Promise<void> {
	const admin = createSupabaseAdminClient();
	const { error } = await admin
		.from('fe_comprobantes')
		.update({
			...patch,
			ultimo_error: null,
			enviado_at: new Date().toISOString()
		})
		.eq('id', id);
	if (error) throw error;
}

export async function updateFeComprobanteError(id: string, message: string): Promise<void> {
	const admin = createSupabaseAdminClient();
	const { error } = await admin
		.from('fe_comprobantes')
		.update({ estado: 'error', ultimo_error: message.slice(0, 2000) })
		.eq('id', id);
	if (error) throw error;
}

export async function updateFeComprobanteAfterConsulta(
	id: string,
	patch: {
		estado: FeComprobanteEstado;
		respuesta_xml?: string;
		rechazo?: Record<string, unknown> | null;
		ultimo_error?: string | null;
	}
): Promise<void> {
	const admin = createSupabaseAdminClient();
	const resolved =
		patch.estado === 'aceptado' || patch.estado === 'rechazado'
			? { resuelto_at: new Date().toISOString() }
			: {};
	const { error } = await admin
		.from('fe_comprobantes')
		.update({ ...patch, ...resolved })
		.eq('id', id);
	if (error) throw error;
}

export type { DbFe };
