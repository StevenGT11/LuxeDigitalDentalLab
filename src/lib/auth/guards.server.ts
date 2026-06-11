import { redirect } from '@sveltejs/kit';
import type { AuthRole, UserProfile } from './types';
import { canViewFinancial, isStaffRole } from './roles';

export function requireStaffProfile(profile: UserProfile | null | undefined): AuthRole {
	if (!profile?.activo || !isStaffRole(profile.role)) {
		redirect(303, '/client');
	}
	return profile.role;
}

export function requireFinancialProfile(profile: UserProfile | null | undefined): void {
	requireStaffProfile(profile);
	if (!canViewFinancial(profile?.role)) {
		redirect(303, '/admin');
	}
}
