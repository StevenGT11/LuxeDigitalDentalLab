import { createSupabaseAdminClient } from '$lib/supabase/admin';
import type { FeComprobanteSummary } from '$lib/fe/types';
import {
	INVOICE_LIST_PAGE_SIZES,
	type InvoiceListPageSize,
	type InvoiceListQuery,
	type InvoiceListRow
} from './invoices-list';
import type { InvoiceEstado } from './types';

export type { InvoiceListPageSize, InvoiceListQuery, InvoiceListRow } from './invoices-list';
export { INVOICE_LIST_PAGE_SIZES } from './invoices-list';

export type InvoiceListResult = {
	invoices: InvoiceListRow[];
	totalCount: number;
	page: number;
	pageSize: InvoiceListPageSize;
	q: string;
	estado: 'todos' | InvoiceEstado;
};

const LIST_SELECT = `
	id,
	invoice_number,
	client_id,
	case_id,
	client_name,
	client_clinica,
	case_number,
	paciente_name,
	total,
	fecha_emision,
	estado,
	fe_comprobantes (
		id,
		invoice_id,
		clave,
		consecutivo,
		estado,
		hacienda_status,
		ultimo_error,
		enviado_at,
		resuelto_at
	)
`;

type FeEmbedRow = {
	id: string;
	invoice_id: string;
	clave: string | null;
	consecutivo: string | null;
	estado: FeComprobanteSummary['estado'];
	hacienda_status: number | null;
	ultimo_error: string | null;
	enviado_at: string | null;
	resuelto_at: string | null;
};

type DbInvoiceListRow = {
	id: string;
	invoice_number: string;
	client_id: string;
	case_id: string;
	client_name: string;
	client_clinica: string;
	case_number: string;
	paciente_name: string;
	total: number;
	fecha_emision: string;
	estado: string;
	fe_comprobantes: FeEmbedRow[] | FeEmbedRow | null;
};

function escapeIlike(value: string): string {
	return value.replace(/[%_\\]/g, '\\$&');
}

function parsePageSize(raw: string | null): InvoiceListPageSize {
	const n = Number(raw);
	return INVOICE_LIST_PAGE_SIZES.includes(n as InvoiceListPageSize) ? (n as InvoiceListPageSize) : 15;
}

export function parseInvoiceListQuery(searchParams: URLSearchParams): InvoiceListQuery {
	const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
	const pageSize = parsePageSize(searchParams.get('size'));
	const q = (searchParams.get('q') ?? '').trim();
	const rawEstado = searchParams.get('estado') ?? 'todos';
	const estado =
		rawEstado === 'todos' ||
		rawEstado === 'pendiente' ||
		rawEstado === 'facturado' ||
		rawEstado === 'pagado' ||
		rawEstado === 'pagada' ||
		rawEstado === 'cancelada'
			? rawEstado === 'pagada'
				? 'pagado'
				: (rawEstado as InvoiceListQuery['estado'])
			: 'todos';

	return { page, pageSize, q, estado };
}

function mapFeEmbed(raw: FeEmbedRow[] | FeEmbedRow | null | undefined): FeComprobanteSummary | null {
	if (!raw) return null;
	const row = Array.isArray(raw) ? raw[0] : raw;
	if (!row?.id) return null;
	return {
		id: row.id,
		invoice_id: row.invoice_id,
		clave: row.clave,
		consecutivo: row.consecutivo,
		estado: row.estado,
		hacienda_status: row.hacienda_status,
		ultimo_error: row.ultimo_error,
		enviado_at: row.enviado_at,
		resuelto_at: row.resuelto_at
	};
}

function mapInvoiceRow(row: DbInvoiceListRow): InvoiceListRow {
	return {
		id: row.id,
		invoice_number: row.invoice_number,
		client_id: row.client_id,
		client_name: row.client_name,
		client_clinica: row.client_clinica,
		case_id: row.case_id,
		case_number: row.case_number,
		paciente_name: row.paciente_name,
		total: Number(row.total),
		fecha_emision: row.fecha_emision,
		estado: row.estado === 'pagada' ? 'pagado' : (row.estado as InvoiceEstado),
		fe: mapFeEmbed(row.fe_comprobantes)
	};
}

/** PostgREST no admite fe_comprobantes.clave dentro de .or() en invoices; ids vía consulta aparte. */
async function fetchInvoiceIdsMatchingFeClave(
	admin: ReturnType<typeof createSupabaseAdminClient>,
	term: string
): Promise<string[]> {
	const { data, error } = await admin
		.from('fe_comprobantes')
		.select('invoice_id')
		.eq('tipo_documento', '01')
		.ilike('clave', term)
		.not('invoice_id', 'is', null)
		.limit(200);
	if (error) throw error;
	return [...new Set((data ?? []).map((r) => r.invoice_id).filter(Boolean) as string[])];
}

/** Facturas paginadas + comprobante FE embebido (2 consultas solo si hay búsqueda por clave). */
export async function fetchInvoiceListPage(query: InvoiceListQuery): Promise<InvoiceListResult> {
	const admin = createSupabaseAdminClient();

	let feInvoiceIds: string[] = [];
	if (query.q) {
		const term = `%${escapeIlike(query.q)}%`;
		feInvoiceIds = await fetchInvoiceIdsMatchingFeClave(admin, term);
	}

	let dbQuery = admin
		.from('invoices')
		.select(LIST_SELECT, { count: 'exact' })
		.order('fecha_emision', { ascending: false });

	if (query.estado !== 'todos') {
		if (query.estado === 'pagado') {
			dbQuery = dbQuery.in('estado', ['pagado', 'pagada']);
		} else {
			dbQuery = dbQuery.eq('estado', query.estado);
		}
	}

	if (query.q) {
		const term = `%${escapeIlike(query.q)}%`;
		const orParts = [
			`invoice_number.ilike.${term}`,
			`client_name.ilike.${term}`,
			`client_clinica.ilike.${term}`,
			`case_number.ilike.${term}`,
			`paciente_name.ilike.${term}`
		];
		if (feInvoiceIds.length > 0) {
			orParts.push(`id.in.(${feInvoiceIds.join(',')})`);
		}
		dbQuery = dbQuery.or(orParts.join(','));
	}

	let from = (query.page - 1) * query.pageSize;
	let to = from + query.pageSize - 1;

	let { data, error, count } = await dbQuery.range(from, to);
	if (error) throw error;

	const totalCount = count ?? 0;
	const totalPages = Math.max(1, Math.ceil(totalCount / query.pageSize));
	const page = Math.min(Math.max(1, query.page), totalPages);

	if (page !== query.page && totalCount > 0) {
		from = (page - 1) * query.pageSize;
		to = from + query.pageSize - 1;
		const retry = await dbQuery.range(from, to);
		if (retry.error) throw retry.error;
		data = retry.data;
	}

	const invoices = ((data ?? []) as DbInvoiceListRow[]).map(mapInvoiceRow);

	return {
		invoices,
		totalCount,
		page,
		pageSize: query.pageSize,
		q: query.q,
		estado: query.estado
	};
}
