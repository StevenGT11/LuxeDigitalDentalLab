import { normalizeImpuestoTarifaForFe } from '$lib/fe/impuesto-tarifa';

export type InvoiceLineTaxInput = {
	subtotal: number;
	impuesto_tarifa: number;
};

/** IVA and total from each line's impuesto_tarifa (tratamiento / CABYS). */
export function computeInvoiceTaxTotals(lines: InvoiceLineTaxInput[]): {
	subtotal: number;
	impuesto: number;
	total: number;
} {
	let subtotal = 0;
	let impuesto = 0;

	for (const line of lines) {
		const base = Number(line.subtotal);
		const tarifa = normalizeImpuestoTarifaForFe(line.impuesto_tarifa);
		subtotal += base;
		impuesto += base * (tarifa / 100);
	}

	subtotal = Math.round(subtotal * 100) / 100;
	impuesto = Math.round(impuesto * 100) / 100;
	const total = Math.round((subtotal + impuesto) * 100) / 100;

	return { subtotal, impuesto, total };
}

export function impuestoTarifaForCaseItem(tipoTrabajo: string, lookup: (slug: string) => { impuesto_tarifa?: number } | undefined): number {
	const treatment = lookup(tipoTrabajo);
	return normalizeImpuestoTarifaForFe(treatment?.impuesto_tarifa ?? 13);
}
