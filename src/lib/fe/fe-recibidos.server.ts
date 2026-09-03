import { addBusinessDays } from 'date-fns';
import { createSupabaseAdminClient } from '$lib/supabase/admin';
import { parseRecibidoXml } from './parse-recibido-xml';
import type {
	FeMensajeReceptorRow,
	FeRecibidoListItem,
	FeRecibidoRow,
	ParsedRecibidoXml
} from './fe-recibidos.types';
import type { FeAmbiente } from './types';

type PostgrestErrorLike = { message?: string; code?: string } | null;

function throwSupabaseError(error: PostgrestErrorLike): void {
	if (!error) return;
	const err = new Error(error.message ?? error.code ?? 'Error de base de datos');
	Object.assign(err, { code: error.code });
	throw err;
}

/** Tablas de gastos recibidos aún no migradas en Supabase. */
export function isFeRecibidosSchemaMissing(error: unknown): boolean {
	if (!error || typeof error !== 'object') return false;
	const e = error as { code?: string; message?: string };
	return (
		e.code === 'PGRST205' ||
		e.message?.includes('fe_recibidos') === true ||
		e.message?.includes('fe_mensajes_receptor') === true
	);
}

const RECIBIDO_COLS =
	'id, clave, tipo_documento, emisor_tipo_identificacion, emisor_numero_identificacion, emisor_nombre, fecha_emision, subtotal, impuesto, total, moneda, estado, plazo_limite, notas, ambiente, created_at, updated_at';

const MENSAJE_COLS =
	'id, fe_recibido_id, mensaje, detalle_mensaje, consecutivo_num, clave, consecutivo, estado, hacienda_status, ultimo_error, enviado_at, resuelto_at, ambiente';

function computePlazoLimite(fechaEmisionIso: string): string {
	const base = new Date(fechaEmisionIso);
	const limit = addBusinessDays(base, 8);
	return limit.toISOString().slice(0, 10);
}

function mapRecibido(row: Record<string, unknown>): FeRecibidoRow {
	return {
		id: String(row.id),
		clave: String(row.clave),
		tipo_documento: String(row.tipo_documento),
		emisor_tipo_identificacion: String(row.emisor_tipo_identificacion),
		emisor_numero_identificacion: String(row.emisor_numero_identificacion),
		emisor_nombre: String(row.emisor_nombre ?? ''),
		fecha_emision: String(row.fecha_emision),
		subtotal: Number(row.subtotal),
		impuesto: Number(row.impuesto),
		total: Number(row.total),
		moneda: String(row.moneda ?? 'CRC'),
		estado: row.estado as FeRecibidoRow['estado'],
		plazo_limite: row.plazo_limite ? String(row.plazo_limite) : null,
		notas: row.notas ? String(row.notas) : null,
		ambiente: row.ambiente as FeAmbiente,
		created_at: String(row.created_at),
		updated_at: String(row.updated_at)
	};
}

function mapMensaje(row: Record<string, unknown>): FeMensajeReceptorRow {
	return {
		id: String(row.id),
		fe_recibido_id: String(row.fe_recibido_id),
		mensaje: row.mensaje as FeMensajeReceptorRow['mensaje'],
		detalle_mensaje: String(row.detalle_mensaje ?? ''),
		consecutivo_num: Number(row.consecutivo_num),
		clave: row.clave ? String(row.clave) : null,
		consecutivo: row.consecutivo ? String(row.consecutivo) : null,
		estado: String(row.estado),
		hacienda_status: row.hacienda_status != null ? Number(row.hacienda_status) : null,
		ultimo_error: row.ultimo_error ? String(row.ultimo_error) : null,
		enviado_at: row.enviado_at ? String(row.enviado_at) : null,
		resuelto_at: row.resuelto_at ? String(row.resuelto_at) : null,
		ambiente: row.ambiente as FeAmbiente
	};
}

export async function fetchFeRecibidosList(limit = 100): Promise<FeRecibidoListItem[]> {
	const admin = createSupabaseAdminClient();
	const { data, error } = await admin
		.from('fe_recibidos')
		.select(RECIBIDO_COLS)
		.order('created_at', { ascending: false })
		.limit(limit);
	throwSupabaseError(error);

	const rows = (data ?? []) as Record<string, unknown>[];
	if (rows.length === 0) return [];

	const ids = rows.map((r) => String(r.id));
	const { data: mensajes, error: msgError } = await admin
		.from('fe_mensajes_receptor')
		.select(MENSAJE_COLS)
		.in('fe_recibido_id', ids)
		.order('created_at', { ascending: false });
	throwSupabaseError(msgError);

	const latestByRecibido = new Map<string, FeMensajeReceptorRow>();
	for (const raw of (mensajes ?? []) as Record<string, unknown>[]) {
		const mapped = mapMensaje(raw);
		if (!latestByRecibido.has(mapped.fe_recibido_id)) {
			latestByRecibido.set(mapped.fe_recibido_id, mapped);
		}
	}

	return rows.map((row) => {
		const recibido = mapRecibido(row);
		return { ...recibido, ultimo_mensaje: latestByRecibido.get(recibido.id) ?? null };
	});
}

