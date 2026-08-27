import { json, type RequestEvent } from '@sveltejs/kit';
import { canViewFinancial, isStaffRole } from './roles';

/** Auth JSON para rutas /api/admin/* de facturación (sin redirect). */
export async function requireFinancialApi(
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

	if (!profile?.activo || !isStaffRole(profile.role) || !canViewFinancial(profile.role)) {
		return { ok: false, response: json({ error: 'Sin permiso.' }, { status: 403 }) };
	}

	return { ok: true, userId: user.id };
}
