import { roundMoney } from '$lib/fe/medios-pago';

/** Monedas admitidas en comprobantes electrónicos Hacienda v4.4. */
export type FeMoneda = 'CRC' | 'USD';

/** Los importes internos de factura se registran en USD. */
export const INVOICE_LEDGER_CURRENCY = 'USD' as const;

export const FE_MONEDA_OPTIONS: { code: FeMoneda; label: string }[] = [
	{ code: 'USD', label: 'Dólares (USD)' },
	{ code: 'CRC', label: 'Colones (CRC)' }
];

export function parseFeMonedaFormValue(raw: FormDataEntryValue | null): FeMoneda {
	const v = String(raw ?? 'USD')
		.trim()
		.toUpperCase();
	if (v === 'CRC' || v === 'USD') return v;
	throw new Error('Moneda inválida. Use USD o CRC.');
}

/**
 * Tipo de cambio para emitir FE:
 * - USD: colones por 1 USD (obligatorio en XML, referencia BCCR o acordado).
 * - CRC: colones por 1 USD para convertir montos del libro (USD) a colones en el comprobante.
 */
export function parseFeTipoCambioFormValue(
	raw: FormDataEntryValue | null,
	moneda: FeMoneda
): number {
	const n = Number(String(raw ?? '').replace(',', '.'));
	if (!Number.isFinite(n) || n <= 0) {
		if (moneda === 'USD') {
			throw new Error(
				'Indique el tipo de cambio (colones por 1 USD) requerido por Hacienda al facturar en dólares.'
			);
		}
		throw new Error('Indique el tipo de cambio para convertir los montos de USD a colones.');
	}
	return roundMoney(n);
}

/** Valor de `tipo_cambio` en el payload de Facturador. */
export function feTipoCambioForPayload(moneda: FeMoneda, tipoCambio: number): number {
	return moneda === 'USD' ? tipoCambio : 1;
}

/** Convierte un importe del libro (USD) al monto del comprobante según moneda elegida. */
export function feComprobanteAmountFromLedger(
	amountUsd: number,
	moneda: FeMoneda,
	tipoCambio: number
): number {
	if (moneda === 'CRC') return roundMoney(amountUsd * tipoCambio);
	return roundMoney(amountUsd);
}

export type FeMonedaEmitOptions = {
	moneda: FeMoneda;
	tipoCambio: number;
};

export function parseFeMonedaEmitForm(form: FormData): FeMonedaEmitOptions {
	const moneda = parseFeMonedaFormValue(form.get('moneda'));
	const tipoCambio = parseFeTipoCambioFormValue(form.get('tipo_cambio'), moneda);
	return { moneda, tipoCambio };
}

type ScalableInvoiceLine = {
	sort_order: number;
	descripcion: string;
	cantidad: number;
	precio_unitario: number;
	subtotal: number;
	fe_cabys: string | null;
	fe_unidad_medida: string;
	impuesto_tarifa: number;
};

type ScalableInvoice = {
	subtotal: number;
	impuesto: number;
	total: number;
	invoice_lines: ScalableInvoiceLine[];
};

/** Escala montos del libro (USD) a la moneda del comprobante electrónico. */
export function scaleInvoiceForFeMoneda<T extends ScalableInvoice>(
	invoice: T,
	moneda: FeMoneda,
	tipoCambio: number
): T {
	if (moneda === 'USD') return invoice;
	const factor = tipoCambio;
	return {
		...invoice,
		subtotal: feComprobanteAmountFromLedger(Number(invoice.subtotal), moneda, factor),
		impuesto: feComprobanteAmountFromLedger(Number(invoice.impuesto), moneda, factor),
		total: feComprobanteAmountFromLedger(Number(invoice.total), moneda, factor),
		invoice_lines: invoice.invoice_lines.map((l) => ({
			...l,
			precio_unitario: feComprobanteAmountFromLedger(Number(l.precio_unitario), moneda, factor),
			subtotal: feComprobanteAmountFromLedger(Number(l.subtotal), moneda, factor)
		}))
	};
}
