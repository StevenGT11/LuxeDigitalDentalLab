import { createSupabaseAdminClient } from '$lib/supabase/admin';
import {
	fetchFeComprobanteForInvoice,
	insertFeComprobanteDraft,
	resetFeComprobanteForReemit,
	reserveNextFeConsecutivo,
	updateFeComprobanteAfterConsulta,
	updateFeComprobanteAfterEnviar,
	updateFeComprobanteError
} from './comprobantes.server';
import {
	emisorRowToConsultaConfig,
	emisorRowToFacturadorConfig,
	getFeEmisorConfigForEmit
} from './emisor.server';
import { getEmitAmbiente } from './hacienda-settings.server';
import { feComprobanteBlocksEmit, feComprobanteCanReemit } from './constants';
import { feRechazoToUltimoError } from './format-rechazo';
import { normalizeImpuestoTarifaForFe, impuestoTarifaToCodigoTarifaIva } from './impuesto-tarifa';
import {
	normalizeInvoiceLinesImpuestoTarifa,
	recalculateAndPersistInvoiceTotals,
	syncInvoiceLinesFeFromCase
} from './sync-invoice-lines-fe.server';
import { facturadorConsultar, facturadorEnviar, facturadorValidarEnviar } from './facturador.server';
import {
	assertMediosPagoMatchTotal,
	type FeMedioPagoItem,
	roundMoney
} from './medios-pago';
import type { FeComprobanteEstado } from './types';

type InvoiceRow = {
	id: string;
	client_id: string;
	subtotal: number;
	impuesto: number;
	total: number;
	invoice_lines: {
		sort_order: number;
		descripcion: string;
		cantidad: number;
		precio_unitario: number;
		subtotal: number;
		fe_cabys: string | null;
		fe_unidad_medida: string;
		impuesto_tarifa: number;
	}[];
};

type ClientFiscalRow = {
	nombre: string;
	email: string;
	fe_tipo_identificacion: string | null;
	fe_numero_identificacion: string | null;
	fe_codigo_actividad: string | null;
	fe_correo_facturacion: string | null;
};

function mapConsultaEstado(estado: string): FeComprobanteEstado {
	if (estado === 'aceptado') return 'aceptado';
	if (estado === 'rechazado') return 'rechazado';
	return 'procesando';
}

