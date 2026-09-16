import { isValidEmailAddress } from '$lib/email';
import { notifyFacturaElectronicaAceptada } from '$lib/email/notifications';
import { invoicePdfFilename } from '$lib/lab/invoice-pdf';
import { buildInvoicePdfBuffer } from '$lib/lab/invoice-pdf.server';
import { createSupabaseAdminClient } from '$lib/supabase/admin';
import { fetchFeComprobanteForInvoice } from './comprobantes.server';

function safeFilePart(value: string): string {
	return value.replace(/[^\w.-]+/g, '_');
}

function xmlBuffer(xml: string): Buffer {
	return Buffer.from(xml.trim(), 'utf8');
}

/**
 * Envía al correo FE del cliente el XML firmado, el XML de aceptación de Hacienda y el PDF.
 * Solo debe llamarse cuando el estado pasa a aceptado por primera vez.
 */
export async function sendFeAceptadaPackageToClient(invoiceId: string): Promise<string> {
	const fe = await fetchFeComprobanteForInvoice(invoiceId);
	if (!fe) throw new Error('No hay comprobante electrónico para esta factura.');

	const xmlFirmado = fe.xml_firmado?.trim() ?? '';
	if (!xmlFirmado) {
		throw new Error('El comprobante aceptado no tiene XML generado (firmado) para adjuntar.');
	}

	const admin = createSupabaseAdminClient();
	const { data: invoice, error: invoiceError } = await admin
		.from('invoices')
		.select('invoice_number, client_id')
		.eq('id', invoiceId)
		.single();
	if (invoiceError || !invoice) throw new Error('Factura no encontrada.');

	const { data: client, error: clientError } = await admin
		.from('clients')
		.select('nombre, fe_correo_facturacion')
		.eq('id', invoice.client_id)
		.single();
	if (clientError || !client) throw new Error('Cliente no encontrado.');

	const to = client.fe_correo_facturacion?.trim().toLowerCase() ?? '';
	if (!isValidEmailAddress(to)) {
		throw new Error(
			'El cliente no tiene un correo de facturación válido. Indíquelo en Datos fiscales (receptor FE) antes de enviar el paquete de Hacienda.'
		);
	}

	const invoiceNumber = String(invoice.invoice_number);
	const { buffer: pdf, filename: pdfName } = await buildInvoicePdfBuffer(invoiceId);
	const xmlAceptado = fe.respuesta_xml?.trim() ?? '';

	const attachments = [
		{
			filename: `FE-${safeFilePart(invoiceNumber)}.xml`,
			content: xmlBuffer(xmlFirmado),
			contentType: 'application/xml'
		},
		...(xmlAceptado
			? [
					{
						filename: `Hacienda-${safeFilePart(invoiceNumber)}.xml`,
						content: xmlBuffer(xmlAceptado),
						contentType: 'application/xml'
					}
				]
			: []),
		{
			filename: pdfName || invoicePdfFilename(invoiceNumber),
			content: pdf,
			contentType: 'application/pdf'
		}
	];

	if (!xmlAceptado) {
		console.warn(
			`[fe-email] FE ${invoiceNumber} aceptada sin XML de Hacienda (respuesta_xml). Se envía XML firmado y PDF.`
		);
	}

	await notifyFacturaElectronicaAceptada({
		to,
		invoiceNumber,
		clientName: client.nombre,
		clave: fe.clave,
		attachments
	});

	return to;
}

export async function maybeSendFeAceptadaEmail(input: {
	invoiceId: string | null | undefined;
	tipoDocumento?: string | null;
	previousEstado: string;
	estado: string;
}): Promise<string> {
	if (input.estado !== 'aceptado' || input.previousEstado === 'aceptado') return '';
	if ((input.tipoDocumento ?? '01') !== '01' || !input.invoiceId) return '';

	try {
		const to = await sendFeAceptadaPackageToClient(input.invoiceId);
		return ` Se envió el XML generado, el XML de Hacienda y el PDF a ${to}.`;
	} catch (err) {
		const message = err instanceof Error ? err.message : 'No se pudo enviar el correo.';
		console.error('[fe-email] Error al enviar paquete FE:', message);
		return ` Hacienda aceptó el comprobante, pero no se pudo enviar el correo al cliente: ${message}`;
	}
}
