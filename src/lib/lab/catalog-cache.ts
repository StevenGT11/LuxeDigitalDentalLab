import type { MaterialRestauracion, RestauracionPrecio } from './restoration-pricing';
import type { GuiaPrecioTier, ImplantesGuia } from './surgical-guide';
import type { LabTreatment, TreatmentCategory } from './treatments';
import { DEFAULT_TREATMENTS, sortTreatmentsList } from './treatments-core';

export interface CatalogAddon {
	code: string;
	label: string;
	treatment_slug: string | null;
	precio_diseno_usd: number;
	precio_fresado_usd: number;
	precio_diseno_crc: number;
	precio_fresado_crc: number;
}

export interface CatalogSnapshot {
	treatments: LabTreatment[];
	restorationMatrix: Map<string, Partial<Record<MaterialRestauracion, RestauracionPrecio>>>;
	guidePrices: Record<ImplantesGuia, GuiaPrecioTier>;
	addons: Map<string, CatalogAddon>;
}

let snapshot: CatalogSnapshot | null = null;
let hydratePromise: Promise<CatalogSnapshot> | null = null;

function emptySnapshot(): CatalogSnapshot {
	return {
		treatments: DEFAULT_TREATMENTS,
		restorationMatrix: new Map(),
		guidePrices: {} as Record<ImplantesGuia, GuiaPrecioTier>,
		addons: new Map()
	};
}

export function isCatalogHydrated(): boolean {
	return snapshot !== null;
}

export function getCatalogSnapshot(): CatalogSnapshot {
	return snapshot ?? emptySnapshot();
}

export function setCatalogSnapshot(next: CatalogSnapshot): void {
	snapshot = next;
}

export function clearCatalogCache(): void {
	snapshot = null;
	hydratePromise = null;
}

export function applyCatalogToSnapshot(data: {
	treatments: LabTreatment[];
	restorationMatrix: Map<string, Partial<Record<MaterialRestauracion, RestauracionPrecio>>>;
	guidePrices: Record<ImplantesGuia, GuiaPrecioTier>;
	addons: CatalogAddon[];
}): CatalogSnapshot {
	const next: CatalogSnapshot = {
		treatments: sortTreatmentsList(data.treatments),
		restorationMatrix: data.restorationMatrix,
		guidePrices: data.guidePrices,
		addons: new Map(data.addons.map((a) => [a.code, a]))
	};
	setCatalogSnapshot(next);
	return next;
}

export function runCatalogHydrate(
	fetcher: () => Promise<CatalogSnapshot>
): Promise<CatalogSnapshot> {
	if (snapshot) return Promise.resolve(snapshot);
	if (!hydratePromise) {
		hydratePromise = fetcher()
			.then((data) => {
				setCatalogSnapshot(data);
				return data;
			})
			.catch((err) => {
				hydratePromise = null;
				throw err;
			});
	}
	return hydratePromise;
}
