/** Display label for CABYS impuesto column (catalog uses decimals like 0.13). */
export function cabysImpuestoLabel(impuesto: string | null | undefined): string {
	const raw = String(impuesto ?? '').trim();
	if (!raw) return '—';
	const n = Number(raw);
	if (!Number.isFinite(n)) return raw;
	if (n === 0) return 'Exento';
	const pct = n <= 1 ? Math.round(n * 100) : Math.round(n);
	return `${pct}% IVA`;
}

/** Map CABYS catalog impuesto (e.g. 0.13) to impuesto_tarifa for FE (13). */
export function cabysImpuestoToTarifa(impuesto: string | null | undefined): number {
	const raw = String(impuesto ?? '').trim();
	if (!raw) return 13;
	const lower = raw.toLowerCase();
	if (lower === 'exento' || lower === 'na') return 0;
	if (raw.endsWith('%')) {
		const pct = Number(raw.replace('%', '').trim());
		if (Number.isFinite(pct)) return pct === 0 ? 0 : pct;
	}
	const n = Number(raw);
	if (!Number.isFinite(n)) return 13;
	if (n === 0) return 0;
	if (n > 0 && n <= 1) return Math.round(n * 10000) / 100;
	if (n === 8) return 13;
	return Math.round(n * 100) / 100;
}
