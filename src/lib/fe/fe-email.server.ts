import { isValidEmailAddress } from '$lib/email';
import { notifyFacturaElectronicaAceptada } from '$lib/email/notifications';
import { invoicePdfFilename } from '$lib/lab/invoice-pdf';
import { buildInvoicePdfBuffer } from '$lib/lab/invoice-pdf.server';
import { createSupabaseAdminClient } from '$lib/supabase/admin';
import { fetchFeComprobanteForInvoice } from './comprobantes.server';
import { invalidFeCorreos, mergeFeCorreos, parseFeCorreos, primaryFeCorreo } from './fe-correos';

function safeFilePart(value: string): string {
	return value.replace(/[^\w.-]+/g, '_');
}

function xmlBuffer(xml: string): Buffer {
	return Buffer.from(xml.trim(), 'utf8');
}

function resolveRecipients(
	stored: string | null | undefined,
	fallbackEmail: string | null | undefined
): string[] {
	const storedEmails = parseFeCorreos(stored).filter((e) => isValidEmailAddress(e));
	if (storedEmails.length) return storedEmails;
	const fallback = primaryFeCorreo(null, fallbackEmail);
	if (fallback) return [fallback];
	throw new Error(
		'El cliente no tiene un correo de facturación válido. Indíquelo en Datos fiscales (receptor FE) o escríbalo al enviar.'
	);
}

/**
 * Envía el XML firmado, el XML de aceptación de Hacienda y el PDF.
 * `extraCorreos`: copia (CC) además del correo del cliente.
 */
export async function sendFeAceptadaPackageToClient(
	invoiceId: string,
	extraCorreos?: string | null
): Promise<string> {
	const fe = await fetchFeComprobanteForInvoice(invoiceId);
	if (!fe) throw new Error('No hay comprobante electrónico para esta factura.');
	if (fe.estado !== 'aceptado') {
		throw new Error('La factura electrónica aún no está aceptada por Hacienda.');
	}

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
		.select('nombre, email, fe_correo_facturacion')
		.eq('id', invoice.client_id)
		.single();
	if (clientError || !client) throw new Error('Cliente no encontrado.');

	const to = resolveRecipients(client.fe_correo_facturacion, client.email);
	const extraRaw = extraCorreos?.trim() ?? '';
	if (extraRaw) {
		const invalid = invalidFeCorreos(extraRaw);
		if (invalid.length) {
			throw new Error(`Correo inválido: ${invalid.join(', ')}`);
		}
	}
	const cc = mergeFeCorreos(extraRaw).filter(
		(email) => !to.some((r) => r.toLowerCase() === email.toLowerCase())
	);

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
		cc,
		invoiceNumber,
		clientName: client.nombre,
		clave: fe.clave,
		attachments
	});

	return cc.length ? `${to.join(', ')} (copia: ${cc.join(', ')})` : to.join(', ');
}

export async function maybeSendFeAceptadaEmail(input: {
	invoiceId: string | null | undefined;
	tipoDocumento?: string | null;
	previousEstado: string;
	estado: string;
	extraCorreos?: string | null;
}): Promise<string> {
	if (input.estado !== 'aceptado' || input.previousEstado === 'aceptado') return '';
	if ((input.tipoDocumento ?? '01') !== '01' || !input.invoiceId) return '';

	try {
		const to = await sendFeAceptadaPackageToClient(input.invoiceId, input.extraCorreos);
		return ` Se envió el XML generado, el XML de Hacienda y el PDF a ${to}.`;
	} catch (err) {
		const message = err instanceof Error ? err.message : 'No se pudo enviar el correo.';
		console.error('[fe-email] Error al enviar paquete FE:', message);
		return ` Hacienda aceptó el comprobante, pero no se pudo enviar el correo al cliente: ${message}`;
	}
}
