import { getInvoiceEstadoLabel } from '$lib/lab/invoice-estado';
import { formatInvoiceMoney } from '$lib/lab/invoice-money';

export type SalesReportMoneda = 'CRC' | 'USD';

/** Fila detallada: montos en la moneda de visualización (FE si hay; si no, libro USD). */
export type SalesReportDetailRow = {
	id: string;
	invoice_number: string;
	fecha_emision: string;
	estado: string;
	client_name: string;
	client_clinica: string;
	case_number: string;
	paciente_name: string;
	/** true si tiene FE tipo 01 aceptada */
	tiene_fe: boolean;
	fe_consecutivo: string;
	fe_clave: string;
	/** Moneda FE si existe; null = sin FE */
	fe_moneda: SalesReportMoneda | null;
	/** Moneda de los montos de esta fila */
	moneda: SalesReportMoneda;
	subtotal: number;
	impuesto: number;
	total: number;
};

export type SalesReportTotals = {
	count: number;
	subtotal: number;
	impuesto: number;
	total: number;
};

export type SalesReportTotalsByMoneda = {
	USD: SalesReportTotals;
	CRC: SalesReportTotals;
};

/** Filtro de factura electrónica en el reporte. */
export type SalesReportFeFilter = 'all' | 'con_fe' | 'sin_fe';

export function parseSalesReportFeFilter(raw: string | null): SalesReportFeFilter {
	if (raw === 'con_fe' || raw === 'sin_fe') return raw;
	return 'all';
}

export function filterSalesRowsByFe(
	rows: SalesReportDetailRow[],
	feFilter: SalesReportFeFilter
): SalesReportDetailRow[] {
	if (feFilter === 'con_fe') return rows.filter((r) => r.tiene_fe);
	if (feFilter === 'sin_fe') return rows.filter((r) => !r.tiene_fe);
	return rows;
}

export const MONTH_NAMES_FULL = [
	'Enero',
	'Febrero',
	'Marzo',
	'Abril',
	'Mayo',
	'Junio',
	'Julio',
	'Agosto',
	'Septiembre',
	'Octubre',
	'Noviembre',
	'Diciembre'
] as const;

export function isCountedSalesEstado(estado: string): boolean {
	return estado === 'facturado' || estado === 'pagado' || estado === 'pagada';
}

export function normalizeSalesMoneda(raw: string | null | undefined): SalesReportMoneda {
	return String(raw ?? '').toUpperCase() === 'CRC' ? 'CRC' : 'USD';
}

export function formatSalesMoney(amount: number, moneda: SalesReportMoneda = 'USD'): string {
	return formatInvoiceMoney(amount, moneda);
}

export function sumSalesDetailRows(rows: SalesReportDetailRow[]): SalesReportTotalsByMoneda {
	const empty = (): SalesReportTotals => ({ count: 0, subtotal: 0, impuesto: 0, total: 0 });
	const out: SalesReportTotalsByMoneda = { USD: empty(), CRC: empty() };

	for (const row of rows) {
		const bucket = out[row.moneda];
		bucket.count += 1;
		bucket.subtotal += Number(row.subtotal) || 0;
		bucket.impuesto += Number(row.impuesto) || 0;
		bucket.total += Number(row.total) || 0;
	}

	return out;
}

export function salesReportTotalCount(totals: SalesReportTotalsByMoneda): number {
	return totals.USD.count + totals.CRC.count;
}

function roundMoney(value: number): number {
	return Math.round(value * 100) / 100;
}

/** Matriz para armar un .xlsx (encabezados + filas + totales por moneda). */
export function salesReportToSheetRows(
	rows: SalesReportDetailRow[],
	totals: SalesReportTotalsByMoneda
): (string | number)[][] {
	const header = [
		'Fecha',
		'Factura',
		'FE',
		'Consecutivo FE',
		'Clave FE',
		'Caso',
		'Cliente',
		'Clínica',
		'Paciente',
		'Estado cobro',
		'Moneda',
		'Subtotal',
		'IVA',
		'Total'
	];

	const body = rows.map((row) => [
		row.fecha_emision.slice(0, 10),
		row.invoice_number,
		row.tiene_fe ? 'Sí' : 'No',
		row.fe_consecutivo || '—',
		row.fe_clave || '—',
		row.case_number || '—',
		row.client_name,
		row.client_clinica,
		row.paciente_name || '—',
		getInvoiceEstadoLabel(row.estado),
		row.moneda,
		roundMoney(row.subtotal),
		roundMoney(row.impuesto),
		roundMoney(row.total)
	]);

	const footers: (string | number)[][] = [];
	for (const moneda of ['USD', 'CRC'] as const) {
		const t = totals[moneda];
		if (t.count === 0) continue;
		footers.push([
			'',
			'',
			'',
			'',
			'',
			'',
			'',
			'',
			'',
			`Total ${moneda} (${t.count})`,
			moneda,
			roundMoney(t.subtotal),
			roundMoney(t.impuesto),
			roundMoney(t.total)
		]);
	}

	return [header, ...body, ...footers];
}

export function salesReportPeriodLabel(year: number, month: number | null): string {
	if (month == null) return String(year);
	return `${MONTH_NAMES_FULL[month - 1]} ${year}`;
}
