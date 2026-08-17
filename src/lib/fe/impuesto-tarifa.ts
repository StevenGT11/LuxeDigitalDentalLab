/** Tarifas IVA permitidas en FE v4.4 (porcentaje en XML `<Tarifa>`). */
export const FE_IVA_TARIFA_PCT = [0, 1, 2, 4, 13] as const;

export type FeIvaTarifaPct = (typeof FE_IVA_TARIFA_PCT)[number];

/**
 * Normaliza el valor guardado en BD/UI al porcentaje que espera Facturador/Hacienda.
 * Corrige errores frecuentes: 0.13 (CABYS), 8 (confundido con CodigoTarifaIVA 08).
 */
export function normalizeImpuestoTarifaForFe(raw: unknown): FeIvaTarifaPct {
	let n = Number(raw);
	if (!Number.isFinite(n)) return 13;

	if (n > 0 && n < 1) {
		n = Math.round(n * 10000) / 100;
	}

	if (n === 8) return 13;

	for (const allowed of FE_IVA_TARIFA_PCT) {
		if (Math.abs(n - allowed) < 0.001) return allowed;
	}

	return 13;
}

/** Códigos CodigoTarifaIVA (Hacienda FE v4.4) para cada porcentaje. */
export function impuestoTarifaToCodigoTarifaIva(tarifa: FeIvaTarifaPct): string {
	switch (tarifa) {
		case 0:
			return '10';
		case 1:
			return '02';
		case 2:
			return '03';
		case 4:
			return '04';
		case 13:
			return '08';
		default:
			return '08';
	}
}

export function impuestoTarifaNeedsFix(raw: unknown): boolean {
	const n = Number(raw);
	if (!Number.isFinite(n)) return true;
	const normalized = normalizeImpuestoTarifaForFe(raw);
	return Math.abs(n - normalized) > 0.001;
}
