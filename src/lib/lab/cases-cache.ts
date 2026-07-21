import type { LabCase } from './types';

let cases: LabCase[] = [];
let hydrated = false;
let hydratePromise: Promise<LabCase[]> | null = null;
let hydrateGeneration = 0;

function sortCasesByNewest(list: LabCase[]): LabCase[] {
	return [...list].sort(
		(a, b) => new Date(b.fecha_creacion).getTime() - new Date(a.fecha_creacion).getTime()
	);
}

export function isCasesHydrated(): boolean {
	return hydrated;
}

export function getCachedCases(): LabCase[] {
	return cases;
}

export function setCachedCases(list: LabCase[]): void {
	cases = sortCasesByNewest(list);
	hydrated = true;
}

/** Conserva casos añadidos en caché mientras la hidratación inicial sigue en curso. */
export function mergeCachedCases(fetched: LabCase[]): void {
	const byId = new Map<string, LabCase>();
	for (const c of fetched) byId.set(c.id, c);
	for (const c of cases) {
		if (!byId.has(c.id)) byId.set(c.id, c);
	}
	cases = sortCasesByNewest([...byId.values()]);
	hydrated = true;
}

export function upsertCachedCase(caso: LabCase): void {
	const idx = cases.findIndex((c) => c.id === caso.id);
	if (idx >= 0) cases[idx] = caso;
	else cases = [caso, ...cases];
	hydrated = true;
}

export function remapCachedCaseClientId(oldId: string, newId: string): void {
	if (oldId === newId || cases.length === 0) return;
	cases = cases.map((c) => (c.client_id === oldId ? { ...c, client_id: newId } : c));
}

export function clearCasesCache(): void {
	cases = [];
	hydrated = false;
	hydratePromise = null;
	hydrateGeneration += 1;
}

export function runCasesHydrate(fetcher: () => Promise<LabCase[]>): Promise<LabCase[]> {
	if (hydrated) return Promise.resolve(cases);
	if (!hydratePromise) {
		const gen = hydrateGeneration;
		hydratePromise = fetcher()
			.then((list) => {
				if (gen !== hydrateGeneration) return cases;
				mergeCachedCases(list);
				return cases;
			})
			.catch((err) => {
				if (gen === hydrateGeneration) hydratePromise = null;
				throw err;
			});
	}
	return hydratePromise;
}

/** Siempre vuelve a pedir la lista; no borra casos upsertados mientras llega la respuesta. */
export async function forceCasesHydrate(fetcher: () => Promise<LabCase[]>): Promise<LabCase[]> {
	const gen = ++hydrateGeneration;
	hydratePromise = null;
	hydrated = false;
	const list = await fetcher();
	if (gen !== hydrateGeneration) {
		mergeCachedCases(list);
		return cases;
	}
	mergeCachedCases(list);
	return cases;
}
