import { sendEmail } from '$lib/email';
import type { LabCaseEstado } from '$lib/lab/types';

const APP_NAME = 'Luxe Digital Dental Lab';

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

function layoutHtml(title: string, body: string): string {
	return `<!DOCTYPE html>
<html lang="es">
<body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #111;">
  <h2 style="margin: 0 0 12px;">${escapeHtml(title)}</h2>
  <p style="margin: 0 0 16px;">${body}</p>
  <p style="margin: 0; font-size: 12px; color: #666;">${escapeHtml(APP_NAME)}</p>
</body>
</html>`;
}

/** Nueva orden / caso creado — notificar al equipo interno (uno o varios destinatarios). */
export async function notifyNewCaseCreated(params: {
	to: string | string[];
	caseId: string;
	clientName: string;
	patientName?: string;
}): Promise<void> {
	const recipients = (Array.isArray(params.to) ? params.to : [params.to]).filter(Boolean);
	if (recipients.length === 0) {
		throw new Error('No hay destinatarios para la notificación.');
	}

	const patientLine = params.patientName
		? ` Paciente: ${params.patientName}.`
		: '';
	const subject = `Nueva orden — ${params.caseId}`;
	const text = `Se registró una nueva orden (${params.caseId}) del cliente ${params.clientName}.${patientLine}`;
	const html = layoutHtml(
		'Nueva orden',
		`Se registró la orden <strong>${escapeHtml(params.caseId)}</strong> del cliente <strong>${escapeHtml(params.clientName)}</strong>${params.patientName ? ` (paciente: <strong>${escapeHtml(params.patientName)}</strong>)` : ''}.`
	);

	const results = await Promise.allSettled(
		recipients.map((to) => sendEmail({ to, subject, text, html }))
	);

	const failed = results.filter((r) => r.status === 'rejected');
	if (failed.length === recipients.length) {
		const reason = failed[0].status === 'rejected' ? failed[0].reason : null;
		const message = reason instanceof Error ? reason.message : 'Error desconocido';
		throw new Error(`No se pudo notificar a ningún administrador (${message}).`);
	}
	if (failed.length > 0) {
		console.warn(
			`[email] Nueva orden: ${failed.length}/${recipients.length} administradores no recibieron el correo.`
		);
	}
}

/** Cambio de estado de un caso. */
export async function notifyCaseStatusChange(params: {
	to: string;
	caseId: string;
	estadoAnterior: LabCaseEstado | string;
	estadoNuevo: LabCaseEstado | string;
}): Promise<void> {
	const subject = `Actualización de caso — ${params.caseId}`;
	const text = `El caso ${params.caseId} cambió de "${params.estadoAnterior}" a "${params.estadoNuevo}".`;
	const html = layoutHtml(
		'Cambio de estado',
		`El caso <strong>${escapeHtml(params.caseId)}</strong> pasó de <strong>${escapeHtml(String(params.estadoAnterior))}</strong> a <strong>${escapeHtml(String(params.estadoNuevo))}</strong>.`
	);
	await sendEmail({ to: params.to, subject, text, html });
}

/** Caso listo para entrega / finalizado. */
export async function notifyCaseReadyForDelivery(params: {
	to: string;
	caseId: string;
	clientName?: string;
}): Promise<void> {
	const subject = `Caso listo para entrega — ${params.caseId}`;
	const clientLine = params.clientName ? ` (${params.clientName})` : '';
	const text = `El caso ${params.caseId}${clientLine} está listo para entrega.`;
	const html = layoutHtml(
		'Listo para entrega',
		`El caso <strong>${escapeHtml(params.caseId)}</strong>${params.clientName ? ` de <strong>${escapeHtml(params.clientName)}</strong>` : ''} está listo para entrega.`
	);
	await sendEmail({ to: params.to, subject, text, html });
}

/** Recordatorio interno para el equipo. */
export async function notifyInternalReminder(params: {
	to: string;
	title: string;
	message: string;
}): Promise<void> {
	const subject = `Recordatorio — ${params.title}`;
	const text = params.message;
	const html = layoutHtml(params.title, escapeHtml(params.message));
	await sendEmail({ to: params.to, subject, text, html });
}

/** Notificación al cliente (portal / correo del perfil). */
export async function notifyClient(params: {
	to: string;
	subject: string;
	message: string;
}): Promise<void> {
	const text = params.message;
	const html = layoutHtml(params.subject, escapeHtml(params.message));
	await sendEmail({ to: params.to, subject: params.subject, text, html });
}
