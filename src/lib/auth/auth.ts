import { createSupabaseBrowserClient } from '$lib/supabase/client';
import type { AuthRole, UserProfile } from './types';

export function getHomePathForRole(role: AuthRole): string {
	return role === 'client' ? '/client' : '/admin';
}

export async function signInWithEmail(
	email: string,
	password: string
): Promise<{ role: AuthRole } | { error: string }> {
	const supabase = createSupabaseBrowserClient();
	const normalizedEmail = email.trim().toLowerCase();

	const { error: signInError } = await supabase.auth.signInWithPassword({
		email: normalizedEmail,
		password
	});

	if (signInError) {
		return { error: signInError.message };
	}

	const profile = await fetchCurrentProfile(supabase);
	if (!profile) {
		await supabase.auth.signOut();
		return { error: 'No se encontró el perfil del usuario. Contacta al administrador.' };
	}

	if (!profile.activo) {
		await supabase.auth.signOut();
		return { error: 'Tu cuenta está desactivada. Contacta al administrador.' };
	}

	return { role: profile.role };
}

export async function signOut(): Promise<void> {
	const supabase = createSupabaseBrowserClient();
	await supabase.auth.signOut();
}

async function fetchCurrentProfile(
	supabase: ReturnType<typeof createSupabaseBrowserClient>
): Promise<UserProfile | null> {
	const {
		data: { user }
	} = await supabase.auth.getUser();

	if (!user) return null;

	const { data, error } = await supabase
		.from('profiles')
		.select('id, role, nombre, email, telefono, clinica, activo')
		.eq('id', user.id)
		.single();

	if (error || !data) return null;

	return data as UserProfile;
}
