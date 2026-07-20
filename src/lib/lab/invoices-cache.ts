import type { Invoice } from './types';

let invoices: Invoice[] = [];
let hydrated = false;
let hydratePromise: Promise<Invoice[]> | null = null;

function sortInvoicesByNewest(list: Invoice[]): Invoice[] {
	return [...list].sort(
		(a, b) => new Date(b.fecha_emision).getTime() - new Date(a.fecha_emision).getTime()
	);
}

export function isInvoicesHydrated(): boolean {
	return hydrated;
}

export function getCachedInvoices(): Invoice[] {
	return invoices;
}

export function setCachedInvoices(list: Invoice[]): void {
	invoices = sortInvoicesByNewest(list);
	hydrated = true;
}

export function mergeCachedInvoices(fetched: Invoice[]): void {
	const byId = new Map<string, Invoice>();
	for (const inv of fetched) byId.set(inv.id, inv);
	for (const inv of invoices) {
		if (!byId.has(inv.id)) byId.set(inv.id, inv);
	}
	invoices = sortInvoicesByNewest([...byId.values()]);
	hydrated = true;
}

export function upsertCachedInvoice(inv: Invoice): void {
	const idx = invoices.findIndex((i) => i.id === inv.id);
	if (idx >= 0) invoices[idx] = inv;
	else invoices = [inv, ...invoices];
	hydrated = true;
}

export function remapCachedInvoiceClientId(oldId: string, newId: string): void {
	if (oldId === newId || invoices.length === 0) return;
	invoices = invoices.map((i) => (i.client_id === oldId ? { ...i, client_id: newId } : i));
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
				mergeCachedInvoices(list);
				return invoices;
			})
			.catch((err) => {
				hydratePromise = null;
				throw err;
			});
	}
	return hydratePromise;
}
