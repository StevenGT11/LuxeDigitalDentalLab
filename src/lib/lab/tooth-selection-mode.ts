import { getCatalogSnapshot } from './catalog-cache';
import type { TreatmentCategory } from './treatment-catalog';

export type ToothSelectionMode = 'arcadas' | 'odontograma' | 'ninguno';

export const TOOTH_SELECTION_MODE_OPTIONS: { value: ToothSelectionMode; label: string }[] = [
	{ value: 'arcadas', label: 'Por arcadas' },
	{ value: 'odontograma', label: 'Por odontograma' },
	{ value: 'ninguno', label: 'No necesario' }
];

export function defaultToothSelectionModeForCategory(
	categoria: TreatmentCategory | ''
): ToothSelectionMode {
	return categoria === 'restauracion' ? 'odontograma' : 'ninguno';
}

export function normalizeToothSelectionMode(
	value: unknown,
	fallback?: { por_arcadas?: boolean; categoria?: TreatmentCategory | '' }
): ToothSelectionMode {
	if (value === 'arcadas' || value === 'odontograma' || value === 'ninguno') return value;
	if (fallback?.por_arcadas === true) return 'arcadas';
	return defaultToothSelectionModeForCategory(fallback?.categoria ?? '');
}

export function getToothSelectionModeForTreatment(tipoTrabajo: string): ToothSelectionMode {
	const treatment = getCatalogSnapshot().treatments.find((t) => t.value === tipoTrabajo);
	if (!treatment) return 'ninguno';
	return treatment.modo_seleccion_piezas;
}

export function isArcadaScopeTreatment(tipoTrabajo: string): boolean {
	return getToothSelectionModeForTreatment(tipoTrabajo) === 'arcadas';
}

export function treatmentUsesOdontogram(tipoTrabajo: string): boolean {
	return getToothSelectionModeForTreatment(tipoTrabajo) === 'odontograma';
}

export function treatmentSkipsToothSelection(tipoTrabajo: string): boolean {
	return getToothSelectionModeForTreatment(tipoTrabajo) === 'ninguno';
}

export function toothSelectionModeLabel(mode: ToothSelectionMode): string {
	return TOOTH_SELECTION_MODE_OPTIONS.find((o) => o.value === mode)?.label ?? mode;
}
