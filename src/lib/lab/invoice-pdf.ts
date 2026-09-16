/** URL autenticada del PDF de una factura. */
export function invoicePdfHref(invoiceId: string, opts?: { download?: boolean }): string {
	const q = opts?.download ? '?download=1' : '';
	return `/api/admin/facturas/${invoiceId}/pdf${q}`;
}

export function invoicePdfFilename(invoiceNumber: string): string {
	const safe = invoiceNumber.replace(/[^\w.-]+/g, '_');
	return `Factura-${safe}.pdf`;
}
