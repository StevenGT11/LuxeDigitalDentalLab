/** Paleta moderna — tonos suaves, alto contraste en dark mode */
export const CHART_SERIES = [
	'#6366f1',
	'#22d3ee',
	'#34d399',
	'#fbbf24',
	'#f472b6',
	'#a78bfa',
	'#fb923c',
	'#94a3b8'
] as const;

export const CHART_SEMANTIC = {
	positive: '#34d399',
	negative: '#f87171',
	neutral: '#94a3b8',
	warning: '#fbbf24',
	accent: '#6366f1'
} as const;

export function seriesColor(index: number): string {
	return CHART_SERIES[index % CHART_SERIES.length];
}

export function softColor(hex: string, alpha = 0.88): string {
	if (hex.startsWith('rgba')) return hex;
	const h = hex.replace('#', '');
	if (h.length !== 6) return hex;
	const r = parseInt(h.slice(0, 2), 16);
	const g = parseInt(h.slice(2, 4), 16);
	const b = parseInt(h.slice(4, 6), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function doughnutTotal(data: number[]): number {
	return data.reduce((s, n) => s + Number(n || 0), 0);
}
