import type { SupabaseClient } from '@supabase/supabase-js';

export type AdminGate =
	| { ok: true }
	| { ok: false; status: number; message: string };

export async function requireAdmin(
	supabase: SupabaseClient,
	userId: string | undefined,
	forbiddenMessage = 'No tienes permiso para realizar esta acción.'
): Promise<AdminGate> {
	if (!userId) {
		return { ok: false, status: 401, message: 'Debes iniciar sesión.' };
	}
	const { data: profile, error } = await supabase
		.from('profiles')
		.select('role, activo')
		.eq('id', userId)
		.single();

	if (error || !profile?.activo || profile.role !== 'admin') {
		return { ok: false, status: 403, message: forbiddenMessage };
	}
	return { ok: true };
}
