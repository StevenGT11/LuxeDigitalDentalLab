export type AuthRole = 'admin' | 'client' | 'technician';

export interface UserProfile {
	id: string;
	role: AuthRole;
	nombre: string;
	email: string;
	telefono: string | null;
	clinica: string | null;
	activo: boolean;
}
