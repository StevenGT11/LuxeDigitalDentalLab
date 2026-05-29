import type { ChartData, ChartOptions, ChartType } from 'chart.js';
import { doughnutTotal, softColor } from './modern-palette';

export interface ChartTheme {
	text: string;
	textMuted: string;
	grid: string;
	tooltipBg: string;
	surface: string;
	accent: string;
}

export function getChartSurfaceColor(): string {
	if (typeof document === 'undefined') return '#ffffff';
	const style = getComputedStyle(document.documentElement);
	return style.getPropertyValue('--dash-card').trim() || '#ffffff';
}

export function getChartTheme(): ChartTheme {
	if (typeof document === 'undefined') {
		return {
			text: '#0f172a',
			textMuted: '#64748b',
			grid: 'rgba(15, 23, 42, 0.04)',
			tooltipBg: '#0f172a',
			surface: '#ffffff',
			accent: '#6366f1'
		};
	}
	const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
	const style = getComputedStyle(document.documentElement);
	const accent = style.getPropertyValue('--dash-accent').trim() || (isDark ? '#a5b4fc' : '#6366f1');

	return {
		text: isDark ? '#f5f5f5' : '#0f172a',
		textMuted: isDark ? '#737373' : '#64748b',
		grid: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(15, 23, 42, 0.04)',
		tooltipBg: isDark ? '#171717' : '#0f172a',
		surface: getChartSurfaceColor(),
		accent
	};
}

export function mergeChartOptions(type: ChartType, overrides: ChartOptions = {}): ChartOptions {
	const theme = getChartTheme();
	const font = { family: 'Outfit, system-ui, sans-serif' as const };

	const base: ChartOptions = {
		responsive: true,
		maintainAspectRatio: false,
		animation: { duration: 400 },
		interaction: { mode: 'nearest', intersect: false },
		plugins: {
			legend: { display: false },
			tooltip: {
				backgroundColor: theme.tooltipBg,
				titleColor: '#fafafa',
				bodyColor: '#d4d4d4',
				borderColor: isDarkTheme() ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.08)',
				borderWidth: 1,
				cornerRadius: 10,
				padding: { x: 14, y: 10 },
				boxPadding: 5,
				titleFont: { ...font, size: 12, weight: '600' },
				bodyFont: { ...font, size: 11 },
				displayColors: true,
				usePointStyle: true,
				boxWidth: 8,
				boxHeight: 8
			}
		}
	};

	if (type === 'doughnut') {
		base.cutout = '82%';
		base.layout = { padding: 2 };
		base.plugins = {
			...base.plugins,
			tooltip: {
				...base.plugins?.tooltip,
				callbacks: {
					label(ctx) {
						const value = Number(ctx.raw ?? 0);
						const total = (ctx.dataset.data as number[]).reduce((s, n) => s + n, 0);
						const pct = total > 0 ? Math.round((value / total) * 100) : 0;
						return ` ${ctx.label} · ${value} (${pct}%)`;
					}
				}
			}
		};
	}

	if (type === 'bar' || type === 'line') {
		base.scales = {
			x: {
				border: { display: false },
				grid: { display: false },
				ticks: {
					color: theme.textMuted,
					font: { ...font, size: 11, weight: '500' },
					maxRotation: 0,
					padding: 8
				}
			},
			y: {
				beginAtZero: true,
				border: { display: false },
				grid: {
					color: theme.grid,
					drawTicks: false,
					lineWidth: 1
				},
				ticks: {
					color: theme.textMuted,
					font: { ...font, size: 10 },
					padding: 12,
					maxTicksLimit: 5
				}
			}
		};
	}

	if (type === 'bar') {
		base.datasets = {
			bar: {
				borderRadius: 10,
				borderSkipped: false,
				maxBarThickness: 36,
				borderWidth: 0,
				categoryPercentage: 0.65,
				barPercentage: 0.85
			}
		};
	}

	if (type === 'line') {
		base.elements = {
			line: { borderCapStyle: 'round', borderJoinStyle: 'round', tension: 0.45 },
			point: { radius: 0, hoverRadius: 5, hoverBorderWidth: 2 }
		};
	}

	return deepMerge(base, overrides);
}

export function polishChartData(type: ChartType, data: ChartData): ChartData {
	const theme = getChartTheme();

	const datasets = data.datasets.map((ds) => {
		if (type === 'doughnut') {
			const colors = normalizeColors(ds.backgroundColor).map((c) => softColor(c, 0.92));
			return {
				...ds,
				backgroundColor: colors,
				hoverBackgroundColor: normalizeColors(ds.backgroundColor),
				borderWidth: 0,
				spacing: 0,
				borderRadius: 0,
				hoverOffset: 4
			};
		}

		if (type === 'bar') {
			const colors = normalizeColors(ds.backgroundColor);
			const single = colors.length === 1;
			return {
				...ds,
				backgroundColor: single ? colors[0] : colors.map((c) => softColor(c, 0.9)),
				hoverBackgroundColor: single ? brightenColor(colors[0], 0.05) : colors,
				borderWidth: 0,
				borderRadius: { topLeft: 10, topRight: 10, bottomLeft: 2, bottomRight: 2 },
				borderSkipped: false,
				maxBarThickness: 36
			};
		}

		if (type === 'line') {
			const lineColor = (typeof ds.borderColor === 'string' ? ds.borderColor : theme.accent) as string;
			return {
				...ds,
				borderColor: lineColor,
				borderWidth: 2.5,
				tension: 0.45,
				fill: true,
				pointRadius: 0,
				pointHoverRadius: 5,
				pointBackgroundColor: '#ffffff',
				pointBorderColor: lineColor,
				pointBorderWidth: 2,
				pointHitRadius: 16
			};
		}

		return ds;
	});

	return { ...data, datasets };
}

