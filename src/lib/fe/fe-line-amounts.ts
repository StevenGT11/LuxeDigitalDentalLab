import {
	normalizeInvoiceLineAmounts,
	roundMoney
} from '$lib/lab/invoice-line-amounts';

export { roundMoney };

/** Facturador uses cantidad × precio_unitario for XML MontoTotal — align with stored subtotal. */
export function normalizeLineAmountsForFe(input: {
	cantidad: number;
	precio_unitario: number;
	subtotal: number;
}): { cantidad: number; precio_unitario: number } {
	const normalized = normalizeInvoiceLineAmounts(input);
	return {
		cantidad: normalized.cantidad,
		precio_unitario: normalized.precio_unitario
	};
}
