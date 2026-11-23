import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { getEmitAmbiente } from '$lib/fe/hacienda-settings.server';
import { resolvePortalClientId } from '$lib/lab/client-portal.server';
import { fetchClientInvoices } from '$lib/lab/invoices-list.server';

export const load: PageServerLoad = async ({ parent }) => {
	const { user, profile } = await parent();
	if (!user || profile?.role !== 'client') {
		error(403, 'Sin permiso.');
	}

	const clientId = await resolvePortalClientId(user.id);
	const emitAmbiente = await getEmitAmbiente();
	const invoices = await fetchClientInvoices(clientId, emitAmbiente);

	return { invoices };
};
