import type { FeComprobanteEstado } from './types';

export const FE_UNIDAD_MEDIDA_OPTIONS = [
	{ value: 'Sp', label: 'Sp — Servicio profesional' },
	{ value: 'Spe', label: 'Spe — Servicio profesional especial' },
	{ value: 'OS', label: 'OS — Otro servicio' },
	{ value: 'Unid', label: 'Unid — Unidad (mercancía)' }
] as const;

/** Tarifas IVA habituales (impuesto_tarifa en XML FE v4.4). */
export const FE_IMPUESTO_TARIFA_OPTIONS = [
	{ value: 0, label: '0% — Exento' },
	{ value: 1, label: '1%' },
	{ value: 2, label: '2%' },
	{ value: 4, label: '4%' },
	{ value: 13, label: '13% — General' }
] as const;

export function isValidFeCabys(value: string | null | undefined): boolean {
	if (!value?.trim()) return true;
	return /^\d{13}$/.test(value.trim());
}

export const FE_TIPO_IDENTIFICACION_OPTIONS = [
	{ value: '01', label: 'Cédula física' },
	{ value: '02', label: 'Cédula jurídica' },
	{ value: '03', label: 'DIMEX' },
	{ value: '04', label: 'NITE' }
] as const;

export const FE_AMBIENTE_OPTIONS = [
	{ value: 'staging', label: 'Pruebas (staging)' },
	{ value: 'production', label: 'Producción' }
] as const;

/** Contadores de consecutivo Hacienda por tipo de comprobante. */
export const FE_CONSECUTIVO_DOC_TYPES = [
	{ tipo: '01', label: 'Factura electrónica (FE)' },
	{ tipo: '02', label: 'Nota de débito (ND)' },
	{ tipo: '03', label: 'Nota de crédito (NC)' },
	{ tipo: '04', label: 'Tiquete electrónico (TE)' },
	{ tipo: '08', label: 'Factura compra (FEC)' }
] as const;

export function getFeTipoDocumentoLabel(tipo: string): string {
	return FE_CONSECUTIVO_DOC_TYPES.find((d) => d.tipo === tipo)?.label ?? `Tipo ${tipo}`;
}

export const FE_COMPROBANTE_ESTADOS: { value: FeComprobanteEstado; label: string }[] = [
	{ value: 'pendiente_envio', label: 'Sin enviar' },
	{ value: 'enviado', label: 'Enviado a Hacienda' },
	{ value: 'procesando', label: 'Procesando' },
	{ value: 'aceptado', label: 'Aceptada' },
	{ value: 'rechazado', label: 'Rechazada' },
	{ value: 'error', label: 'Error' }
];

export function getFeComprobanteEstadoLabel(estado: FeComprobanteEstado | string): string {
	return FE_COMPROBANTE_ESTADOS.find((e) => e.value === estado)?.label ?? estado;
}

export function getFeComprobanteEstadoClass(estado: FeComprobanteEstado | string): string {
	switch (estado) {
		case 'aceptado':
			return 'badge badge--success';
		case 'rechazado':
		case 'error':
			return 'badge badge--danger';
		case 'enviado':
		case 'procesando':
			return 'badge badge--warning';
		default:
			return 'badge badge--muted';
	}
}

/** Estados en los que no se debe volver a emitir tipo 01. */
export function feComprobanteBlocksEmit(estado: FeComprobanteEstado | null | undefined): boolean {
	return estado === 'aceptado' || estado === 'enviado' || estado === 'procesando';
}

/** Tras corregir datos (emisor, cliente, CABYS, etc.) se puede generar un nuevo envío. */
export function feComprobanteCanReemit(estado: FeComprobanteEstado | null | undefined): boolean {
	return estado === 'rechazado' || estado === 'error';
}

export function feComprobanteCanConsultar(estado: FeComprobanteEstado | null | undefined): boolean {
	return estado === 'enviado' || estado === 'procesando' || estado === 'error';
}

/** Borrador creado pero aún no enviado a Hacienda. */
export function feComprobanteNeedsEnviar(estado: FeComprobanteEstado | null | undefined): boolean {
	return estado === 'pendiente_envio';
}
