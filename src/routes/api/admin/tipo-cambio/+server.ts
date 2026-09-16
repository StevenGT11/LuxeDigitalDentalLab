import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireFinancialApi } from '$lib/auth/financial-api.server';
import { fetchTipoCambioUsd } from '$lib/fe/tipo-cambio.server';

/** GET /api/admin/tipo-cambio — USD/CRC de Hacienda (BCCR), tipo venta. */
export const GET: RequestHandler = async (event) => {
	const gate = await requireFinancialApi(event);
	if (!gate.ok) return gate.response;

	try {
		const tc = await fetchTipoCambioUsd();
		return json(tc);
	} catch (err) {
		const message =
			err instanceof Error ? err.message : 'No se pudo obtener el tipo de cambio.';
		return json({ error: message }, { status: 502 });
	}
};
