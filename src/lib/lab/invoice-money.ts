/** Formatea un monto en la moneda del comprobante (USD o CRC). */
export function formatInvoiceMoney(amount: number, moneda: string | null | undefined = 'USD'): string {
	const code = String(moneda ?? 'USD').toUpperCase() === 'CRC' ? 'CRC' : 'USD';
	return new Intl.NumberFormat('es-CR', {
		style: 'currency',
		currency: code,
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	}).format(amount);
}

export function normalizeInvoiceMoneda(moneda: string | null | undefined): 'CRC' | 'USD' {
	return String(moneda ?? 'USD').toUpperCase() === 'CRC' ? 'CRC' : 'USD';
}

type FeMoneyFields = {
	moneda?: string | null;
	total?: number | null;
	subtotal?: number | null;
	impuesto?: number | null;
} | null;

/**
 * Monto a mostrar en listados: si hay FE, usa total/moneda del comprobante;
 * si no, el total del libro (USD).
 */
export function invoiceDisplayTotal(
	ledgerTotal: number,
	fe: FeMoneyFields
): { amount: number; moneda: 'CRC' | 'USD' } {
	if (fe && fe.total != null && Number.isFinite(Number(fe.total))) {
		return {
			amount: Number(fe.total),
			moneda: normalizeInvoiceMoneda(fe.moneda)
		};
	}
	return { amount: Number(ledgerTotal) || 0, moneda: 'USD' };
}

/** Atajo para listados: total formateado en moneda del comprobante si hay FE. */
export function formatInvoiceListTotal(ledgerTotal: number, fe: FeMoneyFields): string {
	const display = invoiceDisplayTotal(ledgerTotal, fe);
	return formatInvoiceMoney(display.amount, display.moneda);
}

function roundMoney(amount: number): number {
	return Math.round(amount * 100) / 100;
}

/**
 * Escala líneas del libro USD a la moneda del comprobante CRC (misma lógica que el PDF).
 */
export function scaleLedgerLinesToFeCrc<
	T extends { precio_unitario: number; subtotal: number }
>(
	lines: T[],
	ledgerSubtotal: number,
	feSubtotal: number
): T[] {
	const rate = ledgerSubtotal > 0 ? feSubtotal / ledgerSubtotal : 1;
	return lines.map((line) => ({
		...line,
		precio_unitario: roundMoney(line.precio_unitario * rate),
		subtotal: roundMoney(line.subtotal * rate)
	}));
}
