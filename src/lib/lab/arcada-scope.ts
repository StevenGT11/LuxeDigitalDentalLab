export type ArcadaScope = 'superior' | 'inferior' | 'ambas' | 'una';

export const ARCADA_SCOPE_OPTIONS: { value: ArcadaScope; label: string }[] = [
	{ value: 'superior', label: 'Arcada superior' },
	{ value: 'inferior', label: 'Arcada inferior' },
	{ value: 'ambas', label: 'Ambas arcadas' }
];

/** La tarifa del catálogo es una arcada. Ambas arcadas la duplican. */
export const ARCADA_AMBAS_PRICE_MULTIPLIER = 2;

export { isArcadaScopeTreatment } from './tooth-selection-mode';

export function normalizeArcadaScope(value: unknown): ArcadaScope | null {
	if (value === 'superior' || value === 'inferior' || value === 'ambas' || value === 'una') {
		return value;
	}
	return null;
}

export function getArcadaScopePriceMultiplier(scope: ArcadaScope | null | undefined): number {
	if (scope === 'ambas') return ARCADA_AMBAS_PRICE_MULTIPLIER;
	return 1;
}

export function formatArcadaScopeLabel(scope: ArcadaScope | null | undefined): string {
	if (scope === 'superior') return 'Arcada superior';
	if (scope === 'inferior') return 'Arcada inferior';
	if (scope === 'una') return '1 arcada';
	return 'Ambas arcadas';
}
