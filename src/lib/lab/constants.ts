import type { Doctor, LabCaseEstado } from './types';
import {
	formatImplantesGuiaLabel,
	getGuiaPrecioCrc,
	getGuiaPrecioUsd,
	isGuiaQuirurgica,
	normalizeGuiaTipoTrabajo
} from './surgical-guide';
import {
	formatArcadaScopeLabel,
	getArcadaScopePriceMultiplier,
	isArcadaScopeTreatment
} from './arcada-scope';
import { isSobreImplanteTreatment } from './sobre-implante';
import { treatmentHasMaterials, getTreatmentMaterialPriceUsd, findTreatmentMaterialLabelGlobally, getTreatmentMaterialLabel } from './treatment-materials';
import {
	getMaterialRestauracionLabel,
	getRestauracionPrecioUnitarioUsd,
	isRestauracionTipoTrabajo,
	normalizeRestauracionItem
} from './restoration-pricing';
import { getPrecioDiseno,
	getPrecioDisenoCrc,
	getPrecioFresado,
	getPrecioFresadoCrc,
	getTipoTrabajoLabel,
	getTiposTrabajo
} from './treatments';
import { getCatalogSnapshot } from './catalog-cache';
import { PRECIO_ADDON_CORONA_SOBRE_IMPLANTE_USD } from './treatment-catalog';

export {
	GUIA_QUIRURGICA_VALUE,
	IMPLANTES_GUIA_OPTIONS,
	formatImplantesGuiaLabel,
	getGuiaPrecio,
	getGuiaPrecioCrc,
	getGuiaPrecioUsd,
	isGuiaQuirurgica,
	normalizeGuiaTipoTrabajo
} from './surgical-guide';

export {
	ARCADA_SCOPE_OPTIONS,
	formatArcadaScopeLabel,
	isArcadaScopeTreatment,
	type ArcadaScope
} from './arcada-scope';

export { isSobreImplanteTreatment } from './sobre-implante';

export {
	getTreatmentMaterialLabel,
	getTreatmentMaterialPriceUsd,
	getTreatmentMaterials,
	slugifyMaterialKey,
	treatmentHasMaterials,
	type TreatmentMaterialOption
} from './treatment-materials';

export { treatmentRequiresVitaColor } from './vita-color';

export function getCaseItemTipoLabel(item: {
	tipo_trabajo: string;
	material?: string | null;
	implantes_guia?: number | null;
	alcance_arcada?: import('./arcada-scope').ArcadaScope | null;
	corona_sobre_implante?: boolean | null;
}): string {
	const normalized = normalizeGuiaTipoTrabajo(item.tipo_trabajo);
	const rest = normalizeRestauracionItem({
		tipo_trabajo: normalized.tipo_trabajo,
		material: item.material,
		corona_sobre_implante: item.corona_sobre_implante
	});
	const tipo = isRestauracionTipoTrabajo(normalized.tipo_trabajo)
		? rest.tipo_trabajo
		: normalized.tipo_trabajo;
	let base = getTipoTrabajoLabel(tipo, rest.material ?? item.material);
	if (rest.corona_sobre_implante && isSobreImplanteTreatment(tipo)) {
		base = `${base} · sobre implante`;
	}
	const implantes = item.implantes_guia ?? normalized.implantes_guia;
	if (isGuiaQuirurgica(normalized.tipo_trabajo) && implantes) {
		return `${base} · ${formatImplantesGuiaLabel(implantes)}`;
	}
	if (isArcadaScopeTreatment(tipo)) {
		return `${base} · ${formatArcadaScopeLabel(item.alcance_arcada ?? 'ambas')}`;
	}
	return base;
}
import { getEstadoChipClass } from './visual';

export {
	PRECIO_DISENO_UNIDAD_RESTAURACION_CRC,
	PRECIO_DISENO_UNIDAD_RESTAURACION_USD,
	PRECIO_FRESADO_RESTAURACION_CRC,
	PRECIO_FRESADO_RESTAURACION_USD,
	treatmentRequiresTeeth
} from './treatment-catalog';

export {
	MATERIALES_RESTAURACION,
	getDefaultMaterialRestauracion,
	getMaterialRestauracionLabel,
	getMaterialesRestauracion,
	getRestauracionPrecioUnitarioUsd,
	isCoronaRestauracion,
	isRestauracionTipoTrabajo
} from './restoration-pricing';

