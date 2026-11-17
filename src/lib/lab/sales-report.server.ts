import { createSupabaseAdminClient } from '$lib/supabase/admin';
import { isCountedSalesEstado, type SalesReportDetailRow } from './sales-report';

type DbSalesInvoiceRow = {
	id: string;
	invoice_number: string;
	fecha_emision: string;
	estado: string;
	client_name: string | null;
	client_clinica: string | null;
	case_number: string | null;
	paciente_name: string | null;
	subtotal: number | null;
	impuesto: number | null;
	total: number | null;
};

export type FetchSalesReportParams = {
	year: number;
	/** 1–12; null = todo el año */
	month: number | null;
};

/** Facturas facturadas/pagadas del periodo (detalle por factura). */
export async function fetchSalesReportDetails(
	params: FetchSalesReportParams
): Promise<SalesReportDetailRow[]> {
	const admin = createSupabaseAdminClient();
	const { year, month } = params;

	let from: string;
	let toExclusive: string;
	if (month != null) {
		const mm = String(month).padStart(2, '0');
		from = `${year}-${mm}-01`;
		const nextMonth = month === 12 ? 1 : month + 1;
		const nextYear = month === 12 ? year + 1 : year;
		toExclusive = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
	} else {
		from = `${year}-01-01`;
		toExclusive = `${year + 1}-01-01`;
	}

	/** Filtro de estado en JS: evita fallar si el enum remoto aún no tiene `facturado`. */
	const { data, error } = await admin
		.from('invoices')
		.select(
			'id, invoice_number, fecha_emision, estado, client_name, client_clinica, case_number, paciente_name, subtotal, impuesto, total'
		)
		.gte('fecha_emision', from)
		.lt('fecha_emision', toExclusive)
		.order('fecha_emision', { ascending: true });

	if (error) {
		throw new Error(error.message || 'No se pudieron cargar las facturas del reporte.');
	}

	return ((data ?? []) as DbSalesInvoiceRow[])
		.filter((row) => isCountedSalesEstado(row.estado))
		.map((row) => ({
			id: row.id,
			invoice_number: row.invoice_number,
			fecha_emision: row.fecha_emision,
			estado: row.estado === 'pagada' ? 'pagado' : row.estado,
			client_name: row.client_name ?? '',
			client_clinica: row.client_clinica ?? '',
			case_number: row.case_number ?? '',
			paciente_name: row.paciente_name ?? '',
			subtotal: Number(row.subtotal ?? 0),
			impuesto: Number(row.impuesto ?? 0),
			total: Number(row.total ?? 0)
		}))
		.sort((a, b) => {
			const byDate = a.fecha_emision.localeCompare(b.fecha_emision);
			if (byDate !== 0) return byDate;
			return a.invoice_number.localeCompare(b.invoice_number);
		});
}
