import type { Doctor, LabCaseEstado } from './types';
import { getEstadoChipClass } from './visual';

export const DOCTORS: Doctor[] = [
	{ id: 'doc-1', name: 'Dr. García' },
	{ id: 'doc-2', name: 'Dra. Martínez' },
	{ id: 'doc-3', name: 'Dr. López' }
];

export const TIPOS_TRABAJO = [
	{ value: 'crown', label: 'Corona' },
	{ value: 'inlay', label: 'Inlay' },
	{ value: 'onlay', label: 'Onlay' },
	{ value: 'veneer', label: 'Veneer' },
	{ value: 'bridge', label: 'Puente' },
	{ value: 'protesis', label: 'Prótesis' },
	{ value: 'otro', label: 'Otro' }
] as const;

export const MATERIALES = [
	{ value: '', label: 'Sin especificar' },
	{ value: 'zirconio', label: 'Zirconio' },
	{ value: 'emax', label: 'Emax' },
	{ value: 'pmma', label: 'PMMA' },
	{ value: 'resina', label: 'Resina' },
	{ value: 'metal', label: 'Metal-cerámica' }
];

export const COLORES_VITA = [
	{ value: '', label: 'Sin especificar' },
	{ value: 'BL1', label: 'BL1' },
	{ value: 'BL2', label: 'BL2' },
	{ value: 'BL3', label: 'BL3' },
	{ value: 'BL4', label: 'BL4' },
	{ value: 'A1', label: 'A1' },
	{ value: 'A2', label: 'A2' },
	{ value: 'A3', label: 'A3' },
	{ value: 'A3.5', label: 'A3.5' },
	{ value: 'B1', label: 'B1' },
	{ value: 'B2', label: 'B2' },
	{ value: 'B3', label: 'B3' },
	{ value: 'B4', label: 'B4' },
	{ value: 'C1', label: 'C1' },
	{ value: 'C2', label: 'C2' },
	{ value: 'C3', label: 'C3' },
	{ value: 'C4', label: 'C4' }
] as const;

/** Precio base por pieza (USD) según tipo de trabajo */
export const PRECIO_BASE: Record<string, number> = {
	crown: 45,
	inlay: 35,
	onlay: 38,
	veneer: 42,
	bridge: 40,
	protesis: 55,
	otro: 30
};

/** Multiplicador según material */
export const MULTIPLICADOR_MATERIAL: Record<string, number> = {
	'': 1,
	zirconio: 1.15,
	emax: 1.25,
	pmma: 0.85,
	resina: 0.8,
	metal: 1.1
};

export const ESTADOS: { value: LabCaseEstado | 'todos'; label: string }[] = [
	{ value: 'todos', label: 'Todos' },
	{ value: 'pendiente', label: 'Pendiente' },
	{ value: 'en_diseño', label: 'En Diseño' },
	{ value: 'diseñado', label: 'Diseñado' },
	{ value: 'fresado', label: 'Fresado' },
	{ value: 'horneando', label: 'Horneando' },
	{ value: 'maquillando', label: 'Maquillando' },
	{ value: 'finalizado', label: 'Finalizado' }
];

export function getTipoTrabajoLabel(value: string): string {
	return TIPOS_TRABAJO.find((t) => t.value === value)?.label ?? value;
}

export function getMaterialLabel(value: string | null): string {
	if (!value) return '—';
	return MATERIALES.find((m) => m.value === value)?.label ?? value;
}

/** USD por pieza — diseño */
export const PRECIO_DISENO_POR_PIEZA: Record<string, number> = {
	crown: 30,
	inlay: 25,
	onlay: 28,
	veneer: 35,
	bridge: 40,
	protesis: 45,
	otro: 25
};

/** USD por pieza — fresado */
export const PRECIO_FRESADO_POR_PIEZA: Record<string, number> = {
	crown: 90,
	inlay: 70,
	onlay: 75,
	veneer: 85,
	bridge: 100,
	protesis: 120,
	otro: 60
};

export function getPrecioDiseno(tipoTrabajo: string): number {
	return PRECIO_DISENO_POR_PIEZA[tipoTrabajo] ?? PRECIO_DISENO_POR_PIEZA.otro;
}

export function getPrecioFresado(tipoTrabajo: string): number {
	return PRECIO_FRESADO_POR_PIEZA[tipoTrabajo] ?? PRECIO_FRESADO_POR_PIEZA.otro;
}

export function calcularCostoItem(input: {
	tipo_trabajo: string;
	material: string | null;
	piezas: number;
	incluye_diseno: boolean;
	incluye_fresado: boolean;
}): number {
	const p = Math.max(1, input.piezas);
	let porPieza = 0;
	if (input.incluye_diseno) porPieza += getPrecioDiseno(input.tipo_trabajo);
	if (input.incluye_fresado) porPieza += getPrecioFresado(input.tipo_trabajo);
	if (porPieza <= 0) return 0;
	const mult = MULTIPLICADOR_MATERIAL[input.material ?? ''] ?? 1;
	return Math.round(porPieza * p * mult * 100) / 100;
}

/** @deprecated Usar calcularCostoItem con diseño/fresado */
export function calcularCosto(tipoTrabajo: string, material: string | null, piezas: number): number {
	return calcularCostoItem({
		tipo_trabajo: tipoTrabajo,
		material,
		piezas,
		incluye_diseno: true,
		incluye_fresado: true
	});
}

export function getEstadoLabel(estado: LabCaseEstado): string {
	return ESTADOS.find((e) => e.value === estado)?.label ?? estado;
}

export function getEstadoBadgeClass(estado: LabCaseEstado): string {
	return getEstadoChipClass(estado);
}

export const INVOICE_ESTADOS = [
	{ value: 'pendiente', label: 'Pendiente' },
	{ value: 'pagada', label: 'Pagada' },
	{ value: 'cancelada', label: 'Cancelada' }
] as const;

export function getInvoiceEstadoLabel(estado: string): string {
	return INVOICE_ESTADOS.find((e) => e.value === estado)?.label ?? estado;
}

export function getInvoiceEstadoClass(estado: string): string {
	if (estado === 'pagada') return 'status-chip status-chip--finalizado';
	if (estado === 'cancelada') return 'status-chip';
	return 'status-chip status-chip--pendiente';
}

export const ESTADOS_EN_PROCESO: LabCaseEstado[] = [
	'en_diseño',
	'diseñado',
	'fresado',
	'horneando',
	'maquillando'
];
