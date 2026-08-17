import type { CabysCatalogEntry } from './types';
import { normalizeCabys } from './normalize';

/** Lowercase, strip accents — for matching Spanish descriptions without tildes. */
export function normalizeCabysSearchText(value: string): string {
	return String(value ?? '')
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.trim();
}

function entrySearchHaystack(entry: CabysCatalogEntry): string {
	return normalizeCabysSearchText(`${entry.producto} ${entry.clasificacion}`);
}

function scoreEntry(entry: CabysCatalogEntry, tokens: string[], codeQ: string): number {
	const code = normalizeCabys(entry.codigo);
	let score = 0;

	if (codeQ.length >= 3) {
		if (code === codeQ) score += 100;
		else if (code.startsWith(codeQ)) score += 40;
		else if (code.includes(codeQ)) score += 15;
	}

	const producto = normalizeCabysSearchText(entry.producto);
	const clasificacion = normalizeCabysSearchText(entry.clasificacion);

	for (const token of tokens) {
		if (producto.startsWith(token)) score += 12;
		else if (producto.includes(token)) score += 8;
		else if (clasificacion.includes(token)) score += 4;
		else return -1;
	}

	return score;
}

export function searchCabysCatalog(
	entries: CabysCatalogEntry[],
	query: string,
	limit = 25
): CabysCatalogEntry[] {
	const cap = Math.min(Math.max(1, limit), 50);
	const trimmed = query.trim();
	if (!trimmed) return [];

	const codeQ = normalizeCabys(trimmed);
	const isCodeSearch = /^\d{3,}$/.test(codeQ);

	const tokens = normalizeCabysSearchText(trimmed)
		.split(/\s+/)
		.filter((t) => t.length > 0);

	if (!isCodeSearch && tokens.length === 0) return [];
	if (!isCodeSearch && tokens.join('').length < 2) return [];

	if (isCodeSearch && tokens.length <= 1 && codeQ.length >= 3) {
		const codeResults: CabysCatalogEntry[] = [];
		for (const entry of entries) {
			const code = normalizeCabys(entry.codigo);
			if (code.includes(codeQ) || codeQ.includes(code)) {
				codeResults.push(entry);
				if (codeResults.length >= cap) break;
			}
		}
		return codeResults;
	}

	const ranked: { entry: CabysCatalogEntry; score: number }[] = [];

	for (const entry of entries) {
		const score = scoreEntry(entry, tokens, codeQ.length >= 3 ? codeQ : '');
		if (score < 0) continue;
		ranked.push({ entry, score });
	}

	ranked.sort((a, b) => b.score - a.score || a.entry.producto.localeCompare(b.entry.producto, 'es'));

	return ranked.slice(0, cap).map((r) => r.entry);
}

export function findCabysByCodigo(
	entries: CabysCatalogEntry[],
	codigo: string
): CabysCatalogEntry | undefined {
	const normalized = normalizeCabys(codigo);
	if (normalized.length !== 13) return undefined;
	return entries.find((e) => normalizeCabys(e.codigo) === normalized);
}
