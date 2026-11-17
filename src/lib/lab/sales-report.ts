import { getInvoiceEstadoLabel } from '$lib/lab/invoice-estado';

/** Fila detallada de una factura en el reporte de ventas. */
export type SalesReportDetailRow = {
	id: string;
	invoice_number: string;
	fecha_emision: string;
	estado: string;
	client_name: string;
	client_clinica: string;
	case_number: string;
	paciente_name: string;
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

export function sumSalesDetailRows(rows: SalesReportDetailRow[]): SalesReportTotals {
	return rows.reduce(
		(acc, row) => ({
			count: acc.count + 1,
			subtotal: acc.subtotal + (Number(row.subtotal) || 0),
			impuesto: acc.impuesto + (Number(row.impuesto) || 0),
			total: acc.total + (Number(row.total) || 0)
		}),
		{ count: 0, subtotal: 0, impuesto: 0, total: 0 }
	);
}

function roundMoney(value: number): number {
	return Math.round(value * 100) / 100;
}

/** Matriz para armar un .xlsx (encabezados + filas + totales). */
export function salesReportToSheetRows(
	rows: SalesReportDetailRow[],
	totals: SalesReportTotals
): (string | number)[][] {
	const header = [
		'Fecha',
		'Factura',
		'Caso',
		'Cliente',
		'Clínica',
		'Paciente',
		'Estado',
		'Subtotal',
		'IVA',
		'Total'
	];

	const body = rows.map((row) => [
		row.fecha_emision.slice(0, 10),
		row.invoice_number,
		row.case_number || '—',
		row.client_name,
		row.client_clinica,
		row.paciente_name || '—',
		getInvoiceEstadoLabel(row.estado),
		roundMoney(row.subtotal),
		roundMoney(row.impuesto),
		roundMoney(row.total)
	]);

	const footer = [
		'',
		'',
		'',
		'',
		'',
		'',
		`Total (${totals.count})`,
		roundMoney(totals.subtotal),
		roundMoney(totals.impuesto),
		roundMoney(totals.total)
	];

	return [header, ...body, footer];
}

export function salesReportPeriodLabel(year: number, month: number | null): string {
	if (month == null) return String(year);
	return `${MONTH_NAMES_FULL[month - 1]} ${year}`;
}
