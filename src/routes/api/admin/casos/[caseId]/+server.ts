import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/auth/require-admin';
import type { CreateCaseInput } from '$lib/lab/store-types';
import { updateLabCaseAsAdmin } from '$lib/lab/update-case.server';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	const gate = await requireAdmin(supabase, user?.id, 'Solo administradores pueden editar casos.');
	if (!gate.ok) return json({ message: gate.message }, { status: gate.status });

	const caseId = params.caseId;
	if (!caseId) return json({ message: 'Caso no válido.' }, { status: 400 });

	let input: CreateCaseInput;
	try {
		input = (await request.json()) as CreateCaseInput;
	} catch {
		return json({ message: 'Datos del caso inválidos.' }, { status: 400 });
	}

	const { data: profile } = await supabase
		.from('profiles')
		.select('nombre')
		.eq('id', user!.id)
		.maybeSingle();

	try {
		await updateLabCaseAsAdmin(caseId, input, {
			id: user!.id,
			nombre: profile?.nombre?.trim() || 'Administrador'
		});
		return json({ ok: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'No se pudo guardar el caso.';
		return json({ message }, { status: 400 });
	}
};
