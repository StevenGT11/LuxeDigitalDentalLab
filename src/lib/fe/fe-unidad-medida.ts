import { cabysSuggestedUnidadMedida } from '$lib/cabys/feHints';
import { findCabysByCodigo } from '$lib/cabys/searchCatalog';
import type { CabysCatalogEntry } from '$lib/cabys/types';
import { isFeServiceUnidadMedida, normalizeFeUnidadMedida } from './emisor-normalize';

/** Unidad FE alineada con el CABYS (evita Hacienda -107 servicios vs mercancías exentas). */
export function resolveFeUnidadMedidaForCabys(
	cabys: string,
	rawUnidad: unknown,
	lookup: (code: string) => CabysCatalogEntry | null
): string {
	const code = cabys.trim();
	if (/^\d{13}$/.test(code)) {
		const entry = lookup(code);
		if (entry) return cabysSuggestedUnidadMedida(entry);
	}
	return normalizeFeUnidadMedida(rawUnidad);
}

export function feUnidadCabysMismatch(
	cabys: string,
	rawUnidad: unknown,
	lookup: (code: string) => CabysCatalogEntry | null
): { suggested: 'Sp' | 'Unid'; current: string; entry: CabysCatalogEntry } | null {
	const code = cabys.trim();
	if (!/^\d{13}$/.test(code)) return null;
	const entry = lookup(code);
	if (!entry) return null;
	const suggested = cabysSuggestedUnidadMedida(entry);
	const current = normalizeFeUnidadMedida(rawUnidad);
	if (current === suggested) return null;
	return { suggested, current, entry };
}

export function formatFeUnidadCabysMismatchError(
	mismatch: { suggested: 'Sp' | 'Unid'; current: string; entry: CabysCatalogEntry },
	descripcion: string
): string {
	const suggestedLabel = mismatch.suggested === 'Unid' ? 'Unid (mercancía)' : 'Sp (servicio)';
	const currentLabel = isFeServiceUnidadMedida(mismatch.current)
		? 'Sp (servicio)'
		: 'Unid (mercancía)';
	return (
		`«${descripcion}»: el CABYS ${mismatch.entry.codigo} (${mismatch.entry.producto.slice(0, 50)}) ` +
		`corresponde a ${suggestedLabel}, pero la línea usa ${currentLabel}. ` +
		`Hacienda rechaza con error -107 (totales de servicios vs mercancías exentas). ` +
		`Cambie la unidad en Generar factura o use un CABYS de servicio profesional.`
	);
}