export function applyBarChartGradients(
	type: ChartType,
	data: ChartData,
	canvas: HTMLCanvasElement,
	horizontal = false
): ChartData {
	if (type !== 'bar') return data;
	const ctx = canvas.getContext('2d');
	if (!ctx) return data;

	const w = canvas.offsetWidth || 300;
	const h = canvas.offsetHeight || 240;

	const datasets = data.datasets.map((ds) => {
		const colors = normalizeColors(ds.backgroundColor);
		if (colors.length > 1) return ds;

		const base = colors[0] ?? '#6366f1';
		const gradient = horizontal
			? ctx.createLinearGradient(0, 0, w, 0)
			: ctx.createLinearGradient(0, h, 0, 0);

		if (horizontal) {
			gradient.addColorStop(0, withAlpha(base, 0.35));
			gradient.addColorStop(1, base);
		} else {
			gradient.addColorStop(0, base);
			gradient.addColorStop(1, withAlpha(base, 0.45));
		}

		return {
			...ds,
			backgroundColor: gradient,
			hoverBackgroundColor: brightenColor(base, 0.06),
			borderRadius: horizontal
				? { topRight: 10, bottomRight: 10, topLeft: 3, bottomLeft: 3 }
				: { topLeft: 10, topRight: 10, bottomLeft: 3, bottomRight: 3 }
		};
	});

	return { ...data, datasets };
}

export function applyLineChartGradients(
	type: ChartType,
	data: ChartData,
	canvas: HTMLCanvasElement
): ChartData {
	if (type !== 'line') return data;
	const ctx = canvas.getContext('2d');
	if (!ctx) return data;

	const height = canvas.offsetHeight || 240;

	const datasets = data.datasets.map((ds) => {
		const stroke = typeof ds.borderColor === 'string' ? ds.borderColor : '#6366f1';
		const gradient = ctx.createLinearGradient(0, 0, 0, height);
		gradient.addColorStop(0, withAlpha(stroke, 0.18));
		gradient.addColorStop(0.55, withAlpha(stroke, 0.04));
		gradient.addColorStop(1, withAlpha(stroke, 0));
		return { ...ds, backgroundColor: gradient };
	});

	return { ...data, datasets };
}

export function getDoughnutCenter(data: ChartData): { total: number; label: string } {
	const values = (data.datasets[0]?.data as number[]) ?? [];
	const total = doughnutTotal(values);
	return { total, label: total === 1 ? 'total' : 'totales' };
}

export function buildDoughnutLegend(data: ChartData): { label: string; value: number; color: string }[] {
	const labels = (data.labels as string[]) ?? [];
	const values = (data.datasets[0]?.data as number[]) ?? [];
	const colors = normalizeColors(data.datasets[0]?.backgroundColor);
	return labels.map((label, i) => ({
		label,
		value: Number(values[i] ?? 0),
		color: colors[i % colors.length] ?? '#6366f1'
	}));
}

function isDarkTheme(): boolean {
	if (typeof document === 'undefined') return false;
	return document.documentElement.getAttribute('data-theme') === 'dark';
}

function normalizeColors(input: unknown): string[] {
	if (Array.isArray(input)) return input.map(String);
	if (typeof input === 'string') return [input];
	return ['#6366f1'];
}

function withAlpha(hex: string, alpha: number): string {
	if (hex.startsWith('rgba')) return hex;
	if (hex.startsWith('rgb(')) {
		const nums = hex.match(/\d+/g);
		if (!nums || nums.length < 3) return hex;
		return `rgba(${nums[0]}, ${nums[1]}, ${nums[2]}, ${alpha})`;
	}
	const h = hex.replace('#', '');
	if (h.length !== 6) return hex;
	const r = parseInt(h.slice(0, 2), 16);
	const g = parseInt(h.slice(2, 4), 16);
	const b = parseInt(h.slice(4, 6), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function brightenColor(hex: string, amount: number): string {
	if (!hex.startsWith('#') || hex.length < 7) return hex;
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	const mix = (c: number) => Math.min(255, Math.round(c + (255 - c) * amount));
	return `#${mix(r).toString(16).padStart(2, '0')}${mix(g).toString(16).padStart(2, '0')}${mix(b).toString(16).padStart(2, '0')}`;
}

function deepMerge<T extends Record<string, unknown>>(target: T, source: ChartOptions): T {
	const out = { ...target };
	for (const key of Object.keys(source)) {
		const k = key as keyof ChartOptions;
		const sv = source[k];
		const tv = out[k as keyof T];
		if (sv && typeof sv === 'object' && !Array.isArray(sv) && tv && typeof tv === 'object') {
			(out as Record<string, unknown>)[key] = deepMerge(
				tv as Record<string, unknown>,
				sv as ChartOptions
			);
		} else if (sv !== undefined) {
			(out as Record<string, unknown>)[key] = sv;
		}
	}
	return out;
}

export function currencyTooltip(label: string, value: number): string {
	return `${label}: ${new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'USD' }).format(value)}`;
}

export const horizontalBarOptions: ChartOptions<'bar'> = {
	indexAxis: 'y',
	scales: {
		x: {
			border: { display: false },
			grid: { color: 'rgba(128,128,128,0.06)', drawTicks: false },
			ticks: { maxTicksLimit: 5, padding: 8 }
		},
		y: {
			border: { display: false },
			grid: { display: false },
			ticks: { padding: 10, autoSkip: false }
		}
	},
	datasets: {
		bar: {
			borderRadius: 8,
			borderSkipped: false,
			maxBarThickness: 22
		}
	}
};
