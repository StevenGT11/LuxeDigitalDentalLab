import { browser } from '$app/environment';
import {
	getCatalogSnapshot,
	isCatalogHydrated,
	runCatalogHydrate
} from './catalog-cache';
import { hydrateTreatmentsCatalog } from './treatments-db';
import type { RestauracionPrecioOpciones } from './restoration-pricing';
import {
	getDefaultMaterialRestauracion,
	getMaterialRestauracionLabel,
	getMaterialesRestauracion,
	getRestauracionPrecio,
	getRestauracionPrecioUnitarioUsd,
	isRestauracionTipoTrabajo,
	normalizeRestauracionItem,
	normalizeRestauracionPrecio,
	resolveRestauracionTipoTrabajo
} from './restoration-pricing';
import { isSobreImplanteTreatment } from './sobre-implante';
import {
	DEFAULT_TREATMENTS,
	isDeprecatedTreatment,
	type LabTreatment,
	type TreatmentCategory,
	TREATMENT_CATEGORY_LABELS,
	TREATMENT_CATEGORY_ORDER
} from './treatments-core';

export type { TreatmentCategory, LabTreatment };
export {
	TREATMENT_CATEGORY_LABELS,
	TREATMENT_CATEGORY_ORDER,
	slugifyTreatmentLabel,
	DEFAULT_TREATMENTS
};

export {
	getDefaultMaterialRestauracion,
	getMaterialRestauracionLabel,
	getMaterialesRestauracion,
	getRestauracionPrecioUnitarioUsd,
	isRestauracionTipoTrabajo,
	normalizeRestauracionItem,
	normalizeRestauracionPrecio,
	resolveRestauracionTipoTrabajo
} from './restoration-pricing';

function activeTreatments(): LabTreatment[] {
	const list = getCatalogSnapshot().treatments.filter((t) => t.activo && !isDeprecatedTreatment(t.value));
	return list.length > 0 ? list : DEFAULT_TREATMENTS.filter((t) => t.activo);
}

/** Carga catálogo desde Supabase (idempotente). */
export async function hydrateTreatmentsCatalogOnce(): Promise<void> {
	if (!browser) return;
	await runCatalogHydrate(() => hydrateTreatmentsCatalog());
}

/** Compatibilidad: dispara hidratación sin bloquear. */
export function initializeTreatmentsStorage(): void {
	if (!browser) return;
	if (!isCatalogHydrated()) void hydrateTreatmentsCatalogOnce();
}

export function getAllTreatments(): LabTreatment[] {
	if (!browser) return DEFAULT_TREATMENTS;
	const list = getCatalogSnapshot().treatments.filter((t) => !isDeprecatedTreatment(t.value));
	return list.length > 0 ? list : DEFAULT_TREATMENTS;
}

export function getTreatmentsByCategory(): { categoria: TreatmentCategory; label: string; items: LabTreatment[] }[] {
	const groups = new Map<TreatmentCategory, LabTreatment[]>();
	for (const t of getAllTreatments()) {
		const list = groups.get(t.categoria) ?? [];
		list.push(t);
		groups.set(t.categoria, list);
	}
	return TREATMENT_CATEGORY_ORDER.filter((c) => groups.has(c)).map((categoria) => ({
		categoria,
		label: TREATMENT_CATEGORY_LABELS[categoria],
		items: groups.get(categoria) ?? []
	}));
}

export function getActiveTreatments(): LabTreatment[] {
	return activeTreatments();
}

export function getActiveTreatmentsByCategory(): {
	categoria: TreatmentCategory;
	label: string;
	items: LabTreatment[];
}[] {
	return getTreatmentsByCategory()
		.map((group) => ({
			...group,
			items: group.items.filter((t) => t.activo)
		}))
		.filter((group) => group.items.length > 0);
}

export function getTiposTrabajo(): { value: string; label: string }[] {
	return getActiveTreatments().map((t) => ({
		value: t.value,
		label: `${TREATMENT_CATEGORY_LABELS[t.categoria]} · ${t.label}`
	}));
}

