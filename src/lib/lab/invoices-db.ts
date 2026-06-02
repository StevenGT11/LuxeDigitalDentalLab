import { createSupabaseBrowserClient } from '$lib/supabase/client';
import { buildInvoiceDraft } from './invoice-builder';
import { setCachedInvoices, upsertCachedInvoice } from './invoices-cache';
import type { Invoice, InvoiceEstado, LabCase, LabClient } from './types';

type DbLine = {
	id: string;
	sort_order: number;
	descripcion: string;
	cantidad: number;
	precio_unitario: number;
	subtotal: number;
};

type DbInvoice = {
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
	invoice_lines: DbLine[] | null;
};

const INVOICE_SELECT = `
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
	invoice_lines (
		id,
		sort_order,
		descripcion,
		cantidad,
		precio_unitario,
		subtotal
	)
`;

function num(v: unknown): number {
	return Number(v);
}

function mapInvoice(row: DbInvoice): Invoice {
	const lineas = (row.invoice_lines ?? [])
		.sort((a, b) => a.sort_order - b.sort_order)
		.map((l) => ({
			descripcion: l.descripcion,
			cantidad: l.cantidad,
			precio_unitario: num(l.precio_unitario),
			subtotal: num(l.subtotal)
		}));

	return {
		id: row.id,
		invoice_number: row.invoice_number,
		client_id: row.client_id,
		client_name: row.client_name,
		client_clinica: row.client_clinica,
		case_id: row.case_id,
		case_number: row.case_number,
		paciente_name: row.paciente_name,
		subtotal: num(row.subtotal),
		impuesto: num(row.impuesto),
		total: num(row.total),
		fecha_emision: row.fecha_emision,
		fecha_vencimiento: row.fecha_vencimiento,
		estado: row.estado,
		lineas
	};
}

export async function fetchAllInvoicesFromDb(): Promise<Invoice[]> {
	const supabase = createSupabaseBrowserClient();
	const { data, error } = await supabase
		.from('invoices')
		.select(INVOICE_SELECT)
		.order('fecha_emision', { ascending: false });

	if (error) throw error;
	const list = ((data ?? []) as DbInvoice[]).map(mapInvoice);
	setCachedInvoices(list);
	return list;
}

export async function hydrateInvoicesFromDb(): Promise<Invoice[]> {
	return fetchAllInvoicesFromDb();
}

export async function fetchInvoiceByCaseId(caseId: string): Promise<Invoice | null> {
	const supabase = createSupabaseBrowserClient();
	const { data, error } = await supabase
		.from('invoices')
		.select(INVOICE_SELECT)
		.eq('case_id', caseId)
		.maybeSingle();

	if (error) throw error;
	if (!data) return null;
	const inv = mapInvoice(data as DbInvoice);
	upsertCachedInvoice(inv);
	return inv;
}

export async function createInvoiceInDb(caso: LabCase, client: LabClient): Promise<Invoice> {
	const supabase = createSupabaseBrowserClient();
	const { data: invoiceNumber, error: seqError } = await supabase.rpc('next_invoice_number');
	if (seqError) throw seqError;

	const { invoice: draft, lineas } = buildInvoiceDraft(caso, client, String(invoiceNumber));
	const invoiceId = crypto.randomUUID();

	const { error: invError } = await supabase.from('invoices').insert({
		id: invoiceId,
		invoice_number: draft.invoice_number,
		client_id: draft.client_id,
		case_id: draft.case_id,
		client_name: draft.client_name,
		client_clinica: draft.client_clinica,
		case_number: draft.case_number,
		paciente_name: draft.paciente_name,
		subtotal: draft.subtotal,
		impuesto: draft.impuesto,
		total: draft.total,
		fecha_emision: draft.fecha_emision,
		fecha_vencimiento: draft.fecha_vencimiento,
		estado: draft.estado
	});
	if (invError) throw invError;

	const lineRows = lineas.map((l, i) => ({
		invoice_id: invoiceId,
		sort_order: i,
		descripcion: l.descripcion,
		cantidad: l.cantidad,
		precio_unitario: l.precio_unitario,
		subtotal: l.subtotal
	}));

	if (lineRows.length > 0) {
		const { error: linesError } = await supabase.from('invoice_lines').insert(lineRows);
		if (linesError) throw linesError;
	}

	const saved = await fetchInvoiceByCaseId(caso.id);
	if (!saved) throw new Error('No se pudo cargar la factura creada');
	upsertCachedInvoice(saved);
	return saved;
}

export async function updateInvoiceStatusInDb(
	id: string,
	estado: InvoiceEstado
): Promise<Invoice | null> {
	const supabase = createSupabaseBrowserClient();
	const { error } = await supabase.from('invoices').update({ estado }).eq('id', id);
	if (error) throw error;

	const { data, error: fetchError } = await supabase
		.from('invoices')
		.select(INVOICE_SELECT)
		.eq('id', id)
		.maybeSingle();

	if (fetchError) throw fetchError;
	if (!data) return null;
	const inv = mapInvoice(data as DbInvoice);
	upsertCachedInvoice(inv);
	return inv;
}
