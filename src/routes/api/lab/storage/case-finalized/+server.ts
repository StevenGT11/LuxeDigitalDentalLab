import { error, json } from '@sveltejs/kit';
import { deleteCaseStorageFiles, purgeOldestCaseFiles } from '$lib/lab/purge-case-files.server';
import { createSupabaseAdminClient } from '$lib/supabase/admin';
import type { RequestHandler } from './$types';

export const config = {
	runtime: 'nodejs22.x'
};

/** Al finalizar un caso, borra sus archivos y libera casos viejos si el espacio está cerca del límite. */
export const POST: RequestHandler = async ({ request, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) error(401, 'Debes iniciar sesión.');

	let caseId = '';
	try {
		const body = (await request.json()) as { caseId?: string };
		caseId = String(body.caseId ?? '').trim();
	} catch {
		error(400, 'Datos inválidos.');
	}
	if (!caseId) error(400, 'Caso no válido.');

	const admin = createSupabaseAdminClient();
	const { data: caso, error: caseError } = await admin
		.from('cases')
		.select('id, estado')
		.eq('id', caseId)
		.maybeSingle();
	if (caseError) error(400, caseError.message);
	if (!caso) error(404, 'Caso no encontrado.');
	if (caso.estado !== 'finalizado') error(400, 'El caso no está finalizado.');

	try {
		const deleted = await deleteCaseStorageFiles(admin, caseId);
		const purged = await purgeOldestCaseFiles(admin);
		return json({ ok: true, deleted, purged });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'No se pudieron borrar los archivos.';
		console.error('[storage/case-finalized]', message);
		error(502, message);
	}
};
