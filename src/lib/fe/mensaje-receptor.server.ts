import { createSupabaseAdminClient } from '$lib/supabase/admin';
import { reserveNextFeConsecutivo } from './comprobantes.server';
import {
	codigoToMensajeReceptorTipo,
	mensajeReceptorTipoToCodigo
} from './fe-recibidos.constants';
import {
	extractFechaEmisionDocFromStoredXml,
	fetchFeRecibidoById,
	fetchLatestMensajeForRecibido,
	insertFeMensajeReceptorDraft,
	updateFeMensajeReceptorAfterConsulta,
	updateFeMensajeReceptorAfterEnviar,
	updateFeMensajeReceptorError,
	updateFeRecibidoEstado
} from './fe-recibidos.server';
import type { FeMensajeReceptorTipo } from './fe-recibidos.types';
import {
	emisorRowToConsultaConfig,
	emisorRowToFacturadorConfig,
	getFeEmisorConfigForEmit
} from './emisor.server';
import { facturadorConsultar } from './facturador.server';
import { buildMensajeReceptorXml } from './mensaje-receptor-xml';
import { getEmitAmbiente } from './hacienda-settings.server';
import type { FeComprobanteEstado } from './types';

async function getFacturadorLowLevel() {
	const mod = await import('@happy-prod/facturador');
	return mod as {
		generarClave: (params: {
			cedula: string;
			tipoDocumento: string;
			consecutivoNum: number;
			casaMatriz?: string;
			terminal?: string;
			fecha?: Date;
		}) => { clave: string; consecutivo: string };
		signXML: (params: { xml: string; p12: string; pin: string }) => Promise<string>;
		enviarComprobante: (
			params: {
				clave: string;
				fecha: string;
				emisorTipoIdentificacion: string;
				emisorNumeroIdentificacion: string;
				receptorTipoIdentificacion?: string;
				receptorNumeroIdentificacion?: string;
				comprobanteXml: string;
			},
			credentials: { usuario: string; password: string; ambiente: string }
		) => Promise<{ success: boolean; status?: number; message?: string }>;
	};
}

function mapConsultaEstado(estado: string): FeComprobanteEstado {
	if (estado === 'aceptado') return 'aceptado';
	if (estado === 'rechazado') return 'rechazado';
	return 'procesando';
}

function mapRecibidoEstadoFromMensaje(
	mensaje: FeMensajeReceptorTipo,
	mensajeEstado: FeComprobanteEstado
): 'aceptado' | 'rechazado' | 'mensaje_enviado' {
	if (mensajeEstado === 'aceptado') {
		return mensaje === 'rechazado' ? 'rechazado' : 'aceptado';
	}
	if (mensajeEstado === 'rechazado' || mensajeEstado === 'error') {
		return 'rechazado';
	}
	return 'mensaje_enviado';
}

async function pollMensajeConsulta(
	mensajeId: string,
	clave: string,
	config: Record<string, unknown>
): Promise<{ estado: FeComprobanteEstado; message: string }> {
	await new Promise((r) => setTimeout(r, 1500));
	for (let i = 0; i < 6; i++) {
		const result = await facturadorConsultar(clave, config);
		if (result.ok) {
			const estado = mapConsultaEstado(result.estado);
			await updateFeMensajeReceptorAfterConsulta({
				id: mensajeId,
				estado,
				respuesta_xml: result.data.respuesta_xml ?? null,
				rechazo: (result.data.rechazo as Record<string, unknown> | undefined) ?? null
			});
			return {
				estado,
				message:
					estado === 'aceptado'
						? 'Confirmación aceptada por Hacienda.'
						: 'Hacienda rechazó la confirmación.'
			};
		}
		if (result.estado !== 'procesando') break;
		await new Promise((r) => setTimeout(r, 2000));
	}
	return { estado: 'procesando', message: 'Enviado; Hacienda aún procesa. Use Consultar más tarde.' };
}

