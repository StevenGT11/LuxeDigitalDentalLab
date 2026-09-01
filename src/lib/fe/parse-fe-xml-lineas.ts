import { normalizeFeUnidadMedida } from './emisor-normalize';
import { normalizeImpuestoTarifaForFe } from './impuesto-tarifa';

export type ParsedFeXmlLinea = {
	numero_linea: number;
	descripcion: string;
	cantidad: number;
	precio_unitario: number;
	subtotal: number;
	fe_cabys: string;
	fe_unidad_medida: string;
	impuesto_tarifa: number;
};

function stripXmlDeclaration(xml: string): string {
	return xml.replace(/^\uFEFF?<\?xml[^?]*\?>\s*/i, '').trim();
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

function parseIntLine(raw: string | null | undefined, fallback: number): number {
	if (!raw?.trim()) return fallback;
	const n = Number.parseInt(raw.trim(), 10);
	return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseLineaBlock(block: string, index: number): ParsedFeXmlLinea | null {
	const cabys =
		firstTagContent(block, 'CodigoCABYS')?.replace(/\D/g, '') ??
		firstTagContent(block, 'Codigo')?.replace(/\D/g, '') ??
		'';
	if (cabys.length !== 13) return null;

	const impuestoBlock = firstTagContent(block, 'Impuesto') ?? '';
	const tarifaRaw = firstTagContent(impuestoBlock, 'Tarifa');
	let impuesto_tarifa = parseAmount(tarifaRaw);
	if (impuesto_tarifa > 0 && impuesto_tarifa < 1) {
		impuesto_tarifa = normalizeImpuestoTarifaForFe(impuesto_tarifa);
	} else {
		impuesto_tarifa = normalizeImpuestoTarifaForFe(impuesto_tarifa);
	}

	const cantidad = parseAmount(firstTagContent(block, 'Cantidad')) || 1;
	const precio_unitario = parseAmount(firstTagContent(block, 'PrecioUnitario'));
	const subtotal =
		parseAmount(firstTagContent(block, 'SubTotal')) ||
		parseAmount(firstTagContent(block, 'MontoTotal')) ||
		Math.round(cantidad * precio_unitario * 100) / 100;

	return {
		numero_linea: parseIntLine(firstTagContent(block, 'NumeroLinea'), index + 1),
		descripcion: firstTagContent(block, 'Detalle') ?? `Línea ${index + 1}`,
		cantidad,
		precio_unitario,
		subtotal,
		fe_cabys: cabys,
		fe_unidad_medida: normalizeFeUnidadMedida(firstTagContent(block, 'UnidadMedida')),
		impuesto_tarifa
	};
}

/** Líneas fiscales tal como fueron aceptadas en el XML firmado de la FE. */
export function parseFeXmlLineas(xmlRaw: string | null | undefined): ParsedFeXmlLinea[] {
	if (!xmlRaw?.trim()) return [];

	const xml = stripXmlDeclaration(xmlRaw.trim());
	const re = /<(?:\w+:)?LineaDetalle(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?LineaDetalle>/gi;
	const lineas: ParsedFeXmlLinea[] = [];
	let match: RegExpExecArray | null;
	let index = 0;

	while ((match = re.exec(xml)) !== null) {
		const parsed = parseLineaBlock(match[1], index);
		if (parsed) lineas.push(parsed);
		index++;
	}

	return lineas.sort((a, b) => a.numero_linea - b.numero_linea);
}

export type FeXmlTotals = {
	subtotal: number;
	impuesto: number;
	total: number;
};

export function parseFeXmlTotals(xmlRaw: string | null | undefined): FeXmlTotals | null {
	if (!xmlRaw?.trim()) return null;
	const xml = stripXmlDeclaration(xmlRaw.trim());
	const resumen = firstTagContent(xml, 'ResumenFactura') ?? '';
	if (!resumen) return null;

	const impuesto = parseAmount(firstTagContent(resumen, 'TotalImpuesto'));
	const total = parseAmount(firstTagContent(resumen, 'TotalComprobante'));
	const gravado = parseAmount(firstTagContent(resumen, 'TotalGravado'));
	const exento = parseAmount(firstTagContent(resumen, 'TotalExento'));
	const exonerado = parseAmount(firstTagContent(resumen, 'TotalExonerado'));
	const subtotal =
		gravado + exento + exonerado > 0 ? gravado + exento + exonerado : Math.max(0, total - impuesto);

	if (total <= 0) return null;
	return { subtotal, impuesto, total };
}
