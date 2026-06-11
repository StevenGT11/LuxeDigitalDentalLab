import type { PageServerLoad } from './$types';
import { requireFinancialProfile } from '$lib/auth/guards.server';

export const load: PageServerLoad = async ({ parent }) => {
	const { profile } = await parent();
	requireFinancialProfile(profile);
	return {};
};
