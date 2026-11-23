import { json, type RequestEvent } from '@sveltejs/kit';

/** Auth JSON para rutas /api/client/* (portal clínica, sin redirect). */
export async function requireClientApi(
	event: Pick<RequestEvent, 'locals'>
): Promise<
	| { ok: true; userId: string }
	| { ok: false; response: ReturnType<typeof json> }
> {
	const { supabase, safeGetSession } = event.locals;
	const { user } = await safeGetSession();
	if (!user) {
		return { ok: false, response: json({ error: 'Debe iniciar sesión.' }, { status: 401 }) };
	}

	const { data: profile } = await supabase
		.from('profiles')
		.select('role, activo')
		.eq('id', user.id)
		.single();

	if (!profile?.activo || profile.role !== 'client') {
		return { ok: false, response: json({ error: 'Sin permiso.' }, { status: 403 }) };
	}

	return { ok: true, userId: user.id };
}
