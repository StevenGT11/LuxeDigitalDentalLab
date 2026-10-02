import { feComprobanteFueEmitido } from '$lib/fe/constants';
import { CASE_ISSUED_INVOICE_MESSAGE } from '$lib/lab/case-issued';
import { createSupabaseAdminClient } from '$lib/supabase/admin';

/** Impide editar o borrar un caso si alguna de sus facturas ya se emitió a Hacienda. */
export async function assertCaseSinFacturaEmitida(caseId: string): Promise<void> {
	const admin = createSupabaseAdminClient();
	const { data: invoices, error: invoiceError } = await admin
		.from('invoices')
		.select('id')
		.eq('case_id', caseId);
	if (invoiceError) throw invoiceError;

	const invoiceIds = (invoices ?? []).map((row) => row.id as string);
	if (invoiceIds.length === 0) return;

	const { data: comprobantes, error: feError } = await admin
		.from('fe_comprobantes')
		.select('estado')
		.eq('tipo_documento', '01')
		.in('invoice_id', invoiceIds);
	if (feError) throw feError;

	if ((comprobantes ?? []).some((row) => feComprobanteFueEmitido(row.estado))) {
		throw new Error(CASE_ISSUED_INVOICE_MESSAGE);
	}
}

/** Elimina un caso y sus facturas internas que todavía no se emitieron. */
export async function deleteLabCaseAsAdmin(caseId: string): Promise<void> {
	const admin = createSupabaseAdminClient();

	const { data: caso, error: caseError } = await admin
		.from('cases')
		.select('id, case_number')
		.eq('id', caseId)
		.maybeSingle();
	if (caseError) throw caseError;
	if (!caso) throw new Error('Caso no encontrado.');

	const { data: invoices, error: invoiceError } = await admin
		.from('invoices')
		.select('id, invoice_number')
		.eq('case_id', caseId);
	if (invoiceError) throw invoiceError;

	await assertCaseSinFacturaEmitida(caseId);

	const invoiceIds = (invoices ?? []).map((row) => row.id as string);
	if (invoiceIds.length > 0) {
		const { data: comprobantes, error: feError } = await admin
			.from('fe_comprobantes')
			.select('id, estado, tipo_documento')
			.in('invoice_id', invoiceIds);
		if (feError) throw feError;

		const notas = (comprobantes ?? []).filter(
			(row) => row.tipo_documento === '02' || row.tipo_documento === '03'
		);
		const resto = (comprobantes ?? []).filter(
			(row) => row.tipo_documento !== '02' && row.tipo_documento !== '03'
		);
		if (notas.length > 0) {
			const { error } = await admin
				.from('fe_comprobantes')
				.delete()
				.in(
					'id',
					notas.map((row) => row.id as string)
				);
			if (error) throw error;
		}
		if (resto.length > 0) {
			const { error } = await admin
				.from('fe_comprobantes')
				.delete()
				.in(
					'id',
					resto.map((row) => row.id as string)
				);
			if (error) throw error;
		}

		const { error: deleteInvoicesError } = await admin.from('invoices').delete().in('id', invoiceIds);
		if (deleteInvoicesError) throw deleteInvoicesError;
	}

	const { data: files, error: filesError } = await admin
		.from('case_files')
		.select('storage_path, category')
		.eq('case_id', caseId);
	if (filesError) throw filesError;

	const scans = (files ?? [])
		.filter((file) => file.category === 'escaneo' && file.storage_path)
		.map((file) => String(file.storage_path));
	const designs = (files ?? [])
		.filter((file) => file.category !== 'escaneo' && file.storage_path)
		.map((file) => String(file.storage_path));
	if (scans.length > 0) await admin.storage.from('case-scans').remove(scans);
	if (designs.length > 0) await admin.storage.from('case-designs').remove(designs);

	const { error: deleteCaseError } = await admin.from('cases').delete().eq('id', caseId);
	if (deleteCaseError) throw deleteCaseError;
}
