import { getCatalogSnapshot } from './catalog-cache';

/** Tratamientos que no requieren tono VITA al crear el caso */
export const TREATMENTS_WITHOUT_VITA_COLOR = [
	'ferula_diseno',
	'ferula_impresa',
	'fundas_blanqueamiento',
	'retenedores_ortodoncia'
] as const;

export function treatmentRequiresVitaColor(tipoTrabajo: string): boolean {
	if ((TREATMENTS_WITHOUT_VITA_COLOR as readonly string[]).includes(tipoTrabajo)) {
		return false;
	}
	const treatment = getCatalogSnapshot().treatments.find((t) => t.value === tipoTrabajo);
	if (treatment?.categoria === 'diseno') return false;
	return true;
}
