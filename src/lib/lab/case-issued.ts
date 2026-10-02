import { feComprobanteFueEmitido } from '$lib/fe/constants';
import { createSupabaseBrowserClient } from '$lib/supabase/client';

export const CASE_ISSUED_INVOICE_MESSAGE =
	'Este caso ya tiene una factura emitida. No se puede editar ni eliminar.';

export function invoicesIncludeIssuedFe(
	invoices: { fe?: { estado?: string | null } | null }[]
): boolean {
	return invoices.some((invoice) => feComprobanteFueEmitido(invoice.fe?.estado));
}

/** True si alguna factura del caso tiene FE enviada a Hacienda. */
export async function fetchCaseHasIssuedInvoice(caseId: string): Promise<boolean> {
	const supabase = createSupabaseBrowserClient();
	const { data: invoices, error } = await supabase.from('invoices').select('id').eq('case_id', caseId);
	if (error) return true;
	const invoiceIds = (invoices ?? []).map((row) => row.id as string);
	if (invoiceIds.length === 0) return false;

	const { data: comprobantes, error: feError } = await supabase
		.from('fe_comprobantes')
		.select('estado')
		.eq('tipo_documento', '01')
		.in('invoice_id', invoiceIds);
	if (feError) return true;
	return (comprobantes ?? []).some((row) => feComprobanteFueEmitido(row.estado));
}
