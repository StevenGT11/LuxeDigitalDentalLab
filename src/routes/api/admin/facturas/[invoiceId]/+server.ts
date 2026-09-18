import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireFinancialApi } from '$lib/auth/financial-api.server';
import { loadFeEmitPanelContext } from '$lib/fe/emit-panel-context.server';
import { loadInvoiceDetailPage } from '$lib/lab/invoice-detail.server';

/** GET /api/admin/facturas/:invoiceId — detalle de factura + contexto FE. */
export const GET: RequestHandler = async (event) => {
	const gate = await requireFinancialApi(event);
	if (!gate.ok) return gate.response;

	const invoiceId = event.params.invoiceId?.trim();
	if (!invoiceId) error(400, 'Factura no válida');

	const emit = await loadFeEmitPanelContext();
	const detail = await loadInvoiceDetailPage(invoiceId, emit.emitAmbiente);

	if (!detail) error(404, 'Factura no encontrada');

	return json({ ...detail, ...emit });
};
