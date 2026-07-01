import { getCatalogSnapshot } from './catalog-cache';

export type ArcadaScope = 'superior' | 'inferior' | 'ambas' | 'una';

export const ARCADA_SCOPE_OPTIONS: { value: ArcadaScope; label: string }[] = [
	{ value: 'superior', label: 'Arcada superior' },
	{ value: 'inferior', label: 'Arcada inferior' },
	{ value: 'ambas', label: 'Ambas arcadas' }
];

/** Las tarifas del catálogo corresponden a ambas arcadas */
export const ARCADA_UNA_PRICE_MULTIPLIER = 0.5;

export function isArcadaScopeTreatment(tipoTrabajo: string): boolean {
	return (
		getCatalogSnapshot().treatments.find((t) => t.value === tipoTrabajo)?.por_arcadas === true
	);
}

export function normalizeArcadaScope(value: unknown): ArcadaScope | null {
	if (value === 'superior' || value === 'inferior' || value === 'ambas' || value === 'una') {
		return value;
	}
	return null;
}

export function getArcadaScopePriceMultiplier(scope: ArcadaScope | null | undefined): number {
	if (scope === 'superior' || scope === 'inferior' || scope === 'una') {
		return ARCADA_UNA_PRICE_MULTIPLIER;
	}
	return 1;
}

export function formatArcadaScopeLabel(scope: ArcadaScope | null | undefined): string {
	if (scope === 'superior') return 'Arcada superior';
	if (scope === 'inferior') return 'Arcada inferior';
	if (scope === 'una') return '1 arcada';
	return 'Ambas arcadas';
}
