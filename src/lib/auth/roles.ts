import type { AuthRole } from './types';

export function isAdminRole(role: AuthRole | null | undefined): boolean {
	return role === 'admin';
}

export function isTechnicianRole(role: AuthRole | null | undefined): boolean {
	return role === 'technician';
}

export function isStaffRole(role: AuthRole | null | undefined): boolean {
	return role === 'admin' || role === 'technician';
}

/** Solo administradores ven montos, facturas y precios. */
export function canViewFinancial(role: AuthRole | null | undefined): boolean {
	return role === 'admin';
}

/** Admin y técnicos pueden registrar clínicas y doctores. */
export function canManageClients(role: AuthRole | null | undefined): boolean {
	return isStaffRole(role);
}

export function getStaffPanelLabel(role: AuthRole | null | undefined): string {
	if (role === 'technician') return 'Panel del taller';
	return 'Panel de administración';
}

export function getStaffRoleLabel(role: AuthRole | null | undefined): string {
	if (role === 'technician') return 'Técnico';
	if (role === 'admin') return 'Administrador';
	return 'Usuario';
}
