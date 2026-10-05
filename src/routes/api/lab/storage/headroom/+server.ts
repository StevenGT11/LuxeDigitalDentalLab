import { error, json } from '@sveltejs/kit';
import {
	STORAGE_KEEP_BYTES,
	STORAGE_LIMIT_BYTES,
	STORAGE_NEAR_BYTES,
	purgeOldestCaseFiles
} from '$lib/lab/purge-case-files.server';
import { createSupabaseAdminClient } from '$lib/supabase/admin';
import type { RequestHandler } from './$types';

export const config = {
	runtime: 'nodejs22.x'
};

/** Antes de subir archivos, libera casos viejos si el uso ya está cerca de 1 GB. */
export const POST: RequestHandler = async ({ request, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) error(401, 'Debes iniciar sesión.');

	let incomingBytes = 0;
	try {
		const body = (await request.json()) as { incomingBytes?: number };
		incomingBytes = Math.min(
			Math.max(0, Number(body.incomingBytes) || 0),
			STORAGE_LIMIT_BYTES
		);
	} catch {
		incomingBytes = 0;
	}

	const margin = 64 * 1024 * 1024;
	const nearBytes = Math.max(0, STORAGE_NEAR_BYTES - incomingBytes);
	const keepBytes = Math.max(
		0,
		Math.min(STORAGE_KEEP_BYTES, STORAGE_LIMIT_BYTES - incomingBytes - margin)
	);

	try {
		const purged = await purgeOldestCaseFiles(createSupabaseAdminClient(), nearBytes, keepBytes);
		return json({ ok: true, purged });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'No se pudo liberar almacenamiento.';
		console.error('[storage/headroom]', message);
		error(502, message);
	}
};
