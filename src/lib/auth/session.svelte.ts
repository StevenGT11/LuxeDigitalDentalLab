const STORAGE_KEY = 'luxe_lab_auth';

export type AuthRole = 'admin' | 'client';

const CREDENTIALS: Record<AuthRole, { username: string; password: string }> = {
	admin: { username: 'admin', password: 'admin' },
	client: { username: 'client', password: 'client' }
};

let authenticated = $state(false);
let role = $state<AuthRole | null>(null);
let hydrated = $state(false);

export function isAuthenticated(): boolean {
	return authenticated;
}

export function getAuthRole(): AuthRole | null {
	return role;
}

export function isAuthHydrated(): boolean {
	return hydrated;
}

export function getHomePathForRole(r: AuthRole): string {
	return r === 'client' ? '/client' : '/admin';
}

export function login(username: string, password: string): AuthRole | null {
	const trimmed = username.trim().toLowerCase();

	for (const [authRole, cred] of Object.entries(CREDENTIALS) as [AuthRole, typeof CREDENTIALS.admin][]) {
		if (trimmed === cred.username && password === cred.password) {
			if (typeof localStorage !== 'undefined') {
				localStorage.setItem(STORAGE_KEY, authRole);
			}
			authenticated = true;
			role = authRole;
			return authRole;
		}
	}

	return null;
}

export function logout(): void {
	if (typeof localStorage !== 'undefined') {
		localStorage.removeItem(STORAGE_KEY);
	}
	authenticated = false;
	role = null;
}

function parseStoredRole(value: string | null): AuthRole | null {
	if (value === 'admin' || value === 'client') return value;
	if (value === '1') return 'admin';
	return null;
}

export function hydrateAuth(): void {
	if (typeof localStorage !== 'undefined') {
		const stored = parseStoredRole(localStorage.getItem(STORAGE_KEY));
		if (stored) {
			authenticated = true;
			role = stored;
		} else {
			authenticated = false;
			role = null;
		}
	}
	hydrated = true;
}
