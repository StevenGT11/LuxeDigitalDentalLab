import type { FeMensajeReceptorTipo, FeRecibidoEstado } from './fe-recibidos.types';

export const FE_RECIBIDO_ESTADOS: { value: FeRecibidoEstado; label: string }[] = [
	{ value: 'pendiente_aceptacion', label: 'Pendiente de aceptar' },
	{ value: 'mensaje_enviado', label: 'Enviando confirmación' },
	{ value: 'aceptado', label: 'Aceptada ante Hacienda' },
	{ value: 'rechazado', label: 'Rechazada' },
	{ value: 'vencido', label: 'Plazo vencido' }
];

export function getFeRecibidoEstadoLabel(estado: FeRecibidoEstado | string): string {
	return FE_RECIBIDO_ESTADOS.find((e) => e.value === estado)?.label ?? estado;
}

export function getFeRecibidoEstadoClass(estado: FeRecibidoEstado | string): string {
	switch (estado) {
		case 'aceptado':
			return 'badge badge--success';
		case 'rechazado':
		case 'vencido':
			return 'badge badge--danger';
		case 'mensaje_enviado':
			return 'badge badge--warning';
		default:
			return 'badge badge--muted';
	}
}

export function feRecibidoCanResponder(estado: FeRecibidoEstado | string): boolean {
	return estado === 'pendiente_aceptacion';
}

export function feRecibidoCanConsultar(
	estado: FeRecibidoEstado | string,
	mensajeEstado: string | null | undefined
): boolean {
	return estado === 'mensaje_enviado' || mensajeEstado === 'enviado' || mensajeEstado === 'procesando';
}

export function mensajeReceptorTipoToCodigo(tipo: FeMensajeReceptorTipo): 1 | 2 | 3 {
	switch (tipo) {
		case 'aceptado_parcial':
			return 2;
		case 'rechazado':
			return 3;
		default:
			return 1;
	}
}

export function codigoToMensajeReceptorTipo(codigo: 1 | 2 | 3): FeMensajeReceptorTipo {
	if (codigo === 2) return 'aceptado_parcial';
	if (codigo === 3) return 'rechazado';
	return 'aceptado';
}
