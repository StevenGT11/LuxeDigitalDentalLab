import type { LayoutServerLoad } from './$types';
import type { UserProfile } from '$lib/auth/types';

export const load: LayoutServerLoad = async ({ locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();

	let profile: UserProfile | null = null;

	if (user) {
		const { data, error } = await supabase
			.from('profiles')
			.select('id, role, nombre, email, telefono, clinica, activo')
			.eq('id', user.id)
			.single();

		if (!error && data) {
			profile = data as UserProfile;
		}
	}

	return {
		user,
		profile
	};
};
