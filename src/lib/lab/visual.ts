import type { LabCaseEstado } from './types';

/** Muestras aproximadas tono VITA (clásico + bleach BL) */
export const VITA_SWATCHES: Record<string, string> = {
	A1: '#f2e4d4',
	A2: '#e8d4bc',
	A3: '#d9c4a8',
	'A3.5': '#cfba9a',
	A4: '#c4ad88',
	B1: '#efe8dc',
	B2: '#e2d6c4',
	B3: '#d4c4ad',
	B4: '#c8b89a',
	BL1: '#faf7f2',
	BL2: '#f5f0e8',
	BL3: '#efe8de',
	BL4: '#e8dfd2',
	C1: '#e6d2bc',
	C2: '#d9c0a4',
	C3: '#ccb090',
	C4: '#bfa080',
	D2: '#d4b896',
	D3: '#c4a078',
	D4: '#b08860'
};

export const TIPO_WORK_COLORS: Record<string, string> = {
	crown: '#2563eb',
	inlay: '#0891b2',
	onlay: '#0d9488',
	veneer: '#7c3aed',
	bridge: '#c026d3',
	protesis: '#ea580c',
	otro: '#64748b'
};

export const MATERIAL_COLORS: Record<string, string> = {
	zirconio: '#38bdf8',
	disilicato: '#a78bfa',
	impreso: '#34d399',
	resina_larga_duracion: '#22c55e',
	resina_provisional: '#fbbf24',
	emax: '#a78bfa',
	pmma: '#fbbf24',
	resina: '#34d399',
	metal: '#94a3b8',
	'': '#cbd5e1'
};

export const ESTADO_COLORS: Record<LabCaseEstado, string> = {
	pendiente: '#f59e0b',
	en_diseño: '#3b82f6',
	diseñado: '#6366f1',
	fresado: '#06b6d4',
	horneando: '#f97316',
	maquillando: '#a855f7',
	en_prueba: '#14b8a6',
	finalizado: '#22c55e'
};

export const ESTADO_ORDER: LabCaseEstado[] = [
	'pendiente',
	'en_diseño',
	'diseñado',
	'en_prueba',
	'fresado',
	'horneando',
	'maquillando',
	'finalizado'
];

export function getVitaHex(shade: string | null | undefined): string {
	if (!shade) return '#e2e8f0';
	return VITA_SWATCHES[shade] ?? '#e2e8f0';
}

export function getTipoColor(tipo: string): string {
	if (tipo.startsWith('rest_')) return '#2563eb';
	return TIPO_WORK_COLORS[tipo] ?? TIPO_WORK_COLORS.otro;
}

export function getMaterialColor(material: string | null | undefined): string {
	return MATERIAL_COLORS[material ?? ''] ?? MATERIAL_COLORS[''];
}

export function getEstadoColor(estado: LabCaseEstado): string {
	return ESTADO_COLORS[estado];
}

export function getEstadoChipClass(estado: LabCaseEstado): string {
	return `status-chip status-chip--estado-${estado.replaceAll('_', '-')}`;
}

export function getEstadoProgress(estado: LabCaseEstado): number {
	const idx = ESTADO_ORDER.indexOf(estado);
	if (idx < 0) return 0;
	return Math.round(((idx + 1) / ESTADO_ORDER.length) * 100);
}
