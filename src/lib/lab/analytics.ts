import { getEstadoLabel, getMaterialLabel, getTipoTrabajoLabel } from './constants';
import type {
	AdminDashboardStats,
	ClientRanking,
	Invoice,
	LabCase,
	LabCaseEstado,
	LabClient,
	ProductionStat
} from './types';
import { countPiezasByAnatomy, type AnatomyStat } from './teeth';
import {
	ESTADO_ORDER,
	getEstadoColor,
	getMaterialColor,
	getTipoColor,
	getVitaHex
} from './visual';

function sumItemPiezas(caso: LabCase): number {
	return caso.items.reduce((s, i) => s + i.piezas, 0);
}

export function getCaseTotalPiezas(caso: LabCase): number {
	if (caso.items.length > 0) return sumItemPiezas(caso);
	return caso.piezas;
}

export function getProductionStats(casos: LabCase[]): ProductionStat[] {
	const map = new Map<string, ProductionStat>();

	for (const caso of casos) {
		const items =
			caso.items.length > 0
				? caso.items
				: [
						{
							tipo_trabajo: caso.tipo_trabajo,
							piezas: caso.piezas,
							subtotal: caso.costo
						}
					];

		for (const item of items) {
			const existing = map.get(item.tipo_trabajo) ?? {
				tipo: item.tipo_trabajo,
				label: getTipoTrabajoLabel(item.tipo_trabajo),
				piezas: 0,
				casos: 0,
				ingresos: 0
			};
			existing.piezas += item.piezas;
			existing.ingresos += item.subtotal;
			map.set(item.tipo_trabajo, existing);
		}

		const tiposEnCaso = new Set(items.map((i) => i.tipo_trabajo));
		for (const tipo of tiposEnCaso) {
			const stat = map.get(tipo)!;
			stat.casos += 1;
		}
	}

	return [...map.values()].sort((a, b) => b.piezas - a.piezas);
}

export function countPiezasByTipo(casos: LabCase[], tipo: string): number {
	return getProductionStats(casos)
		.filter((s) => s.tipo === tipo)
		.reduce((sum, s) => sum + s.piezas, 0);
}

export function getClientRankings(
	casos: LabCase[],
	clients: LabClient[],
	limit = 10
): ClientRanking[] {
	const spend = new Map<string, { gastado: number; casos: number; piezas: number }>();

	for (const caso of casos) {
		const cur = spend.get(caso.client_id) ?? { gastado: 0, casos: 0, piezas: 0 };
		cur.gastado += caso.costo;
		cur.casos += 1;
		cur.piezas += getCaseTotalPiezas(caso);
		spend.set(caso.client_id, cur);
	}

	const rankings: ClientRanking[] = [];

	for (const [clientId, data] of spend) {
		const client = clients.find((c) => c.id === clientId);
		if (!client) continue;
		rankings.push({
			client,
			totalGastado: data.gastado,
			totalCasos: data.casos,
			totalPiezas: data.piezas
		});
	}

	return rankings.sort((a, b) => b.totalGastado - a.totalGastado).slice(0, limit);
}

export interface PipelineStat {
	estado: LabCaseEstado;
	label: string;
	count: number;
	color: string;
}

export interface ShadeStat {
	shade: string;
	label: string;
	hex: string;
	piezas: number;
}

export interface MaterialStat {
	material: string;
	label: string;
	piezas: number;
	color: string;
}

export interface ChartSegment {
	label: string;
	value: number;
	color: string;
}

function caseItems(caso: LabCase) {
	if (caso.items.length > 0) return caso.items;
	return [
		{
			numero_pieza: null,
			piezas_dentales: [],
			tipo_trabajo: caso.tipo_trabajo,
			material: caso.material,
			color: caso.color,
			piezas: caso.piezas,
			subtotal: caso.costo
		}
	];
}

export function getPipelineByEstado(casos: LabCase[]): PipelineStat[] {
	return ESTADO_ORDER.map((estado) => ({
		estado,
		label: getEstadoLabel(estado),
		count: casos.filter((c) => c.estado === estado).length,
		color: getEstadoColor(estado)
	}));
}

export function getShadeDistribution(casos: LabCase[]): ShadeStat[] {
	const map = new Map<string, number>();
	for (const caso of casos) {
		for (const item of caseItems(caso)) {
			if (!item.color) continue;
			map.set(item.color, (map.get(item.color) ?? 0) + item.piezas);
		}
	}
	return [...map.entries()]
		.map(([shade, piezas]) => ({
			shade,
			label: shade,
			hex: getVitaHex(shade),
			piezas
		}))
		.sort((a, b) => b.piezas - a.piezas);
}

