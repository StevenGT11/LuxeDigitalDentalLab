import { assertCaseSinFacturaEmitida } from '$lib/lab/delete-case.server';
import { createSupabaseAdminClient } from '$lib/supabase/admin';

/** Marca un caso como garantía: ítems, costo y facturas internas del caso quedan en $0. */
export async function applyCaseGarantiaAsAdmin(
	caseId: string,
	editor: { id: string; nombre: string }
): Promise<void> {
	const admin = createSupabaseAdminClient();
	const { data: caso, error: caseError } = await admin
		.from('cases')
		.select('id')
		.eq('id', caseId)
		.maybeSingle();
	if (caseError) throw caseError;
	if (!caso) throw new Error('Caso no encontrado.');

	await assertCaseSinFacturaEmitida(caseId);

	const { error: itemsError } = await admin
		.from('case_items')
		.update({ unit_price: 0, subtotal: 0 })
		.eq('case_id', caseId);
	if (itemsError) throw itemsError;

	const { error: updateCaseError } = await admin
		.from('cases')
		.update({
			costo: 0,
			last_edited_at: new Date().toISOString(),
			last_edited_by: editor.id,
			last_edited_by_name: editor.nombre
		})
		.eq('id', caseId);
	if (updateCaseError) throw updateCaseError;

	const { data: invoices, error: invoicesError } = await admin
		.from('invoices')
		.select('id')
		.eq('case_id', caseId);
	if (invoicesError) throw invoicesError;

	const invoiceIds = (invoices ?? []).map((row) => row.id as string);
	if (invoiceIds.length === 0) return;

	const { error: linesError } = await admin
		.from('invoice_lines')
		.update({ precio_unitario: 0, subtotal: 0 })
		.in('invoice_id', invoiceIds);
	if (linesError) throw linesError;

	const { error: totalsError } = await admin
		.from('invoices')
		.update({ subtotal: 0, impuesto: 0, total: 0 })
		.in('id', invoiceIds);
	if (totalsError) throw totalsError;
}
