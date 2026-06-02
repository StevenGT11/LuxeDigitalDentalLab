import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ parent }) => {
	const { session, profile } = await parent();

	if (!session) {
		redirect(303, '/');
	}

	if (profile?.role !== 'admin') {
		redirect(303, '/client');
	}

	return {};
};