export {
	getPrecioDiseno,
	getPrecioDisenoCrc,
	getPrecioFresado,
	getPrecioFresadoCrc,
	getTipoTrabajoLabel,
	getTiposTrabajo
} from './treatments';

/** @deprecated Usar getTiposTrabajo() para listas dinámicas desde el catálogo */
export const TIPOS_TRABAJO = getTiposTrabajo();

export const DOCTORS: Doctor[] = [
	{ id: 'doc-1', name: 'Dr. García' },
	{ id: 'doc-2', name: 'Dra. Martínez' },
	{ id: 'doc-3', name: 'Dr. López' }
];

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
	{ value: 'A4', label: 'A4' },
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
	{ value: 'en_prueba', label: 'En prueba' },
	{ value: 'fresado', label: 'Fresado' },
	{ value: 'horneando', label: 'Horneando' },
	{ value: 'maquillando', label: 'Maquillando' },
	{ value: 'finalizado', label: 'Finalizado' }
];

export function getMaterialLabel(value: string | null, treatmentSlug?: string | null): string {
	if (!value) return '—';
	if (treatmentSlug) {
		return getTreatmentMaterialLabel(treatmentSlug, value);
	}
	const global = findTreatmentMaterialLabelGlobally(value);
	if (global) return global;
	const rest = getMaterialRestauracionLabel(value);
	if (rest !== '—' && (value === 'zirconio' || value === 'disilicato' || value === 'impreso')) {
		return rest;
	}
	return MATERIALES.find((m) => m.value === value)?.label ?? value;
}

export function calcularCostoItem(input: {
	tipo_trabajo: string;
	material: string | null;
	piezas: number;
	incluye_diseno: boolean;
	incluye_fresado: boolean;
	implantes_guia?: number | null;
	alcance_arcada?: import('./arcada-scope').ArcadaScope | null;
	corona_sobre_implante?: boolean | null;
}): number {
	if (isGuiaQuirurgica(input.tipo_trabajo)) {
		if (!input.incluye_diseno) return 0;
		return getGuiaPrecioUsd(input.implantes_guia ?? 0);
	}

	const rest = normalizeRestauracionItem({
		tipo_trabajo: input.tipo_trabajo,
		material: input.material,
		corona_sobre_implante: input.corona_sobre_implante
	});
	const tipo = rest.tipo_trabajo;
	const material = rest.material ?? input.material;
	const restOpts = { corona_sobre_implante: rest.corona_sobre_implante };

	const p = Math.max(1, input.piezas);
	let porPieza = 0;

	if (treatmentHasMaterials(tipo) && material) {
		porPieza = getTreatmentMaterialPriceUsd(tipo, material, restOpts);
	} else if (isRestauracionTipoTrabajo(input.tipo_trabajo) || isRestauracionTipoTrabajo(tipo)) {
		porPieza = getRestauracionPrecioUnitarioUsd(tipo, material, restOpts);
	} else {
		if (input.incluye_diseno) porPieza += getPrecioDiseno(tipo, material, restOpts);
		if (input.incluye_fresado) porPieza += getPrecioFresado(tipo, material, restOpts);
		if (
			rest.corona_sobre_implante &&
			isSobreImplanteTreatment(input.tipo_trabajo)
		) {
			const addon = getCatalogSnapshot().addons.get('corona_sobre_implante');
			const addonUsd =
				(addon?.precio_diseno_usd ?? PRECIO_ADDON_CORONA_SOBRE_IMPLANTE_USD) +
				(addon?.precio_fresado_usd ?? PRECIO_ADDON_CORONA_SOBRE_IMPLANTE_USD);
			porPieza += addonUsd;
		}
	}
	if (isArcadaScopeTreatment(tipo)) {
		porPieza *= getArcadaScopePriceMultiplier(input.alcance_arcada ?? 'ambas');
	}
	if (porPieza <= 0) return 0;

	if (isRestauracionTipoTrabajo(input.tipo_trabajo) || isRestauracionTipoTrabajo(tipo)) {
		return Math.round(porPieza * p * 100) / 100;
	}

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
	'en_prueba',
	'fresado',
	'horneando',
	'maquillando'
];
