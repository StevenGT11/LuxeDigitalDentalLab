import { isValidEmailAddress } from '$lib/email';
import {
	notifyFacturaElectronicaAceptada,
	notifyNotaElectronicaAceptada
} from '$lib/email/notifications';
import { invoicePdfFilename } from '$lib/lab/invoice-pdf';
import { buildInvoicePdfBuffer, buildNotaPdfBuffer } from '$lib/lab/invoice-pdf.server';
import { createSupabaseAdminClient } from '$lib/supabase/admin';
import { fetchFeComprobanteById, fetchFeComprobanteForInvoice } from './comprobantes.server';
import { decodeHaciendaRespuestaXml } from './hacienda-respuesta-xml';
import { getEmitAmbiente } from './hacienda-settings.server';
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
	const emitAmbiente = await getEmitAmbiente();
	const fe = await fetchFeComprobanteForInvoice(invoiceId, emitAmbiente);
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
	const xmlAceptado = decodeHaciendaRespuestaXml(fe.respuesta_xml) ?? '';

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

async function loadClientRecipients(invoiceId: string, extraCorreos?: string | null) {
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
	return {
		invoiceNumber: String(invoice.invoice_number),
		clientName: client.nombre,
		to,
		cc
	};
}

function formatDestinos(to: string[], cc: string[]): string {
	return cc.length ? `${to.join(', ')} (copia: ${cc.join(', ')})` : to.join(', ');
}

/** Envía XML firmado, XML de Hacienda y PDF de una nota de crédito o débito aceptada. */
export async function sendNotaAceptadaPackageToClient(
	feComprobanteId: string,
	extraCorreos?: string | null
): Promise<string> {
	const nota = await fetchFeComprobanteById(feComprobanteId);
	if (!nota?.invoice_id) throw new Error('No se encontró la nota.');
	if (nota.tipo_documento !== '02' && nota.tipo_documento !== '03') {
		throw new Error('El comprobante no es una nota de crédito o débito.');
	}
	if (nota.estado !== 'aceptado') {
		throw new Error('La nota aún no está aceptada por Hacienda.');
	}
	const xmlFirmado = nota.xml_firmado?.trim() ?? '';
	if (!xmlFirmado) {
		throw new Error('La nota aceptada no tiene XML generado (firmado) para adjuntar.');
	}

	const { invoiceNumber, clientName, to, cc } = await loadClientRecipients(
		nota.invoice_id,
		extraCorreos
	);
	const isCredito = nota.tipo_documento === '03';
	const label = isCredito ? 'Nota de crédito' : 'Nota de débito';
	const prefix = isCredito ? 'NC' : 'ND';
	const reference = nota.consecutivo?.trim() || invoiceNumber;
	const { buffer: pdf, filename: pdfName } = await buildNotaPdfBuffer(nota.invoice_id, {
		tipo_documento: nota.tipo_documento,
		consecutivo: nota.consecutivo,
		clave: nota.clave,
		estado: nota.estado,
		subtotal: Number(nota.subtotal ?? 0),
		impuesto: Number(nota.impuesto ?? 0),
		total: Number(nota.total ?? 0),
		moneda: nota.moneda ?? 'USD',
		fecha_emision: nota.fecha_emision ?? null,
		referencia_razon: nota.referencia_razon ?? null,
		xml_firmado: nota.xml_firmado ?? null
	});
	const xmlAceptado = decodeHaciendaRespuestaXml(nota.respuesta_xml) ?? '';
	const fileKey = safeFilePart(reference);

	await notifyNotaElectronicaAceptada({
		to,
		cc,
		documentLabel: label,
		reference,
		clientName,
		clave: nota.clave,
		attachments: [
			{
				filename: `${prefix}-${fileKey}.xml`,
				content: xmlBuffer(xmlFirmado),
				contentType: 'application/xml'
			},
			...(xmlAceptado
				? [
						{
							filename: `Hacienda-${prefix}-${fileKey}.xml`,
							content: xmlBuffer(xmlAceptado),
							contentType: 'application/xml'
						}
					]
				: []),
			{
				filename: pdfName,
				content: pdf,
				contentType: 'application/pdf'
			}
		]
	});

	if (!xmlAceptado) {
		console.warn(
			`[fe-email] ${label} ${reference} aceptada sin XML de Hacienda (respuesta_xml). Se envía XML firmado y PDF.`
		);
	}

	return formatDestinos(to, cc);
}

export async function maybeSendFeAceptadaEmail(input: {
	invoiceId: string | null | undefined;
	feComprobanteId?: string | null;
	tipoDocumento?: string | null;
	previousEstado: string;
	estado: string;
	extraCorreos?: string | null;
}): Promise<string> {
	if (input.estado !== 'aceptado' || input.previousEstado === 'aceptado') return '';
	const tipo = input.tipoDocumento ?? '01';

	try {
		if (tipo === '01') {
			if (!input.invoiceId) return '';
			const to = await sendFeAceptadaPackageToClient(input.invoiceId, input.extraCorreos);
			return ` Se envió el XML generado, el XML de Hacienda y el PDF a ${to}.`;
		}
		if ((tipo === '02' || tipo === '03') && input.feComprobanteId) {
			const to = await sendNotaAceptadaPackageToClient(input.feComprobanteId, input.extraCorreos);
			const label = tipo === '03' ? 'nota de crédito' : 'nota de débito';
			return ` Se envió el XML de la ${label}, el XML de Hacienda y el PDF a ${to}.`;
		}
		return '';
	} catch (err) {
		const message = err instanceof Error ? err.message : 'No se pudo enviar el correo.';
		console.error('[fe-email] Error al enviar paquete del comprobante:', message);
		return ` Hacienda aceptó el comprobante, pero no se pudo enviar el correo al cliente: ${message}`;
	}
}
