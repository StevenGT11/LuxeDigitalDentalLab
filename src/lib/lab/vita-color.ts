/** Tratamientos que no requieren tono VITA al crear el caso */
export const TREATMENTS_WITHOUT_VITA_COLOR = [
	'ferula_diseno',
	'ferula_impresa',
	'fundas_blanqueamiento',
	'retenedores_ortodoncia'
] as const;

export function treatmentRequiresVitaColor(tipoTrabajo: string): boolean {
	return !(TREATMENTS_WITHOUT_VITA_COLOR as readonly string[]).includes(tipoTrabajo);
}
