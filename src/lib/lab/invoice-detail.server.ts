import { createSupabaseAdminClient } from '$lib/supabase/admin';
import type { FeComprobanteEstado } from '$lib/fe/types';
import { normalizeImpuestoTarifaForFe } from '$lib/fe/impuesto-tarifa';
import type { InvoiceEstado } from './types';

export type InvoiceLineDetail = {
	id: string;
	sort_order: number;
	descripcion: string;
	cantidad: number;
	precio_unitario: number;
	subtotal: number;
	fe_cabys: string | null;
	fe_unidad_medida: string;
	impuesto_tarifa: number;
};

export type InvoiceDetail = {
	id: string;
	invoice_number: string;
	client_id: string;
	case_id: string;
	client_name: string;
	client_clinica: string;
	case_number: string;
	paciente_name: string;
	subtotal: number;
	impuesto: number;
	total: number;
	fecha_emision: string;
	fecha_vencimiento: string;
	estado: InvoiceEstado;
	lineas: InvoiceLineDetail[];
};

export type ClientFiscalSnapshot = {
	nombre: string;
	email: string;
	fe_tipo_identificacion: string | null;
	fe_numero_identificacion: string | null;
	fe_codigo_actividad: string | null;
	fe_correo_facturacion: string | null;
};

export type FeComprobanteDetail = {
	id: string;
	tipo_documento: string;
	consecutivo_num: number;
	clave: string | null;
	consecutivo: string | null;
	estado: FeComprobanteEstado;
	hacienda_status: number | null;
	subtotal: number;
	impuesto: number;
	total: number;
	fecha_emision: string | null;
	moneda: string;
	ultimo_error: string | null;
	enviado_at: string | null;
	resuelto_at: string | null;
	xml_firmado: string | null;
	respuesta_xml: string | null;
	rechazo: Record<string, unknown> | null;
};

export async function loadInvoiceDetailPage(invoiceId: string): Promise<{
	invoice: InvoiceDetail;
	client: ClientFiscalSnapshot;
	fe: FeComprobanteDetail | null;
} | null> {
	const admin = createSupabaseAdminClient();

	const { data: inv, error: invError } = await admin
		.from('invoices')
		.select(
			`
			id,
			invoice_number,
			client_id,
			case_id,
			client_name,
			client_clinica,
			case_number,
			paciente_name,
			subtotal,
			impuesto,
			total,
			fecha_emision,
			fecha_vencimiento,
			estado,
			invoice_lines (
				id,
				sort_order,
				descripcion,
				cantidad,
				precio_unitario,
				subtotal,
				fe_cabys,
				fe_unidad_medida,
				impuesto_tarifa
			)
		`
		)
		.eq('id', invoiceId)
		.maybeSingle();

	if (invError) throw invError;
	if (!inv) return null;

	const { data: clientRow, error: clientError } = await admin
		.from('clients')
		.select(
			'nombre, email, fe_tipo_identificacion, fe_numero_identificacion, fe_codigo_actividad, fe_correo_facturacion'
		)
		.eq('id', inv.client_id)
		.maybeSingle();
	if (clientError) throw clientError;

	const { data: feRow, error: feError } = await admin
		.from('fe_comprobantes')
		.select(
			`
			id,
			tipo_documento,
			consecutivo_num,
			clave,
			consecutivo,
			estado,
			hacienda_status,
			subtotal,
			impuesto,
			total,
			fecha_emision,
			moneda,
			ultimo_error,
			enviado_at,
			resuelto_at,
			xml_firmado,
			respuesta_xml,
			rechazo
		`
		)
		.eq('invoice_id', invoiceId)
		.eq('tipo_documento', '01')
		.maybeSingle();
	if (feError) throw feError;

	const lineas = ((inv.invoice_lines ?? []) as InvoiceLineDetail[]).sort(
		(a, b) => a.sort_order - b.sort_order
	);

	const invoice: InvoiceDetail = {
		id: inv.id,
		invoice_number: inv.invoice_number,
		client_id: inv.client_id,
		case_id: inv.case_id,
		client_name: inv.client_name,
		client_clinica: inv.client_clinica,
		case_number: inv.case_number,
		paciente_name: inv.paciente_name,
		subtotal: Number(inv.subtotal),
		impuesto: Number(inv.impuesto),
		total: Number(inv.total),
		fecha_emision: inv.fecha_emision,
		fecha_vencimiento: inv.fecha_vencimiento,
		estado: inv.estado as InvoiceEstado,
		lineas: lineas.map((l) => ({
			...l,
			precio_unitario: Number(l.precio_unitario),
			subtotal: Number(l.subtotal),
			impuesto_tarifa: normalizeImpuestoTarifaForFe(l.impuesto_tarifa),
			fe_unidad_medida: l.fe_unidad_medida ?? 'Sp'
		}))
	};

	const client: ClientFiscalSnapshot = {
		nombre: clientRow?.nombre ?? inv.client_name,
		email: clientRow?.email ?? '',
		fe_tipo_identificacion: clientRow?.fe_tipo_identificacion ?? null,
		fe_numero_identificacion: clientRow?.fe_numero_identificacion ?? null,
		fe_codigo_actividad: clientRow?.fe_codigo_actividad ?? null,
		fe_correo_facturacion: clientRow?.fe_correo_facturacion ?? null
	};

	const fe: FeComprobanteDetail | null = feRow
		? {
				id: feRow.id,
				tipo_documento: feRow.tipo_documento,
				consecutivo_num: Number(feRow.consecutivo_num),
				clave: feRow.clave,
				consecutivo: feRow.consecutivo,
				estado: feRow.estado as FeComprobanteEstado,
				hacienda_status: feRow.hacienda_status,
				subtotal: Number(feRow.subtotal),
				impuesto: Number(feRow.impuesto),
				total: Number(feRow.total),
				fecha_emision: feRow.fecha_emision,
				moneda: feRow.moneda ?? 'CRC',
				ultimo_error: feRow.ultimo_error,
				enviado_at: feRow.enviado_at,
				resuelto_at: feRow.resuelto_at,
				xml_firmado: feRow.xml_firmado,
				respuesta_xml: feRow.respuesta_xml,
				rechazo: (feRow.rechazo as Record<string, unknown> | null) ?? null
			}
		: null;

	return { invoice, client, fe };
}
