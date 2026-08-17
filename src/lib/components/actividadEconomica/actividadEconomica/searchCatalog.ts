import type { ActividadEconomicaEntry } from './types';

export type SearchActividadEconomicaOptions = {
	limit?: number;
};

/** Normalize AE codes for compare (trim; keep `####.#` shape). */
export function normalizeActividadEconomicaCodigo(codigo: string): string {
	return String(codigo ?? '')
		.trim()
		.replace(/\s+/g, '');
}

/**
 * Search by code prefix/substring or description (case-insensitive).
 * Empty query returns the first `limit` entries (browse).
 */
export function searchActividadEconomicaCatalog(
	entries: ActividadEconomicaEntry[],
	query: string,
	options: SearchActividadEconomicaOptions = {}
): ActividadEconomicaEntry[] {
	const limit = Math.max(1, options.limit ?? 25);
	const trimmed = query.trim();
	if (!trimmed) return entries.slice(0, limit);

	const qLower = trimmed.toLowerCase();
	const codeQ = normalizeActividadEconomicaCodigo(trimmed).toLowerCase();
	const results: ActividadEconomicaEntry[] = [];

	for (const entry of entries) {
		const code = normalizeActividadEconomicaCodigo(entry.codigo).toLowerCase();
		const codeMatch = code.includes(codeQ);
		const descMatch = entry.descripcion.toLowerCase().includes(qLower);
		if (codeMatch || descMatch) {
			results.push(entry);
			if (results.length >= limit) break;
		}
	}

	return results;
}

export function findActividadEconomicaByCodigo(
	entries: ActividadEconomicaEntry[],
	codigo: string
): ActividadEconomicaEntry | undefined {
	const normalized = normalizeActividadEconomicaCodigo(codigo);
	if (!normalized) return undefined;
	return entries.find((e) => normalizeActividadEconomicaCodigo(e.codigo) === normalized);
}

export function formatActividadEconomicaLabel(entry: ActividadEconomicaEntry): string {
	const code = normalizeActividadEconomicaCodigo(entry.codigo);
	const desc = entry.descripcion.trim();
	return desc ? `${code} — ${desc}` : code;
}