export function getTreatmentByValue(value: string): LabTreatment | undefined {
	return getAllTreatments().find((t) => t.value === value);
}

export function getTreatmentById(id: string): LabTreatment | undefined {
	return getAllTreatments().find((t) => t.id === id);
}

export function getTipoTrabajoLabel(
	value: string,
	material?: string | null,
	opciones?: RestauracionPrecioOpciones
): string {
	const resolved = resolveRestauracionTipoTrabajo(value);
	const t = getTreatmentByValue(resolved) ?? getTreatmentByValue(value);
	if (!t) return value;
	const mat = material ? getMaterialRestauracionLabel(material) : '';
	const parts = [TREATMENT_CATEGORY_LABELS[t.categoria], t.label];
	if (mat && mat !== '—') parts.push(mat);
	if (opciones?.corona_sobre_implante && isSobreImplanteTreatment(resolved)) {
		parts.push('sobre implante');
	}
	return parts.join(' · ');
}

export function getPrecioDiseno(
	tipoTrabajo: string,
	material?: string | null,
	opciones?: RestauracionPrecioOpciones
): number {
	if (isRestauracionTipoTrabajo(tipoTrabajo)) {
		return 0;
	}
	const resolved = resolveRestauracionTipoTrabajo(tipoTrabajo);
	const t = getTreatmentByValue(resolved) ?? getTreatmentByValue(tipoTrabajo);
	if (t) return t.precio_diseno;
	return getTreatmentByValue('ferula_diseno')?.precio_diseno ?? 25;
}

export function getPrecioFresado(
	tipoTrabajo: string,
	material?: string | null,
	opciones?: RestauracionPrecioOpciones
): number {
	if (isRestauracionTipoTrabajo(tipoTrabajo)) {
		const p = getRestauracionPrecio(tipoTrabajo, material, opciones);
		if (p) return p.precio_fresado;
	}
	const resolved = resolveRestauracionTipoTrabajo(tipoTrabajo);
	const t = getTreatmentByValue(resolved) ?? getTreatmentByValue(tipoTrabajo);
	if (t) return t.precio_fresado;
	return 90;
}

export function getPrecioDisenoCrc(
	tipoTrabajo: string,
	material?: string | null,
	opciones?: RestauracionPrecioOpciones
): number {
	if (isRestauracionTipoTrabajo(tipoTrabajo)) {
		return getRestauracionPrecio(tipoTrabajo, material, opciones)?.precio_crc_diseno ?? 0;
	}
	const resolved = resolveRestauracionTipoTrabajo(tipoTrabajo);
	return getTreatmentByValue(resolved)?.precio_crc_diseno ?? getTreatmentByValue(tipoTrabajo)?.precio_crc_diseno ?? 0;
}

export function getPrecioFresadoCrc(
	tipoTrabajo: string,
	material?: string | null,
	opciones?: RestauracionPrecioOpciones
): number {
	if (isRestauracionTipoTrabajo(tipoTrabajo)) {
		return getRestauracionPrecio(tipoTrabajo, material, opciones)?.precio_crc_fresado ?? 0;
	}
	const resolved = resolveRestauracionTipoTrabajo(tipoTrabajo);
	return getTreatmentByValue(resolved)?.precio_crc_fresado ?? getTreatmentByValue(tipoTrabajo)?.precio_crc_fresado ?? 0;
}

export type { UpsertTreatmentInput } from './treatments-db';
export {
	createTreatmentInDb as createTreatment,
	deleteRestorationPriceInDb as deleteRestorationPrice,
	deleteTreatmentInDb as deleteTreatment,
	deleteTreatmentMaterialInDb,
	hydrateTreatmentsCatalog,
	setTreatmentActiveInDb as setTreatmentActive,
	updateTreatmentInDb as updateTreatment,
	upsertRestorationPriceInDb as upsertRestorationPrice,
	upsertTreatmentMaterialInDb
} from './treatments-db';

export {
	getTreatmentMaterials,
	slugifyMaterialKey,
	treatmentHasMaterials,
	type TreatmentMaterialOption
} from './treatment-materials';
