import { env } from '$env/dynamic/private';
import { error, json } from '@sveltejs/kit';
import { purgeOldestCaseFiles, sweepFinalizedCaseFiles } from '$lib/lab/purge-case-files.server';
import { createSupabaseAdminClient } from '$lib/supabase/admin';
import type { RequestHandler } from './$types';

export const config = {
	runtime: 'nodejs22.x'
};

/** Vercel Cron llama este GET una vez al día. */
export const GET: RequestHandler = async ({ request }) => {
	const secret = env.CRON_SECRET;
	const auth = request.headers.get('authorization');
	if (!secret || auth !== `Bearer ${secret}`) {
		error(401, 'No autorizado.');
	}

	try {
		const admin = createSupabaseAdminClient();
		const swept = await sweepFinalizedCaseFiles(admin);
		const purged = await purgeOldestCaseFiles(admin);
		return json({ ok: true, swept, purged });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'No se pudo liberar almacenamiento.';
		console.error('[cron/purge-storage]', message);
		error(502, message);
	}
};
