import type { SupabaseClient } from '@supabase/supabase-js';
import { isStaffRole } from './roles';

export type StaffGate =
	| { ok: true }
	| { ok: false; status: number; message: string };

export async function requireStaff(
	supabase: SupabaseClient,
	userId: string | undefined,
	forbiddenMessage = 'No tienes permiso para realizar esta acción.'
): Promise<StaffGate> {
	if (!userId) {
		return { ok: false, status: 401, message: 'Debes iniciar sesión.' };
	}
	const { data: profile, error } = await supabase
		.from('profiles')
		.select('role, activo')
		.eq('id', userId)
		.single();

	if (error || !profile?.activo || !isStaffRole(profile.role)) {
		return { ok: false, status: 403, message: forbiddenMessage };
	}
	return { ok: true };
}
