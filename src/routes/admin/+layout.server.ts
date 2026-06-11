import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { requireStaffProfile } from '$lib/auth/guards.server';

export const load: LayoutServerLoad = async ({ parent }) => {
	const { session, profile } = await parent();

	if (!session) {
		redirect(303, '/');
	}

	const staffRole = requireStaffProfile(profile);

	return { staffRole };
};
