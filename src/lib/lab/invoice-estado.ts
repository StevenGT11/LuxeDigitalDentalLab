import type { InvoiceEstado } from './types';

/** Estado de cobro — sin dependencias del catálogo de tratamientos. */
export const INVOICE_ESTADOS = [
	{ value: 'pendiente', label: 'Pendiente' },
	{ value: 'facturado', label: 'Facturado' },
	{ value: 'pagado', label: 'Pagado' },
	{ value: 'cancelada', label: 'Cancelada' }
] as const;

/** Estados que el usuario puede elegir a mano (Facturado solo lo pone Hacienda). */
export const INVOICE_ESTADOS_MANUAL = INVOICE_ESTADOS.filter((e) => e.value !== 'facturado');

/**
 * Opciones del select de cobro. Facturado no se elige a mano: solo aparece
 * cuando ya está facturado y Hacienda aceptó la FE.
 */
export function invoiceCobroSelectOptions(estado: string, feEstado?: string | null) {
	if (estado === 'facturado' && feEstado === 'aceptado') return [...INVOICE_ESTADOS];
	if (estado === 'facturado') {
		const facturado = INVOICE_ESTADOS.find((e) => e.value === 'facturado');
		return facturado ? [facturado, ...INVOICE_ESTADOS_MANUAL] : [...INVOICE_ESTADOS_MANUAL];
	}
	return [...INVOICE_ESTADOS_MANUAL];
}

export type InvoiceTrafficTone = 'danger' | 'warning' | 'success' | 'muted';

export function parseInvoiceEstado(raw: string): InvoiceEstado {
	const value = raw === 'pagada' ? 'pagado' : raw;
	if (INVOICE_ESTADOS.some((e) => e.value === value)) return value as InvoiceEstado;
	throw new Error('Estado de cobro no válido.');
}

export function getInvoiceEstadoLabel(estado: string): string {
	if (estado === 'pagada') return 'Pagado';
	return INVOICE_ESTADOS.find((e) => e.value === estado)?.label ?? estado;
}

function isInvoicePagado(estado: string): boolean {
	return estado === 'pagado' || estado === 'pagada';
}

/** FE emitida / en Hacienda (no cuenta rechazo, error ni “sin enviar”). */
export function invoiceHasElectronica(feEstado: string | null | undefined): boolean {
	return feEstado === 'aceptado' || feEstado === 'enviado' || feEstado === 'procesando';
}

/**
 * Semáforo de factura:
 * - rojo: pendiente de cobro y sin electrónica
 * - amarillo: con electrónica y sin pagar (o pagada sin FE)
 * - verde: pagada y con electrónica
 */
export function getInvoiceTrafficTone(
	estado: string,
	feEstado?: string | null
): InvoiceTrafficTone {
	if (estado === 'cancelada') return 'muted';
	const pagado = isInvoicePagado(estado);
	const electronica = invoiceHasElectronica(feEstado);
	if (pagado && electronica) return 'success';
	if (electronica && !pagado) return 'warning';
	if (!pagado && !electronica) return 'danger';
	return 'warning';
}

export function getInvoiceEstadoClass(estado: string, feEstado?: string | null): string {
	switch (getInvoiceTrafficTone(estado, feEstado)) {
		case 'danger':
			return 'status-chip status-chip--invoice-pendiente';
		case 'warning':
			return 'status-chip status-chip--invoice-facturado';
		case 'success':
			return 'status-chip status-chip--invoice-pagado';
		case 'muted':
			return 'status-chip status-chip--invoice-cancelada';
		default:
			return 'status-chip';
	}
}

export function getInvoiceRowClass(estado: string, feEstado?: string | null): string {
	const tone = getInvoiceTrafficTone(estado, feEstado);
	if (tone === 'muted') return '';
	return `invoice-row invoice-row--${tone}`;
}
