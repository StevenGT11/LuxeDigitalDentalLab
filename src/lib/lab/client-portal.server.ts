import { error } from '@sveltejs/kit';
import { createSupabaseAdminClient } from '$lib/supabase/admin';

/** Resuelve el `clients.id` del usuario del portal (role client). */
export async function resolvePortalClientId(userId: string): Promise<string> {
	const admin = createSupabaseAdminClient();
	const { data, error: err } = await admin
		.from('clients')
		.select('id')
		.eq('profile_id', userId)
		.maybeSingle();

	if (err) throw err;
	if (!data?.id) {
		error(403, 'No hay clínica vinculada a esta cuenta.');
	}
	return data.id as string;
}

/** Verifica que la factura pertenezca a la clínica del usuario. */
export async function assertInvoiceOwnedByClient(
	invoiceId: string,
	clientId: string
): Promise<void> {
	const admin = createSupabaseAdminClient();
	const { data, error: err } = await admin
		.from('invoices')
		.select('id')
		.eq('id', invoiceId)
		.eq('client_id', clientId)
		.maybeSingle();

	if (err) throw err;
	if (!data?.id) {
		error(404, 'Factura no encontrada.');
	}
}
