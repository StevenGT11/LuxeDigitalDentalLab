import type { LabCase } from './types';
import { isSameDay, toDateKey } from './helpers';

export type CalendarViewMode = 'day' | 'week' | 'month';

export interface CalendarDayCell {
	date: Date;
	inMonth: boolean;
}

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export function getWeekdayLabels(): string[] {
	return WEEKDAY_LABELS;
}

/** Semanas del mes (lunes a domingo) con celdas del mes anterior/siguiente */
export function buildMonthGrid(year: number, month: number): CalendarDayCell[][] {
	const first = new Date(year, month, 1);
	const startOffset = (first.getDay() + 6) % 7;
	const gridStart = new Date(year, month, 1 - startOffset);

	const weeks: CalendarDayCell[][] = [];
	let cursor = new Date(gridStart);

	for (let week = 0; week < 6; week++) {
		const row: CalendarDayCell[] = [];
		for (let day = 0; day < 7; day++) {
			row.push({
				date: new Date(cursor),
				inMonth: cursor.getMonth() === month
			});
			cursor.setDate(cursor.getDate() + 1);
		}
		weeks.push(row);
		if (week >= 4 && row.every((cell) => !cell.inMonth || cell.date.getMonth() !== month)) break;
	}

	return weeks;
}

export function formatMonthTitle(year: number, month: number): string {
	return new Date(year, month, 1).toLocaleDateString('es-ES', {
		month: 'long',
		year: 'numeric'
	});
}

export function formatDayTitle(date: Date): string {
	return date.toLocaleDateString('es-ES', {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		year: 'numeric'
	});
}

export function getWeekStart(date: Date): Date {
	const d = new Date(date);
	const offset = (d.getDay() + 6) % 7;
	d.setDate(d.getDate() - offset);
	d.setHours(0, 0, 0, 0);
	return d;
}

export function buildWeekDays(anchor: Date): Date[] {
	const start = getWeekStart(anchor);
	return Array.from({ length: 7 }, (_, i) => {
		const d = new Date(start);
		d.setDate(start.getDate() + i);
		return d;
	});
}

export function formatWeekTitle(days: Date[]): string {
	if (days.length === 0) return '';
	const start = days[0];
	const end = days[days.length - 1];
	const startLabel = start.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
	const endLabel = end.toLocaleDateString('es-ES', {
		day: 'numeric',
		month: 'short',
		year: start.getFullYear() !== end.getFullYear() ? 'numeric' : undefined
	});
	if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
		return `${start.getDate()} – ${end.getDate()} ${formatMonthTitle(end.getFullYear(), end.getMonth())}`;
	}
	return `${startLabel} – ${endLabel}`;
}

export function addDays(date: Date, amount: number): Date {
	const d = new Date(date);
	d.setDate(d.getDate() + amount);
	return d;
}

export function addMonths(year: number, month: number, amount: number): { year: number; month: number } {
	const d = new Date(year, month + amount, 1);
	return { year: d.getFullYear(), month: d.getMonth() };
}

export function countCasesInWeek(casesByDate: Map<string, LabCase[]>, weekDays: Date[]): number {
	return weekDays.reduce((sum, day) => sum + (casesByDate.get(toDateKey(day))?.length ?? 0), 0);
}

export function groupCasesByDeliveryDate(cases: LabCase[] = []): Map<string, LabCase[]> {
	const map = new Map<string, LabCase[]>();

	for (const caso of cases ?? []) {
		const key = toDateKey(new Date(caso.fecha_entrega));
		const list = map.get(key) ?? [];
		list.push(caso);
		map.set(key, list);
	}

	for (const [key, list] of map) {
		list.sort(
			(a, b) => new Date(a.fecha_entrega).getTime() - new Date(b.fecha_entrega).getTime()
		);
		map.set(key, list);
	}

	return map;
}

export function getActiveDeliveryCases(cases: LabCase[] = [], includeFinished = false): LabCase[] {
	return (cases ?? []).filter((c) => includeFinished || c.estado !== 'finalizado');
}

export function countCasesInMonth(
	casesByDate: Map<string, LabCase[]>,
	year: number,
	month: number
): number {
	let count = 0;
	for (const [key, list] of casesByDate) {
		const d = new Date(key + 'T12:00:00');
		if (d.getFullYear() === year && d.getMonth() === month) count += list.length;
	}
	return count;
}

export function isToday(date: Date): boolean {
	return isSameDay(date, new Date());
}

export function countTodayDeliveries(casesByDate: Map<string, LabCase[]>): number {
	return casesByDate.get(toDateKey(new Date()))?.length ?? 0;
}

export function countOverdueDeliveries(cases: LabCase[] = []): number {
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	return cases.filter((c) => {
		if (c.estado === 'finalizado') return false;
		const d = new Date(c.fecha_entrega);
		d.setHours(0, 0, 0, 0);
		return d.getTime() < today.getTime();
	}).length;
}

export function isPastDay(date: Date): boolean {
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const target = new Date(date);
	target.setHours(0, 0, 0, 0);
	return target.getTime() < today.getTime();
}
