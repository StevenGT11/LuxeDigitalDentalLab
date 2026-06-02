import type { LabCase } from './types';

let cases: LabCase[] = [];
let hydrated = false;
let hydratePromise: Promise<LabCase[]> | null = null;

export function isCasesHydrated(): boolean {
	return hydrated;
}

export function getCachedCases(): LabCase[] {
	return cases;
}

export function setCachedCases(list: LabCase[]): void {
	cases = list;
	hydrated = true;
}

export function upsertCachedCase(caso: LabCase): void {
	const idx = cases.findIndex((c) => c.id === caso.id);
	if (idx >= 0) cases[idx] = caso;
	else cases = [caso, ...cases];
	hydrated = true;
}

export function clearCasesCache(): void {
	cases = [];
	hydrated = false;
	hydratePromise = null;
}

export function runCasesHydrate(fetcher: () => Promise<LabCase[]>): Promise<LabCase[]> {
	if (hydrated) return Promise.resolve(cases);
	if (!hydratePromise) {
		hydratePromise = fetcher()
			.then((list) => {
				setCachedCases(list);
				return list;
			})
			.catch((err) => {
				hydratePromise = null;
				throw err;
			});
	}
	return hydratePromise;
}
