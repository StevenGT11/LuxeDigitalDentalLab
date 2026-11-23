export type InvoicePdfPortal = 'admin' | 'client';

/** URL autenticada del PDF de una factura. */
export function invoicePdfHref(
	invoiceId: string,
	opts?: { download?: boolean; portal?: InvoicePdfPortal }
): string {
	const q = opts?.download ? '?download=1' : '';
	const base =
		opts?.portal === 'client'
			? `/api/client/facturas/${invoiceId}/pdf`
			: `/api/admin/facturas/${invoiceId}/pdf`;
	return `${base}${q}`;
}

export function invoicePdfFilename(invoiceNumber: string): string {
	const safe = invoiceNumber.replace(/[^\w.-]+/g, '_');
	return `Factura-${safe}.pdf`;
}
