import catalogJson from './catalog.json';
import {
	findActividadEconomicaByCodigo,
	searchActividadEconomicaCatalog
} from './searchCatalog';
import type { ActividadEconomicaEntry } from './types';

/**
 * Official Hacienda CIIU4 subclass codes (unique), parsed from the ATV↔TRIBU-CR
 * correspondence catalog (Códigos de actividad económica / factura electrónica v4.4).
 * Source: Ministerio de Hacienda — Clasificación Actividades Económicas.
 */
const CATALOG: ActividadEconomicaEntry[] = catalogJson as ActividadEconomicaEntry[];

export function loadActividadEconomicaCatalog(): ActividadEconomicaEntry[] {
	return CATALOG;
}

export function searchActividadEconomicaCatalogFromFile(
	query: string,
	limit = 25
): ActividadEconomicaEntry[] {
	const cappedLimit = Math.min(Math.max(1, limit), 50);
	return searchActividadEconomicaCatalog(CATALOG, query, { limit: cappedLimit });
}

export function findActividadEconomicaFromFile(
	codigo: string
): ActividadEconomicaEntry | undefined {
	return findActividadEconomicaByCodigo(CATALOG, codigo);
}
