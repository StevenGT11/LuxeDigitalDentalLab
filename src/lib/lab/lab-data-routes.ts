import { browser } from '$app/environment';

/** Rutas que pueden cargar el catálogo de tratamientos (Supabase treatments, etc.). */
const TREATMENTS_CATALOG_PREFIXES = [
	'/admin/tratamientos',
	'/admin/clientes/',
	'/client/'
] as const;

/** Rutas que pueden hidratar casos/facturas en el store del navegador. */
const LAB_STORE_PREFIXES = [
	'/admin/casos',
	'/admin/calendario',
	'/admin/clientes',
	'/admin/estadisticas',
	'/client/'
] as const;

/** Dashboard admin (exacto /admin o /admin/). */
function isAdminDashboard(path: string): boolean {
	return path === '/admin' || path === '/admin/';
}

/** Facturación usa API dedicada — no store ni catálogo. */
const ISOLATED_FINANCIAL_PREFIXES = ['/admin/facturas', '/admin/factura-electronica'] as const;

export function isIsolatedFinancialRoute(pathname?: string): boolean {
	if (!browser && pathname === undefined) return false;
	const path = pathname ?? (browser ? window.location.pathname : '');
	return ISOLATED_FINANCIAL_PREFIXES.some((p) => path.startsWith(p));
}

export function isTreatmentsCatalogRouteAllowed(pathname?: string): boolean {
	if (!browser && pathname === undefined) return true;
	const path = pathname ?? (browser ? window.location.pathname : '');
	if (isIsolatedFinancialRoute(path)) return false;
	return TREATMENTS_CATALOG_PREFIXES.some((p) => path.startsWith(p));
}

export function isLabStoreRouteAllowed(pathname?: string): boolean {
	if (!browser && pathname === undefined) return true;
	const path = pathname ?? (browser ? window.location.pathname : '');
	if (isIsolatedFinancialRoute(path)) return false;
	if (isAdminDashboard(path)) return true;
	return LAB_STORE_PREFIXES.some((p) => path.startsWith(p));
}