export function getMaterialDistribution(casos: LabCase[]): MaterialStat[] {
	const map = new Map<string, number>();
	for (const caso of casos) {
		for (const item of caseItems(caso)) {
			const key = item.material ?? '';
			map.set(key, (map.get(key) ?? 0) + item.piezas);
		}
	}
	return [...map.entries()]
		.map(([material, piezas]) => ({
			material,
			label: getMaterialLabel(material || null),
			piezas,
			color: getMaterialColor(material)
		}))
		.sort((a, b) => b.piezas - a.piezas);
}

export function productionToChartSegments(stats: ProductionStat[]): ChartSegment[] {
	return stats.map((row) => ({
		label: row.label,
		value: row.piezas,
		color: getTipoColor(row.tipo)
	}));
}

export function pipelineToChartSegments(stats: PipelineStat[]): ChartSegment[] {
	return stats.filter((s) => s.count > 0).map((s) => ({
		label: s.label,
		value: s.count,
		color: s.color
	}));
}

export function shadesToChartSegments(stats: ShadeStat[]): ChartSegment[] {
	return stats.map((s) => ({
		label: s.label,
		value: s.piezas,
		color: s.hex
	}));
}

export function getActiveCases(casos: LabCase[], limit = 8): LabCase[] {
	return casos
		.filter((c) => c.estado !== 'finalizado')
		.sort((a, b) => new Date(a.fecha_entrega).getTime() - new Date(b.fecha_entrega).getTime())
		.slice(0, limit);
}

export function getDeliveriesThisWeek(casos: LabCase[]): number {
	const now = new Date();
	const weekEnd = new Date(now);
	weekEnd.setDate(weekEnd.getDate() + 7);
	return casos.filter((c) => {
		const d = new Date(c.fecha_entrega);
		return d >= now && d <= weekEnd && c.estado !== 'finalizado';
	}).length;
}

export function getAnatomyStats(casos: LabCase[]): AnatomyStat[] {
	const allItems = casos.flatMap((c) => caseItems(c));
	return countPiezasByAnatomy(allItems);
}

export function getClientAnatomyStats(casos: LabCase[]): AnatomyStat[] {
	return getAnatomyStats(casos);
}

export function anatomyToChartSegments(stats: AnatomyStat[]): ChartSegment[] {
	return stats.map((s) => ({
		label: s.label,
		value: s.piezas,
		color: s.color
	}));
}

export function buildAdminDashboard(
	casos: LabCase[],
	clients: LabClient[],
	invoices: Invoice[],
	estadosEnProceso: LabCase['estado'][]
): AdminDashboardStats {
	return {
		totalCasos: casos.length,
		pendientes: casos.filter((c) => c.estado === 'pendiente').length,
		enProceso: casos.filter((c) => estadosEnProceso.includes(c.estado)).length,
		ingresosTotales: casos.reduce((s, c) => s + c.costo, 0),
		totalClientes: clients.length,
		coronasPiezas: countPiezasByTipo(casos, 'crown'),
		puentesPiezas: countPiezasByTipo(casos, 'bridge'),
		facturasPendientes: invoices.filter((i) => i.estado === 'pendiente').length
	};
}

export interface MonthlyStat {
	key: string;
	label: string;
	casos: number;
	ingresos: number;
	piezas: number;
}

export interface ServiceBreakdownStat {
	label: string;
	items: number;
	piezas: number;
	color: string;
}

export interface InvoiceSummaryStat {
	pendiente: number;
	pagada: number;
	cancelada: number;
	montoPendiente: number;
	montoPagado: number;
	montoTotal: number;
}

