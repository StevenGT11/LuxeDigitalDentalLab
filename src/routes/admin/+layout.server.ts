import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { requireStaffProfile } from '$lib/auth/guards.server';

export const load: LayoutServerLoad = async ({ parent }) => {
	const { user, profile } = await parent();

	if (!user) {
		redirect(303, '/');
	}

	const staffRole = requireStaffProfile(profile);

	return { staffRole };
};