export async function enviarMensajeReceptorParaRecibido(
	feRecibidoId: string,
	mensaje: FeMensajeReceptorTipo,
	detalleMensaje = ''
): Promise<{ message: string; feEstado: string }> {
	const recibido = await fetchFeRecibidoById(feRecibidoId);
	if (!recibido) throw new Error('Comprobante no encontrado.');
	if (recibido.estado !== 'pendiente_aceptacion') {
		throw new Error('Este comprobante ya fue respondido o está en proceso.');
	}

	const ambiente = await getEmitAmbiente();
	const emisor = await getFeEmisorConfigForEmit();
	if (!emisor) throw new Error('No hay emisor activo configurado.');

	const admin = createSupabaseAdminClient();
	const { data: xmlRow, error: xmlError } = await admin
		.from('fe_recibidos')
		.select('xml_recibido')
		.eq('id', feRecibidoId)
		.single();
	if (xmlError) throw xmlError;

	const fechaEmisionDoc = extractFechaEmisionDocFromStoredXml(String(xmlRow.xml_recibido));
	const consecutivoNum = await reserveNextFeConsecutivo('05', ambiente);
	const mensajeId = await insertFeMensajeReceptorDraft({
		fe_recibido_id: feRecibidoId,
		mensaje,
		detalle_mensaje: detalleMensaje,
		consecutivo_num: consecutivoNum,
		ambiente
	});

	await updateFeRecibidoEstado(feRecibidoId, 'mensaje_enviado');

	try {
		const facturador = await getFacturadorLowLevel();
		const config = emisorRowToFacturadorConfig(emisor);
		const { clave, consecutivo } = facturador.generarClave({
			cedula: emisor.numero_identificacion,
			tipoDocumento: '05',
			consecutivoNum,
			casaMatriz: emisor.casa_matriz,
			terminal: emisor.terminal,
			fecha: new Date()
		});

		const codigoMensaje = mensajeReceptorTipoToCodigo(mensaje);
		const xmlUnsigned = buildMensajeReceptorXml({
			claveOriginal: recibido.clave,
			emisorTipoIdentificacion: recibido.emisor_tipo_identificacion,
			emisorNumeroIdentificacion: recibido.emisor_numero_identificacion,
			fechaEmisionDoc,
			mensaje: codigoMensaje,
			detalleMensaje,
			montoTotalImpuesto: recibido.impuesto,
			totalFactura: recibido.total,
			receptorTipoIdentificacion: emisor.tipo_identificacion,
			receptorNumeroIdentificacion: emisor.numero_identificacion.replace(/\D/g, ''),
			consecutivoReceptor: consecutivo
		});

		const xmlSigned = await facturador.signXML({
			xml: xmlUnsigned,
			p12: emisor.certificado_p12,
			pin: emisor.pin_certificado
		});

		const fechaEnvio = new Date().toISOString();
		const haciendaResponse = await facturador.enviarComprobante(
			{
				clave,
				fecha: fechaEnvio,
				emisorTipoIdentificacion: emisor.tipo_identificacion,
				emisorNumeroIdentificacion: emisor.numero_identificacion.replace(/\D/g, ''),
				receptorTipoIdentificacion: recibido.emisor_tipo_identificacion,
				receptorNumeroIdentificacion: recibido.emisor_numero_identificacion,
				comprobanteXml: Buffer.from(xmlSigned).toString('base64')
			},
			{
				usuario: emisor.hacienda_usuario,
				password: emisor.hacienda_password,
				ambiente: emisor.ambiente === 'production' ? 'production' : 'staging'
			}
		);

		if (!haciendaResponse.success) {
			throw new Error(haciendaResponse.message ?? 'Hacienda rechazó el envío del mensaje receptor.');
		}

		await updateFeMensajeReceptorAfterEnviar({
			id: mensajeId,
			clave,
			consecutivo,
			hacienda_status: haciendaResponse.status ?? 202,
			xml_firmado: xmlSigned
		});

		const consulta = await pollMensajeConsulta(
			mensajeId,
			clave,
			emisorRowToConsultaConfig(emisor)
		);
		const recibidoEstado = mapRecibidoEstadoFromMensaje(mensaje, consulta.estado);
		await updateFeRecibidoEstado(feRecibidoId, recibidoEstado);

		return { message: consulta.message, feEstado: recibidoEstado };
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Error al enviar mensaje receptor.';
		await updateFeMensajeReceptorError(mensajeId, message);
		await updateFeRecibidoEstado(feRecibidoId, 'pendiente_aceptacion');
		throw err instanceof Error ? err : new Error(message);
	}
}

export async function consultarMensajeReceptorParaRecibido(
	feRecibidoId: string
): Promise<{ message: string; feEstado: string }> {
	const recibido = await fetchFeRecibidoById(feRecibidoId);
	if (!recibido) throw new Error('Comprobante no encontrado.');

	const mensaje = await fetchLatestMensajeForRecibido(feRecibidoId);
	if (!mensaje?.clave) throw new Error('No hay mensaje receptor enviado para consultar.');

	const ambiente = await getEmitAmbiente();
	const emisor = await getFeEmisorConfigForEmit();
	if (!emisor) throw new Error('No hay emisor activo configurado.');

	const result = await facturadorConsultar(mensaje.clave, emisorRowToConsultaConfig(emisor));
	if (!result.ok) {
		if (result.estado === 'procesando') {
			return { message: result.message, feEstado: recibido.estado };
		}
		throw new Error(result.message);
	}

	const estado = mapConsultaEstado(result.estado);
	await updateFeMensajeReceptorAfterConsulta({
		id: mensaje.id,
		estado,
		respuesta_xml: result.data.respuesta_xml ?? null,
		rechazo: (result.data.rechazo as Record<string, unknown> | undefined) ?? null
	});

	const recibidoEstado = mapRecibidoEstadoFromMensaje(mensaje.mensaje, estado);
	await updateFeRecibidoEstado(feRecibidoId, recibidoEstado);

	const message =
		estado === 'aceptado'
			? 'Confirmación aceptada por Hacienda.'
			: estado === 'rechazado'
				? 'Hacienda rechazó la confirmación.'
				: 'Aún procesando en Hacienda.';

	return { message, feEstado: recibidoEstado };
}

export function parseMensajeAction(value: string): FeMensajeReceptorTipo {
	const v = value.trim().toLowerCase();
	if (v === 'rechazado' || v === '3') return 'rechazado';
	if (v === 'aceptado_parcial' || v === '2') return 'aceptado_parcial';
	return 'aceptado';
}

export { codigoToMensajeReceptorTipo, mensajeReceptorTipoToCodigo };