export async function fetchFeRecibidoById(id: string): Promise<FeRecibidoRow | null> {
	const admin = createSupabaseAdminClient();
	const { data, error } = await admin.from('fe_recibidos').select(RECIBIDO_COLS).eq('id', id).maybeSingle();
	throwSupabaseError(error);
	return data ? mapRecibido(data as Record<string, unknown>) : null;
}

export async function insertFeRecibidoFromXml(
	xmlRaw: string,
	ambiente: FeAmbiente
): Promise<{ id: string; parsed: ParsedRecibidoXml }> {
	const parsed = parseRecibidoXml(xmlRaw);
	const admin = createSupabaseAdminClient();

	const { data: existing, error: existError } = await admin
		.from('fe_recibidos')
		.select('id')
		.eq('clave', parsed.clave)
		.maybeSingle();
	throwSupabaseError(existError);
	if (existing) {
		throw new Error('Este comprobante ya está registrado (clave duplicada).');
	}

	const id = crypto.randomUUID();
	const { error } = await admin.from('fe_recibidos').insert({
		id,
		clave: parsed.clave,
		tipo_documento: parsed.tipo_documento,
		emisor_tipo_identificacion: parsed.emisor_tipo_identificacion,
		emisor_numero_identificacion: parsed.emisor_numero_identificacion,
		emisor_nombre: parsed.emisor_nombre,
		fecha_emision: parsed.fecha_emision,
		subtotal: parsed.subtotal,
		impuesto: parsed.impuesto,
		total: parsed.total,
		moneda: parsed.moneda,
		xml_recibido: xmlRaw,
		plazo_limite: computePlazoLimite(parsed.fecha_emision),
		ambiente
	});
	throwSupabaseError(error);

	return { id, parsed };
}

export async function updateFeRecibidoEstado(
	id: string,
	estado: FeRecibidoRow['estado']
): Promise<void> {
	const admin = createSupabaseAdminClient();
	const { error } = await admin.from('fe_recibidos').update({ estado }).eq('id', id);
	throwSupabaseError(error);
}

export async function insertFeMensajeReceptorDraft(input: {
	fe_recibido_id: string;
	mensaje: FeMensajeReceptorRow['mensaje'];
	detalle_mensaje: string;
	consecutivo_num: number;
	ambiente: FeAmbiente;
}): Promise<string> {
	const admin = createSupabaseAdminClient();
	const id = crypto.randomUUID();
	const { error } = await admin.from('fe_mensajes_receptor').insert({
		id,
		fe_recibido_id: input.fe_recibido_id,
		mensaje: input.mensaje,
		detalle_mensaje: input.detalle_mensaje,
		consecutivo_num: input.consecutivo_num,
		ambiente: input.ambiente,
		estado: 'pendiente_envio'
	});
	throwSupabaseError(error);
	return id;
}

export async function updateFeMensajeReceptorAfterEnviar(input: {
	id: string;
	clave: string;
	consecutivo: string;
	hacienda_status: number;
	xml_firmado: string;
}): Promise<void> {
	const admin = createSupabaseAdminClient();
	const now = new Date().toISOString();
	const { error } = await admin
		.from('fe_mensajes_receptor')
		.update({
			clave: input.clave,
			consecutivo: input.consecutivo,
			hacienda_status: input.hacienda_status,
			xml_firmado: input.xml_firmado,
			estado: 'enviado',
			enviado_at: now,
			ultimo_error: null
		})
		.eq('id', input.id);
	throwSupabaseError(error);
}

export async function updateFeMensajeReceptorAfterConsulta(input: {
	id: string;
	estado: string;
	respuesta_xml?: string | null;
	rechazo?: Record<string, unknown> | null;
	ultimo_error?: string | null;
}): Promise<void> {
	const admin = createSupabaseAdminClient();
	const now = new Date().toISOString();
	const { error } = await admin
		.from('fe_mensajes_receptor')
		.update({
			estado: input.estado,
			respuesta_xml: input.respuesta_xml ?? null,
			rechazo: input.rechazo ?? null,
			ultimo_error: input.ultimo_error ?? null,
			resuelto_at: ['aceptado', 'rechazado'].includes(input.estado) ? now : null
		})
		.eq('id', input.id);
	throwSupabaseError(error);
}

export async function updateFeMensajeReceptorError(id: string, ultimo_error: string): Promise<void> {
	const admin = createSupabaseAdminClient();
	const { error } = await admin
		.from('fe_mensajes_receptor')
		.update({ estado: 'error', ultimo_error })
		.eq('id', id);
	throwSupabaseError(error);
}

export async function fetchLatestMensajeForRecibido(
	feRecibidoId: string
): Promise<FeMensajeReceptorRow | null> {
	const admin = createSupabaseAdminClient();
	const { data, error } = await admin
		.from('fe_mensajes_receptor')
		.select(MENSAJE_COLS)
		.eq('fe_recibido_id', feRecibidoId)
		.order('created_at', { ascending: false })
		.limit(1)
		.maybeSingle();
	throwSupabaseError(error);
	return data ? mapMensaje(data as Record<string, unknown>) : null;
}

export function extractFechaEmisionDocFromStoredXml(xml: string): string {
	return parseRecibidoXml(xml).fecha_emision_doc_raw;
}