async function loadInvoice(invoiceId: string): Promise<InvoiceRow> {
	const admin = createSupabaseAdminClient();
	const { data, error } = await admin
		.from('invoices')
		.select(
			`
			id,
			client_id,
			subtotal,
			impuesto,
			total,
			invoice_lines (
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
		.single();
	if (error || !data) throw new Error('Factura no encontrada.');
	return data as InvoiceRow;
}

async function loadClientFiscal(clientId: string): Promise<ClientFiscalRow> {
	const admin = createSupabaseAdminClient();
	const { data, error } = await admin
		.from('clients')
		.select(
			'nombre, email, fe_tipo_identificacion, fe_numero_identificacion, fe_codigo_actividad, fe_correo_facturacion'
		)
		.eq('id', clientId)
		.single();
	if (error || !data) throw new Error('Cliente no encontrado.');
	return data as ClientFiscalRow;
}

function buildPayload(
	emisorConfig: ReturnType<typeof emisorRowToFacturadorConfig>,
	client: ClientFiscalRow,
	invoice: InvoiceRow,
	consecutivoNum: number,
	mediosPago?: FeMedioPagoItem[]
) {
	if (!client.fe_numero_identificacion?.trim() || !client.fe_tipo_identificacion?.trim()) {
		throw new Error(
			'El cliente no tiene datos fiscales. Complete cédula y tipo en la ficha del cliente.'
		);
	}

	const lineas = [...(invoice.invoice_lines ?? [])].sort((a, b) => a.sort_order - b.sort_order);
	if (lineas.length === 0) throw new Error('La factura no tiene líneas.');

	const lineasPayload = lineas.map((l) => {
		if (!l.fe_cabys?.trim()) {
			throw new Error(
				`Falta CABYS en la línea «${l.descripcion}». Asigne CABYS en invoice_lines o en tratamientos.`
			);
		}
		const tarifa = normalizeImpuestoTarifaForFe(l.impuesto_tarifa);
		return {
			descripcion: l.descripcion,
			cantidad: l.cantidad,
			precio_unitario: Number(l.precio_unitario),
			impuesto_tarifa: tarifa,
			codigo_tarifa_iva: impuestoTarifaToCodigoTarifaIva(tarifa),
			unidad_medida: l.fe_unidad_medida || 'Sp',
			cabys: l.fe_cabys.trim()
		};
	});

	const cliente: Record<string, string> = {
		cedula: client.fe_numero_identificacion.trim(),
		nombre_completo: client.nombre.trim(),
		tipo_cedula: client.fe_tipo_identificacion.trim()
	};
	const correo = client.fe_correo_facturacion?.trim() || client.email?.trim();
	if (correo) cliente.correo_electronico = correo;
	if (client.fe_codigo_actividad?.trim()) {
		cliente.codigo_actividad = client.fe_codigo_actividad.trim();
	}

	const total = roundMoney(Number(invoice.total));
	const medios =
		mediosPago && mediosPago.length > 0
			? mediosPago
			: [{ tipo: '01', monto: total } satisfies FeMedioPagoItem];
	assertMediosPagoMatchTotal(medios, total);

	return {
		config: emisorConfig,
		tipo_documento: '01',
		consecutivo_num: consecutivoNum,
		condicion_venta: '01',
		medio_pago: medios[0]!.tipo,
		medios_pago: medios,
		moneda: 'CRC',
		tipo_cambio: 1,
		cliente,
		lineas: lineasPayload
	};
}

export async function emitirFacturaElectronica(
	invoiceId: string,
	options?: { mediosPago?: FeMedioPagoItem[] }
): Promise<{ message: string; clave?: string }> {
	const emisor = await getFeEmisorConfigForEmit();
	if (!emisor) {
		const amb = await getEmitAmbiente();
		throw new Error(
			`No hay configuración de emisor para ${amb === 'production' ? 'producción' : 'pruebas (staging)'}. Complete el panel en Factura electrónica y revise FE_HACIENDA_AMBIENTE en .env.`
		);
	}

	const emitAmbiente = emisor.ambiente;

	const invoice = await loadInvoice(invoiceId);
	const client = await loadClientFiscal(invoice.client_id);

	await syncInvoiceLinesFeFromCase(invoiceId);
	await normalizeInvoiceLinesImpuestoTarifa(invoiceId);
	await recalculateAndPersistInvoiceTotals(invoiceId);
	const invoiceFresh = await loadInvoice(invoiceId);

	let fe = await fetchFeComprobanteForInvoice(invoiceId);
	if (fe && feComprobanteBlocksEmit(fe.estado)) {
		throw new Error('Esta factura ya tiene un comprobante en trámite o aceptado.');
	}

	const isReemit = fe && feComprobanteCanReemit(fe.estado);

	let feId = fe?.id;
	let consecutivoNum = fe?.consecutivo_num;

	if (fe && feComprobanteCanReemit(fe.estado)) {
		consecutivoNum = await reserveNextFeConsecutivo('01', emitAmbiente);
		await resetFeComprobanteForReemit(fe.id, {
			consecutivo_num: consecutivoNum,
			ambiente: emitAmbiente,
			subtotal: Number(invoiceFresh.subtotal),
			impuesto: Number(invoiceFresh.impuesto),
			total: Number(invoiceFresh.total)
		});
		feId = fe.id;
	} else if (fe?.clave && fe.estado !== 'pendiente_envio') {
		throw new Error('Ya existe un envío con clave. Use «Consultar» para actualizar el estado.');
	} else if (!feId || !consecutivoNum) {
		consecutivoNum = await reserveNextFeConsecutivo('01', emitAmbiente);
		feId = await insertFeComprobanteDraft({
			invoice_id: invoiceId,
			consecutivo_num: consecutivoNum,
			ambiente: emitAmbiente,
			subtotal: Number(invoiceFresh.subtotal),
			impuesto: Number(invoiceFresh.impuesto),
			total: Number(invoiceFresh.total)
		});
	}

	if (!feId || consecutivoNum == null) {
		throw new Error('No se pudo preparar el comprobante electrónico.');
	}

	const config = emisorRowToFacturadorConfig(emisor);
	const payload = buildPayload(config, client, invoiceFresh, consecutivoNum, options?.mediosPago);

	const validation = await facturadorValidarEnviar(payload);
	if (!validation.ok) {
		const tarifas = payload.lineas
			.map((l, i) => `L${i + 1}: impuesto_tarifa=${l.impuesto_tarifa}`)
			.join('; ');
		const detail = validation.errors?.length ? validation.errors.join('; ') : validation.error;
		await updateFeComprobanteError(feId, detail);
		throw new Error(`${detail} (${tarifas})`);
	}

	const result = await facturadorEnviar(payload);
	if (!result.ok) {
		const detail = result.errors?.length ? result.errors.join('; ') : result.error;
		await updateFeComprobanteError(feId, detail);
		throw new Error(detail);
	}

	const data = result.data;
	const haciendaStatus = data.hacienda_status ?? 202;
	const estado: FeComprobanteEstado =
		haciendaStatus === 202 ? 'enviado' : haciendaStatus >= 400 ? 'error' : 'enviado';

	await updateFeComprobanteAfterEnviar(feId, {
		clave: data.clave,
		consecutivo: data.consecutivo,
		hacienda_status: haciendaStatus,
		xml_firmado: data.xml ?? '',
		fecha_emision: data.fecha_emision ?? new Date().toISOString(),
		subtotal: Number(data.subtotal ?? invoiceFresh.subtotal),
		impuesto: Number(data.impuesto ?? invoiceFresh.impuesto),
		total: Number(data.total ?? invoiceFresh.total),
		estado
	});

	return {
		message: isReemit
			? (result.message ?? 'Nuevo comprobante enviado a Hacienda (reemisión).')
			: (result.message ?? 'Comprobante enviado a Hacienda.'),
		clave: data.clave
	};
}

export async function consultarFacturaElectronica(invoiceId: string): Promise<{ message: string; estado: string }> {
	const emisor = await getFeEmisorConfigForEmit();
	if (!emisor) throw new Error('No hay configuración de emisor para el ambiente actual.');

	const fe = await fetchFeComprobanteForInvoice(invoiceId);
	if (!fe?.clave) throw new Error('Esta factura no tiene clave de Hacienda. Envíela primero.');

	const consulta = await facturadorConsultar(fe.clave, emisorRowToConsultaConfig(emisor));

	if (!consulta.ok) {
		if (consulta.estado === 'procesando') {
			await updateFeComprobanteAfterConsulta(fe.id, {
				estado: 'procesando',
				ultimo_error: null
			});
			return { message: 'Hacienda aún procesa el comprobante. Intente de nuevo en unos segundos.', estado: 'procesando' };
		}
		await updateFeComprobanteError(fe.id, consulta.message);
		throw new Error(consulta.message);
	}

	const estado = mapConsultaEstado(consulta.estado);
	await updateFeComprobanteAfterConsulta(fe.id, {
		estado,
		respuesta_xml: consulta.data.respuesta_xml,
		rechazo: (consulta.data.rechazo as Record<string, unknown> | undefined) ?? null,
		ultimo_error:
			estado === 'rechazado'
				? feRechazoToUltimoError(consulta.data.rechazo as Record<string, unknown> | undefined)
				: null
	});

	const label = estado === 'aceptado' ? 'aceptada' : estado === 'rechazado' ? 'rechazada' : estado;
	return { message: `Comprobante ${label} por Hacienda.`, estado };
}
