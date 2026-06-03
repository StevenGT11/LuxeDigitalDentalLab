import { error, json } from '@sveltejs/kit';
import { sendCaseFinalizedClientNotification } from '$lib/server/case-notify';
import type { RequestHandler } from './$types';

export const config = {
	runtime: 'nodejs22.x'
};

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		error(401, 'Debes iniciar sesión.');
	}

	let body: { caseId?: string };
	try {
		body = await request.json();
	} catch {
		error(400, 'Body JSON inválido.');
	}

	const caseId = typeof body.caseId === 'string' ? body.caseId.trim() : '';
	if (!caseId) {
		error(400, 'Proporciona "caseId".');
	}

	try {
		await sendCaseFinalizedClientNotification(supabase, user.id, caseId);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'No se pudo enviar la notificación.';
		console.error('[api/notify/case-finalized]', message);
		error(502, message);
	}

	return json({ ok: true });
};