export interface DoctorStat {
	doctor_name: string;
	casos: number;
	piezas: number;
	ingresos: number;
}

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export function getMonthlyStats(casos: LabCase[], monthCount = 6): MonthlyStat[] {
	const now = new Date();
	const buckets: MonthlyStat[] = [];

	for (let i = monthCount - 1; i >= 0; i--) {
		const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
		const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
		buckets.push({
			key,
			label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`,
			casos: 0,
			ingresos: 0,
			piezas: 0
		});
	}

	for (const caso of casos) {
		const created = new Date(caso.fecha_creacion);
		const key = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}`;
		const bucket = buckets.find((b) => b.key === key);
		if (!bucket) continue;
		bucket.casos += 1;
		bucket.ingresos += caso.costo;
		bucket.piezas += getCaseTotalPiezas(caso);
	}

	return buckets;
}

export function getServiceBreakdown(casos: LabCase[]): ServiceBreakdownStat[] {
	let soloDiseno = 0;
	let soloFresado = 0;
	let ambos = 0;
	let piezasDiseno = 0;
	let piezasFresado = 0;
	let piezasAmbos = 0;

	for (const caso of casos) {
		for (const item of caseItems(caso)) {
			const incluye_diseno = 'incluye_diseno' in item ? item.incluye_diseno !== false : true;
			const incluye_fresado = 'incluye_fresado' in item ? item.incluye_fresado !== false : true;
			if (incluye_diseno && incluye_fresado) {
				ambos += 1;
				piezasAmbos += item.piezas;
			} else if (incluye_diseno) {
				soloDiseno += 1;
				piezasDiseno += item.piezas;
			} else if (incluye_fresado) {
				soloFresado += 1;
				piezasFresado += item.piezas;
			}
		}
	}

	return [
		{ label: 'Diseño + Fresado', items: ambos, piezas: piezasAmbos, color: '#c9a227' },
		{ label: 'Solo diseño', items: soloDiseno, piezas: piezasDiseno, color: '#2563eb' },
		{ label: 'Solo fresado', items: soloFresado, piezas: piezasFresado, color: '#ea580c' }
	].filter((s) => s.items > 0);
}

export function getInvoiceSummary(invoices: Invoice[]): InvoiceSummaryStat {
	return invoices.reduce(
		(acc, inv) => {
			acc.montoTotal += inv.total;
			if (inv.estado === 'pendiente') {
				acc.pendiente += 1;
				acc.montoPendiente += inv.total;
			} else if (inv.estado === 'pagada') {
				acc.pagada += 1;
				acc.montoPagado += inv.total;
			} else {
				acc.cancelada += 1;
			}
			return acc;
		},
		{
			pendiente: 0,
			pagada: 0,
			cancelada: 0,
			montoPendiente: 0,
			montoPagado: 0,
			montoTotal: 0
		}
	);
}

export function getDoctorStats(casos: LabCase[], limit = 8): DoctorStat[] {
	const map = new Map<string, DoctorStat>();
	for (const caso of casos) {
		const name = caso.doctor_name || 'Sin doctor';
		const cur = map.get(name) ?? { doctor_name: name, casos: 0, piezas: 0, ingresos: 0 };
		cur.casos += 1;
		cur.piezas += getCaseTotalPiezas(caso);
		cur.ingresos += caso.costo;
		map.set(name, cur);
	}
	return [...map.values()].sort((a, b) => b.ingresos - a.ingresos).slice(0, limit);
}

export function getTotalsOverview(casos: LabCase[]) {
	const piezas = casos.reduce((s, c) => s + getCaseTotalPiezas(c), 0);
	const ingresos = casos.reduce((s, c) => s + c.costo, 0);
	const finalizados = casos.filter((c) => c.estado === 'finalizado').length;
	const ticketPromedio = casos.length > 0 ? ingresos / casos.length : 0;
	const piezasPorCaso = casos.length > 0 ? piezas / casos.length : 0;
	return { piezas, ingresos, finalizados, ticketPromedio, piezasPorCaso };
}

export function getDeliveryHealth(casos: LabCase[]) {
	const now = new Date();
	now.setHours(0, 0, 0, 0);
	let aTiempo = 0;
	let atrasados = 0;
	let entregados = 0;

	for (const caso of casos) {
		if (caso.estado === 'finalizado') {
			entregados += 1;
			continue;
		}
		const d = new Date(caso.fecha_entrega);
		d.setHours(0, 0, 0, 0);
		if (d.getTime() < now.getTime()) atrasados += 1;
		else aTiempo += 1;
	}

	return { aTiempo, atrasados, entregados };
}

export function clientRankingsToChartSegments(rankings: ClientRanking[], limit = 8): ChartSegment[] {
	const palette = ['#2563eb', '#0891b2', '#7c3aed', '#c026d3', '#ea580c', '#22c55e', '#f59e0b', '#64748b'];
	return rankings.slice(0, limit).map((r, i) => ({
		label: r.client.nombre.length > 18 ? r.client.nombre.slice(0, 16) + '…' : r.client.nombre,
		value: r.totalGastado,
		color: palette[i % palette.length]
	}));
}

export function materialToChartSegments(stats: MaterialStat[]): ChartSegment[] {
	return stats.map((s) => ({
		label: s.label,
		value: s.piezas,
		color: s.color
	}));
}
