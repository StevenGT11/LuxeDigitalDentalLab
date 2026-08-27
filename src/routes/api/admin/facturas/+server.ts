import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireFinancialApi } from '$lib/auth/financial-api.server';
import { loadFeEmitPanelContext } from '$lib/fe/emit-panel-context.server';
import { fetchInvoiceListPage, parseInvoiceListQuery } from '$lib/lab/invoices-list.server';

/** GET /api/admin/facturas — listado paginado + contexto FE. */
export const GET: RequestHandler = async (event) => {
	const gate = await requireFinancialApi(event);
	if (!gate.ok) return gate.response;

	const listQuery = parseInvoiceListQuery(event.url.searchParams);
	const [list, emit] = await Promise.all([fetchInvoiceListPage(listQuery), loadFeEmitPanelContext()]);

	return json({ ...list, ...emit });
};
