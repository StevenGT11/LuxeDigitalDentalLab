export type FeMedioPagoItem = {
	tipo: string;
	monto: number;
};

/** Medios de pago Hacienda v4.4 (tipo en `medios_pago`). */
export const FE_MEDIO_PAGO_OPTIONS: { tipo: string; label: string }[] = [
	{ tipo: '99', label: 'Otros' },
	{ tipo: '01', label: 'Efectivo' },
	{ tipo: '02', label: 'Tarjeta' },
	{ tipo: '03', label: 'Cheque' },
	{ tipo: '04', label: 'Transferencia / Depósito' },
	{ tipo: '05', label: 'Recaudado por terceros' },
	{ tipo: '06', label: 'SINPE Móvil' }
];

export function roundMoney(n: number): number {
	return Math.round(n * 100) / 100;
}

export function parseMediosPagoFormValue(raw: FormDataEntryValue | null): FeMedioPagoItem[] | undefined {
	if (raw == null || String(raw).trim() === '') return undefined;
	try {
		const parsed = JSON.parse(String(raw)) as unknown;
		if (!Array.isArray(parsed)) throw new Error('Formato inválido.');
		const items: FeMedioPagoItem[] = [];
		for (const row of parsed) {
			if (!row || typeof row !== 'object') continue;
			const tipo = String((row as FeMedioPagoItem).tipo ?? '').trim();
			const monto = Number((row as FeMedioPagoItem).monto);
			if (!tipo || !Number.isFinite(monto) || monto <= 0) continue;
			items.push({ tipo, monto: roundMoney(monto) });
		}
		if (items.length === 0) throw new Error('Indique al menos un medio de pago con monto.');
		return items;
	} catch (err) {
		if (err instanceof Error && err.message) throw err;
		throw new Error('No se pudo leer los medios de pago.');
	}
}

export function assertMediosPagoMatchTotal(medios: FeMedioPagoItem[], total: number): void {
	const sum = roundMoney(medios.reduce((s, m) => s + m.monto, 0));
	const expected = roundMoney(total);
	if (Math.abs(sum - expected) > 0.01) {
		throw new Error(
			`Los medios de pago (₡${sum.toFixed(2)}) deben sumar el total del comprobante (₡${expected.toFixed(2)}).`
		);
	}
}
