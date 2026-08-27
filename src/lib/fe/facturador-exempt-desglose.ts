/**
 * Hacienda error -488 (mensaje 88): when lines use CodigoTarifaIVA 10 (exento) with Monto 0.00,
 * ResumenFactura must include a matching TotalDesgloseImpuesto block.
 * Facturador 2.0.2 omits this for FE (tipo 01) when mixed with taxed lines.
 */

const EXEMPT_LINE_RE =
	/<Impuesto>[\s\S]*?<Codigo>01<\/Codigo>[\s\S]*?<CodigoTarifaIVA>10<\/CodigoTarifaIVA>[\s\S]*?<Monto>0(?:\.00)?<\/Monto>/;

const EXEMPT_DESGLOSE_RE =
	/<TotalDesgloseImpuesto>[\s\S]*?<Codigo>01<\/Codigo>[\s\S]*?<CodigoTarifaIVA>10<\/CodigoTarifaIVA>[\s\S]*?<TotalMontoImpuesto>0(?:\.00)?<\/TotalMontoImpuesto>/;

const EXEMPT_DESGLOSE_BLOCK = `
    <TotalDesgloseImpuesto>
      <Codigo>01</Codigo>
      <CodigoTarifaIVA>10</CodigoTarifaIVA>
      <TotalMontoImpuesto>0.00</TotalMontoImpuesto>
    </TotalDesgloseImpuesto>`;

export function xmlHasExemptTaxLines(xml: string): boolean {
	return EXEMPT_LINE_RE.test(xml) || /<CodigoTarifaIVA>10<\/CodigoTarifaIVA>[\s\S]*?<Monto>0(?:\.00)?<\/Monto>/.test(xml);
}

export function xmlHasExemptTaxDesglose(xml: string): boolean {
	return EXEMPT_DESGLOSE_RE.test(xml);
}

/** Throws if XML has exempt lines but ResumenFactura is missing the 0.00 desglose (-488). */
export function assertExemptDesglosePresent(xml: string): void {
	if (!xmlHasExemptTaxLines(xml)) return;
	if (xmlHasExemptTaxDesglose(xml)) return;
	throw new Error(
		'XML sin TotalDesgloseImpuesto exento (Codigo 01, CodigoTarifaIVA 10, TotalMontoImpuesto 0.00). Hacienda rechazaría con -488.'
	);
}

export function patchFacturaXmlExemptDesglose(xml: string): string {
	if (!xmlHasExemptTaxLines(xml)) return xml;
	if (xmlHasExemptTaxDesglose(xml)) return xml;

	const closingTag = '</TotalDesgloseImpuesto>';
	const lastDesglose = xml.lastIndexOf(closingTag);
	if (lastDesglose !== -1) {
		const insertAt = lastDesglose + closingTag.length;
		return `${xml.slice(0, insertAt)}${EXEMPT_DESGLOSE_BLOCK}${xml.slice(insertAt)}`;
	}

	const marker = '<TotalImpuesto>';
	const idx = xml.indexOf(marker);
	if (idx === -1) return xml;

	return `${xml.slice(0, idx)}${EXEMPT_DESGLOSE_BLOCK}\n    ${xml.slice(idx)}`;
}
