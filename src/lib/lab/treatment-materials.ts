import { getCatalogSnapshot } from './catalog-cache.svelte';
import type { RestauracionPrecioOpciones } from './restoration-pricing';
import { MATERIALES_RESTAURACION, normalizeRestauracionPrecio } from './restoration-pricing';
import {
	PRECIO_ADDON_CORONA_SOBRE_IMPLANTE_CRC,
	PRECIO_ADDON_CORONA_SOBRE_IMPLANTE_USD
} from './treatment-catalog';
import { slugifyTreatmentLabel } from './treatments-core';
import { uniqueTreatmentSlug } from './treatments-core';

export interface TreatmentMaterialOption {
	key: string;
	label: string;
	precio_usd: number;
	precio_crc: number;
}

export function getTreatmentMaterials(treatmentSlug: string): TreatmentMaterialOption[] {
	return getCatalogSnapshot().treatmentMaterials.get(treatmentSlug) ?? [];
}

export function treatmentHasMaterials(treatmentSlug: string): boolean {
	return getTreatmentMaterials(treatmentSlug).length > 0;
}

export function getTreatmentMaterialOption(
	treatmentSlug: string,
	materialKey: string | null | undefined
): TreatmentMaterialOption | undefined {
	if (!materialKey) return undefined;
	return getTreatmentMaterials(treatmentSlug).find((m) => m.key === materialKey);
}

export function findTreatmentMaterialLabelGlobally(materialKey: string): string | null {
	if (!materialKey) return null;
	for (const materials of getCatalogSnapshot().treatmentMaterials.values()) {
		const found = materials.find((m) => m.key === materialKey);
		if (found) return found.label;
	}
	return null;
}

export function getTreatmentMaterialLabel(
	treatmentSlug: string,
	materialKey: string | null | undefined
): string {
	if (!materialKey) return '—';
	const fromCatalog = getTreatmentMaterialOption(treatmentSlug, materialKey);
	if (fromCatalog) return fromCatalog.label;
	const global = findTreatmentMaterialLabelGlobally(materialKey);
	if (global) return global;
	const preset = MATERIALES_RESTAURACION.find((m) => m.value === materialKey);
	if (preset) return preset.label;
	return materialKey.replace(/_/g, ' ');
}

/** Recargo fijo al marcar «Sobre implante» (diseño + fresado del add-on). */
export function getCoronaSobreImplanteAddonUsd(): number {
	const addon = getCatalogSnapshot().addons.get('corona_sobre_implante');
	return (
		(addon?.precio_diseno_usd ?? PRECIO_ADDON_CORONA_SOBRE_IMPLANTE_USD) +
		(addon?.precio_fresado_usd ?? PRECIO_ADDON_CORONA_SOBRE_IMPLANTE_USD)
	);
}

export function getTreatmentMaterialPriceUsd(
	treatmentSlug: string,
	materialKey: string | null | undefined,
	opciones?: RestauracionPrecioOpciones
): number {
	const row = getTreatmentMaterialOption(treatmentSlug, materialKey);
	if (!row) return 0;
	let usd = row.precio_usd;
	if (opciones?.corona_sobre_implante) usd += getCoronaSobreImplanteAddonUsd();
	return usd;
}

/** Recargo fijo al marcar «Sobre implante», en colones de catálogo. */
export function getCoronaSobreImplanteAddonCrc(): number {
	const addon = getCatalogSnapshot().addons.get('corona_sobre_implante');
	return (
		(addon?.precio_diseno_crc ?? PRECIO_ADDON_CORONA_SOBRE_IMPLANTE_CRC) +
		(addon?.precio_fresado_crc ?? PRECIO_ADDON_CORONA_SOBRE_IMPLANTE_CRC)
	);
}

/** Precio en colones guardado en el tratamiento o su material. No convierte desde USD. */
export function getTreatmentMaterialPriceCrc(
	treatmentSlug: string,
	materialKey: string | null | undefined,
	opciones?: RestauracionPrecioOpciones
): number {
	const row = getTreatmentMaterialOption(treatmentSlug, materialKey);
	if (!row) return 0;
	let crc = row.precio_crc;
	if (opciones?.corona_sobre_implante) crc += getCoronaSobreImplanteAddonCrc();
	return crc;
}

export function slugifyMaterialKey(label: string, existing: Set<string>): string {
	const base = slugifyTreatmentLabel(label) || 'material';
	return uniqueTreatmentSlug(base, existing);
}

export function materialDraftFromPrecio(
	key: string,
	label: string,
	precio: { precio_diseno: number; precio_fresado: number; precio_crc_diseno: number; precio_crc_fresado: number }
): TreatmentMaterialOption {
	const normalized = normalizeRestauracionPrecio(precio);
	return {
		key,
		label,
		precio_usd: normalized.precio_fresado,
		precio_crc: normalized.precio_crc_fresado
	};
}

export function materialOptionToDbPrecio(option: TreatmentMaterialOption): {
	precio_diseno: number;
	precio_fresado: number;
	precio_crc_diseno: number;
	precio_crc_fresado: number;
} {
	return {
		precio_diseno: 0,
		precio_fresado: option.precio_usd,
		precio_crc_diseno: 0,
		precio_crc_fresado: option.precio_crc
	};
}
