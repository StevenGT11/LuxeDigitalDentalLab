import { createSupabaseAdminClient } from '$lib/supabase/admin';
import {
	isCountedSalesEstado,
	normalizeSalesMoneda,
	type SalesReportDetailRow,
	type SalesReportMoneda
} from './sales-report';

type DbFeEmbed = {
	tipo_documento: string | null;
	estado: string | null;
	moneda: string | null;
	subtotal: number | null;
	impuesto: number | null;
	total: number | null;
	consecutivo: string | null;
	clave: string | null;
	fecha_emision: string | null;
};

type DbInvoiceSalesRow = {
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
	fe_comprobantes: DbFeEmbed[] | DbFeEmbed | null;
};

export type FetchSalesReportParams = {
	year: number;
	/** 1–12; null = todo el año */
	month: number | null;
};

function listFeEmbeds(raw: DbInvoiceSalesRow['fe_comprobantes']): DbFeEmbed[] {
	if (!raw) return [];
	return (Array.isArray(raw) ? raw : [raw]).filter(Boolean);
}

/** Prefiere FE 01 aceptada; si no, cualquier FE 01. */
function pickFe01(embeds: DbFeEmbed[]): DbFeEmbed | null {
	const tipo01 = embeds.filter((f) => f.tipo_documento === '01');
	if (tipo01.length === 0) return null;
	return tipo01.find((f) => f.estado === 'aceptado') ?? tipo01[0] ?? null;
}

/**
 * Reporte general de ventas: facturas facturadas/pagadas del periodo.
 * Con FE: montos/moneda del comprobante. Sin FE: libro USD.
 */
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

	const { data, error } = await admin
		.from('invoices')
		.select(
			`
			id,
			invoice_number,
			fecha_emision,
			estado,
			client_name,
			client_clinica,
			case_number,
			paciente_name,
			subtotal,
			impuesto,
			total,
			fe_comprobantes (
				tipo_documento,
				estado,
				moneda,
				subtotal,
				impuesto,
				total,
				consecutivo,
				clave,
				fecha_emision
			)
		`
		)
		.gte('fecha_emision', from)
		.lt('fecha_emision', toExclusive)
		.order('fecha_emision', { ascending: true });

	if (error) {
		throw new Error(error.message || 'No se pudieron cargar las facturas del reporte.');
	}

	const rows: SalesReportDetailRow[] = [];

	for (const inv of (data ?? []) as DbInvoiceSalesRow[]) {
		if (!isCountedSalesEstado(inv.estado)) continue;

		const fe = pickFe01(listFeEmbeds(inv.fe_comprobantes));
		const tieneFe = fe?.estado === 'aceptado';
		const feMoneda = tieneFe ? normalizeSalesMoneda(fe?.moneda) : null;

		let moneda: SalesReportMoneda = 'USD';
		let subtotal = Number(inv.subtotal ?? 0);
		let impuesto = Number(inv.impuesto ?? 0);
		let total = Number(inv.total ?? 0);

		if (tieneFe && fe && fe.total != null && Number.isFinite(Number(fe.total))) {
			moneda = feMoneda ?? 'USD';
			subtotal = Number(fe.subtotal ?? 0);
			impuesto = Number(fe.impuesto ?? 0);
			total = Number(fe.total ?? 0);
		}

		rows.push({
			id: inv.id,
			invoice_number: inv.invoice_number,
			fecha_emision: inv.fecha_emision,
			estado: inv.estado === 'pagada' ? 'pagado' : inv.estado,
			client_name: inv.client_name ?? '',
			client_clinica: inv.client_clinica ?? '',
			case_number: inv.case_number ?? '',
			paciente_name: inv.paciente_name ?? '',
			tiene_fe: tieneFe,
			fe_consecutivo: tieneFe ? (fe?.consecutivo ?? '') : '',
			fe_clave: tieneFe ? (fe?.clave ?? '') : '',
			fe_moneda: feMoneda,
			moneda,
			subtotal,
			impuesto,
			total
		});
	}

	return rows.sort((a, b) => {
		const byDate = a.fecha_emision.localeCompare(b.fecha_emision);
		if (byDate !== 0) return byDate;
		return a.invoice_number.localeCompare(b.invoice_number);
	});
}
