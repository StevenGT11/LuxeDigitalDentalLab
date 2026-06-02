import { DEPRECATED_RESTORATION_VALUES, restauracionSortIndex } from './restoration-pricing';
import {
	LUXE_TREATMENT_CATALOG,
	TREATMENT_CATEGORY_LABELS,
	TREATMENT_CATEGORY_ORDER,
	type TreatmentCategory
} from './treatment-catalog';

export type { TreatmentCategory };
export { TREATMENT_CATEGORY_LABELS, TREATMENT_CATEGORY_ORDER };

export interface LabTreatment {
	id: string;
	value: string;
	label: string;
	categoria: TreatmentCategory;
	precio_diseno: number;
	precio_fresado: number;
	precio_crc_diseno: number;
	precio_crc_fresado: number;
	precio_crc: number;
	activo: boolean;
}

export const DEFAULT_TREATMENTS: LabTreatment[] = LUXE_TREATMENT_CATALOG.map((t) => ({
	id: t.id,
	value: t.value,
	label: t.label,
	categoria: t.categoria,
	precio_diseno: t.precio_diseno,
	precio_fresado: t.precio_fresado,
	precio_crc_diseno: t.precio_crc_diseno,
	precio_crc_fresado: t.precio_crc_fresado,
	precio_crc: t.precio_crc,
	activo: t.activo
}));

const DEPRECATED_TREATMENT_VALUES = new Set([...DEPRECATED_RESTORATION_VALUES, 'unidad_restauracion']);

export function isDeprecatedTreatment(value: string): boolean {
	return DEPRECATED_TREATMENT_VALUES.has(value);
}

function categoryIndex(categoria: TreatmentCategory): number {
	const index = TREATMENT_CATEGORY_ORDER.indexOf(categoria);
	return index >= 0 ? index : TREATMENT_CATEGORY_ORDER.length;
}

export function sortTreatmentsList(list: LabTreatment[]): LabTreatment[] {
	return [...list].sort((a, b) => {
		const byCat = categoryIndex(a.categoria) - categoryIndex(b.categoria);
		if (byCat !== 0) return byCat;
		if (a.categoria === 'restauracion' && b.categoria === 'restauracion') {
			return restauracionSortIndex(a.value) - restauracionSortIndex(b.value);
		}
		return a.label.localeCompare(b.label, 'es');
	});
}

export function slugifyTreatmentLabel(label: string): string {
	const base = label
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_|_$/g, '');
	return base || 'tratamiento';
}

export function uniqueTreatmentSlug(base: string, existing: Set<string>): string {
	let value = base;
	let n = 2;
	while (existing.has(value)) {
		value = `${base}_${n}`;
		n += 1;
	}
	return value;
}
