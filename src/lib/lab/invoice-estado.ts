/** Estado de cobro — sin dependencias del catálogo de tratamientos. */
export const INVOICE_ESTADOS = [
	{ value: 'pendiente', label: 'Pendiente' },
	{ value: 'facturado', label: 'Facturado' },
	{ value: 'pagado', label: 'Pagado' },
	{ value: 'cancelada', label: 'Cancelada' }
] as const;

export function getInvoiceEstadoLabel(estado: string): string {
	if (estado === 'pagada') return 'Pagado';
	return INVOICE_ESTADOS.find((e) => e.value === estado)?.label ?? estado;
}

export function getInvoiceEstadoClass(estado: string): string {
	switch (estado) {
		case 'pendiente':
			return 'status-chip status-chip--invoice-pendiente';
		case 'facturado':
			return 'status-chip status-chip--invoice-facturado';
		case 'pagado':
		case 'pagada':
			return 'status-chip status-chip--invoice-pagado';
		case 'cancelada':
			return 'status-chip status-chip--invoice-cancelada';
		default:
			return 'status-chip';
	}
}
