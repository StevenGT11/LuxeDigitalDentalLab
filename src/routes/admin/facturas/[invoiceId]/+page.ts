import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params, depends }) => {
	depends('app:invoice-detail');

	const res = await fetch(`/api/admin/facturas/${params.invoiceId}`);
	if (!res.ok) {
		if (res.status === 404) error(404, 'Factura no encontrada');
		error(res.status, 'No se pudo cargar la factura');
	}

	return res.json();
};
