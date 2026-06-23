/** Tratamientos facturados por una o ambas arcadas */
export const ARCADA_SCOPE_TREATMENTS = [
	'ferula_diseno',
	'ferula_impresa',
	'fundas_blanqueamiento',
	'retenedores_ortodoncia'
] as const;

export type ArcadaScopeTreatment = (typeof ARCADA_SCOPE_TREATMENTS)[number];
export type ArcadaScope = 'una' | 'ambas';

export const ARCADA_SCOPE_OPTIONS: { value: ArcadaScope; label: string }[] = [
	{ value: 'una', label: 'Una arcada' },
	{ value: 'ambas', label: 'Ambas arcadas' }
];

/** Las tarifas del catálogo corresponden a ambas arcadas */
export const ARCADA_UNA_PRICE_MULTIPLIER = 0.5;

export function isArcadaScopeTreatment(tipoTrabajo: string): boolean {
	return (ARCADA_SCOPE_TREATMENTS as readonly string[]).includes(tipoTrabajo);
}

export function normalizeArcadaScope(value: unknown): ArcadaScope | null {
	if (value === 'una' || value === 'ambas') return value;
	return null;
}

export function getArcadaScopePriceMultiplier(scope: ArcadaScope | null | undefined): number {
	return scope === 'una' ? ARCADA_UNA_PRICE_MULTIPLIER : 1;
}

export function formatArcadaScopeLabel(scope: ArcadaScope | null | undefined): string {
	if (scope === 'una') return '1 arcada';
	return 'Ambas arcadas';
}
