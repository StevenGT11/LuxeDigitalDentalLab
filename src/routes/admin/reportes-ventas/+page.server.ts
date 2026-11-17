import type { PageServerLoad } from './$types';
import { requireFinancialProfile } from '$lib/auth/guards.server';
import { fetchSalesReportDetails } from '$lib/lab/sales-report.server';
import { sumSalesDetailRows } from '$lib/lab/sales-report';

function yearsList(currentYear: number): number[] {
	return Array.from({ length: 6 }, (_, i) => currentYear - i);
}

function clampYear(raw: string | null, currentYear: number, yearsAvailable: number[]): number {
	const parsed = Number.parseInt(raw ?? String(currentYear), 10);
	if (!Number.isFinite(parsed) || !yearsAvailable.includes(parsed)) {
		return currentYear;
	}
	return parsed;
}

/** null = todo el año; 1–12 = mes concreto */
function parseMonth(raw: string | null): number | null {
	if (raw == null || raw === '' || raw === 'all') return null;
	const parsed = Number.parseInt(raw, 10);
	if (!Number.isFinite(parsed) || parsed < 1 || parsed > 12) return null;
	return parsed;
}

export const load: PageServerLoad = async ({ parent, url }) => {
	const { profile } = await parent();
	requireFinancialProfile(profile);

	const currentYear = new Date().getFullYear();
	const yearsAvailable = yearsList(currentYear);
	const year = clampYear(url.searchParams.get('year'), currentYear, yearsAvailable);
	const month = parseMonth(url.searchParams.get('month'));

	const rows = await fetchSalesReportDetails({ year, month });
	const totals = sumSalesDetailRows(rows);

	return { year, month, yearsAvailable, rows, totals };
};
