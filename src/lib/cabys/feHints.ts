import type { CabysCatalogEntry } from './types';
import { normalizeCabysSearchText } from './searchCatalog';

/** Goods-like CABYS descriptions → Unid; otherwise Sp (servicio profesional). */
export function cabysSuggestedUnidadMedida(entry: CabysCatalogEntry): 'Sp' | 'Unid' {
	const text = normalizeCabysSearchText(`${entry.producto} ${entry.clasificacion}`);
	if (/\bpieza|\bprotesis|\bprótesis|\bmercanc|\bproducto|\bequipo|\baparato|\binstrumento|\bmaterial\b/.test(text)) {
		return 'Unid';
	}
	return 'Sp';
}
