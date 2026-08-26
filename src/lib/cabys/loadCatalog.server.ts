import catalogJson from './catalog.json';
import type { CabysCatalogEntry } from './types';

const CATALOG = catalogJson as CabysCatalogEntry[];

export function loadCabysCatalog(): CabysCatalogEntry[] {
	return CATALOG;
}
