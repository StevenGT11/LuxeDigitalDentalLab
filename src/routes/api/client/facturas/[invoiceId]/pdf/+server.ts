import { error, isHttpError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireClientApi } from '$lib/auth/client-api.server';
import {
	assertInvoiceOwnedByClient,
	resolvePortalClientId
} from '$lib/lab/client-portal.server';
import { buildInvoicePdfBuffer } from '$lib/lab/invoice-pdf.server';

/** GET /api/client/facturas/:invoiceId/pdf — PDF solo de facturas de la clínica. */
export const GET: RequestHandler = async (event) => {
	const gate = await requireClientApi(event);
	if (!gate.ok) return gate.response;

	const invoiceId = event.params.invoiceId?.trim();
	if (!invoiceId) error(400, 'Factura no válida');

	try {
		const clientId = await resolvePortalClientId(gate.userId);
		await assertInvoiceOwnedByClient(invoiceId, clientId);
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
		if (isHttpError(err)) throw err;
		const message = err instanceof Error ? err.message : 'No se pudo generar el PDF.';
		if (message.includes('no encontrada')) error(404, message);
		error(500, message);
	}
};
