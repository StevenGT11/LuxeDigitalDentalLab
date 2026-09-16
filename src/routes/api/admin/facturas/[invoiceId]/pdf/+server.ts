import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireFinancialApi } from '$lib/auth/financial-api.server';
import { buildInvoicePdfBuffer } from '$lib/lab/invoice-pdf.server';

/** GET /api/admin/facturas/:invoiceId/pdf — representación gráfica PDF. */
export const GET: RequestHandler = async (event) => {
	const gate = await requireFinancialApi(event);
	if (!gate.ok) return gate.response;

	const invoiceId = event.params.invoiceId?.trim();
	if (!invoiceId) error(400, 'Factura no válida');

	try {
		const { buffer, filename } = await buildInvoicePdfBuffer(invoiceId);
		const download = event.url.searchParams.get('download') === '1';
		return new Response(buffer, {
			headers: {
				'Content-Type': 'application/pdf',
				'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
				'Cache-Control': 'private, no-store'
			}
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : 'No se pudo generar el PDF.';
		if (message.includes('no encontrada')) error(404, message);
		error(500, message);
	}
};
