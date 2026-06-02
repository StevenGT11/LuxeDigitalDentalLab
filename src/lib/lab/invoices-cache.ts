import type { Invoice } from './types';

let invoices: Invoice[] = [];
let hydrated = false;
let hydratePromise: Promise<Invoice[]> | null = null;

export function isInvoicesHydrated(): boolean {
	return hydrated;
}

export function getCachedInvoices(): Invoice[] {
	return invoices;
}

export function setCachedInvoices(list: Invoice[]): void {
	invoices = list;
	hydrated = true;
}

export function upsertCachedInvoice(inv: Invoice): void {
	const idx = invoices.findIndex((i) => i.id === inv.id);
	if (idx >= 0) invoices[idx] = inv;
	else invoices = [inv, ...invoices];
	hydrated = true;
}

export function clearInvoicesCache(): void {
	invoices = [];
	hydrated = false;
	hydratePromise = null;
}

export function runInvoicesHydrate(fetcher: () => Promise<Invoice[]>): Promise<Invoice[]> {
	if (hydrated) return Promise.resolve(invoices);
	if (!hydratePromise) {
		hydratePromise = fetcher()
			.then((list) => {
				setCachedInvoices(list);
				return list;
			})
			.catch((err) => {
				hydratePromise = null;
				throw err;
			});
	}
	return hydratePromise;
}
