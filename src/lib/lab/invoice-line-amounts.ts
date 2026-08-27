/** Consistent cantidad × precio_unitario = subtotal for facturas and FE. */

export function roundMoney(n: number): number {
	return Math.round(Number(n) * 100) / 100;
}

export function invoiceLineAmounts(
	cantidad: number,
	precioUnitario: number
): { cantidad: number; precio_unitario: number; subtotal: number } {
	const cant = Math.max(1, Number(cantidad) || 1);
	const precio = roundMoney(Math.max(0, precioUnitario));
	return {
		cantidad: cant,
		precio_unitario: precio,
		subtotal: roundMoney(cant * precio)
	};
}

/**
 * Normaliza montos de línea cuando subtotal en BD no coincide con cantidad × precio.
 * Caso frecuente: cant=3, precio=270, subtotal=270 (falta multiplicar por cantidad).
 */
export function normalizeInvoiceLineAmounts(input: {
	cantidad: number;
	precio_unitario: number;
	subtotal: number;
}): { cantidad: number; precio_unitario: number; subtotal: number } {
	const cantidad = Math.max(1, Number(input.cantidad) || 1);
	const precio = roundMoney(Number(input.precio_unitario));
	const subtotalStored = roundMoney(Number(input.subtotal));
	const lineFromUnit = roundMoney(cantidad * precio);

	if (Math.abs(lineFromUnit - subtotalStored) <= 0.01) {
		return { cantidad, precio_unitario: precio, subtotal: lineFromUnit };
	}

	// subtotal guardado = precio unitario (olvidó × cantidad)
	if (cantidad > 1 && Math.abs(subtotalStored - precio) <= 0.01) {
		return invoiceLineAmounts(cantidad, precio);
	}

	// subtotal guardado es el total de línea
	const precioFromSubtotal = roundMoney(subtotalStored / cantidad);
	return invoiceLineAmounts(cantidad, precioFromSubtotal);
}

export function caseItemToInvoiceLineAmounts(item: {
	piezas: number;
	unit_price: number;
	subtotal: number;
}): { cantidad: number; precio_unitario: number; subtotal: number } {
	return normalizeInvoiceLineAmounts({
		cantidad: item.piezas,
		precio_unitario: item.unit_price,
		subtotal: item.subtotal
	});
}
