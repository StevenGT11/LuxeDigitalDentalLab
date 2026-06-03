import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { error, json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/auth/require-admin';
import { isValidEmailAddress, sendEmail } from '$lib/email';
import type { RequestHandler } from './$types';

/** SMTP requiere TCP; no usar Edge en despliegues que lo soporten. */
export const config = {
	runtime: 'nodejs'
};

const TEST_SUBJECT = 'Prueba de notificación - Luxe Digital Dental Lab';
const TEST_TEXT =
	'Este es un correo de prueba enviado desde la app de Luxe Digital Dental Lab usando Titan SMTP.';

function isTestEmailEnabled(): boolean {
	return dev || env.ENABLE_TEST_EMAIL === 'true';
}

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	if (!isTestEmailEnabled()) {
		error(404, 'Not found');
	}

	const { user } = await safeGetSession();
	const gate = await requireAdmin(
		supabase,
		user?.id,
		'Solo administradores pueden enviar correos de prueba.'
	);
	if (!gate.ok) {
		error(gate.status, gate.message);
	}

	let body: { to?: string };
	try {
		body = await request.json();
	} catch {
		error(400, 'Body JSON inválido.');
	}

	const to = typeof body.to === 'string' ? body.to.trim() : '';
	if (!to || !isValidEmailAddress(to)) {
		error(400, 'Proporciona un campo "to" con un correo válido.');
	}

	try {
		await sendEmail({
			to,
			subject: TEST_SUBJECT,
			text: TEST_TEXT,
			html: `<p>${TEST_TEXT}</p>`
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Error desconocido al enviar.';
		console.error('[api/test-email]', message);
		error(502, message);
	}

	return json({ ok: true, to });
};
