import type { ParsedRecibidoXml } from './fe-recibidos.types';

const ROOT_TIPO: Record<string, string> = {
	FacturaElectronica: '01',
	NotaDebitoElectronica: '02',
	NotaCreditoElectronica: '03',
	TiqueteElectronico: '04',
	FacturaElectronicaExportacion: '09'
};

function stripXmlDeclaration(xml: string): string {
	return xml.replace(/^\uFEFF?<\?xml[^?]*\?>\s*/i, '').trim();
}

function localName(tag: string): string {
	const idx = tag.indexOf(':');
	return idx >= 0 ? tag.slice(idx + 1) : tag;
}

function firstTagContent(xml: string, tagName: string, scope?: string): string | null {
	const haystack = scope ?? xml;
	const re = new RegExp(
		`<(?:\\w+:)?${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${tagName}>`,
		'i'
	);
	const match = haystack.match(re);
	return match?.[1]?.trim() ?? null;
}

function parseAmount(raw: string | null | undefined): number {
	if (!raw?.trim()) return 0;
	const n = Number.parseFloat(raw.trim());
	return Number.isFinite(n) ? n : 0;
}

function detectTipoDocumento(xml: string): string {
	const rootMatch = xml.match(/<(?:\w+:)?(\w+)[^>]*>/);
	const root = rootMatch ? localName(rootMatch[1]) : '';
	if (root === 'MensajeReceptor') {
		throw new Error('Este archivo es un Mensaje Receptor, no un comprobante del proveedor.');
	}
	const tipo = ROOT_TIPO[root];
	if (!tipo) {
		throw new Error(`Tipo de comprobante no reconocido (${root || 'desconocido'}).`);
	}
	return tipo;
}

/** Extrae datos mínimos del XML firmado recibido del proveedor. */
export function parseRecibidoXml(xmlRaw: string): ParsedRecibidoXml {
	const xml = stripXmlDeclaration(xmlRaw.trim());
	if (!xml.includes('<')) {
		throw new Error('El archivo no parece ser XML válido.');
	}

	const tipo_documento = detectTipoDocumento(xml);
	const clave = firstTagContent(xml, 'Clave');
	if (!clave || !/^\d{50}$/.test(clave)) {
		throw new Error('No se encontró una clave válida de 50 dígitos en el XML.');
	}

	const emisorBlock = firstTagContent(xml, 'Emisor');
	if (!emisorBlock) throw new Error('No se encontró el bloque Emisor en el XML.');

	const identBlock = firstTagContent(emisorBlock, 'Identificacion');
	const emisor_tipo_identificacion = firstTagContent(identBlock ?? emisorBlock, 'Tipo') ?? '01';
	const emisor_numero_identificacion =
		firstTagContent(identBlock ?? emisorBlock, 'Numero')?.replace(/\D/g, '') ?? '';
	if (!emisor_numero_identificacion) {
		throw new Error('No se encontró la identificación del emisor.');
	}

	const emisor_nombre = firstTagContent(emisorBlock, 'Nombre') ?? '';
	const fecha_emision_doc_raw = firstTagContent(xml, 'FechaEmision');
	if (!fecha_emision_doc_raw) {
		throw new Error('No se encontró FechaEmision en el XML.');
	}

	const parsedDate = new Date(fecha_emision_doc_raw);
	if (Number.isNaN(parsedDate.getTime())) {
		throw new Error('FechaEmision con formato inválido.');
	}

	const resumen = firstTagContent(xml, 'ResumenFactura') ?? '';
	const impuesto = parseAmount(firstTagContent(resumen, 'TotalImpuesto'));
	const total = parseAmount(firstTagContent(resumen, 'TotalComprobante'));
	const gravado = parseAmount(firstTagContent(resumen, 'TotalGravado'));
	const exento = parseAmount(firstTagContent(resumen, 'TotalExento'));
	const exonerado = parseAmount(firstTagContent(resumen, 'TotalExonerado'));
	const subtotal =
		gravado + exento + exonerado > 0 ? gravado + exento + exonerado : Math.max(0, total - impuesto);

	const moneda = firstTagContent(resumen, 'CodigoMoneda') ?? 'CRC';

	return {
		clave,
		tipo_documento,
		emisor_tipo_identificacion,
		emisor_numero_identificacion,
		emisor_nombre,
		fecha_emision: parsedDate.toISOString(),
		fecha_emision_doc_raw,
		subtotal: Math.round(subtotal * 100) / 100,
		impuesto: Math.round(impuesto * 100) / 100,
		total: Math.round(total * 100) / 100,
		moneda
	};
}
