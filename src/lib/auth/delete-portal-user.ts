import type { SupabaseClient } from '@supabase/supabase-js';

export type DeletePortalClientResult = {
	mode: 'full' | 'access_revoked' | 'deactivated';
	caseCount: number;
};

async function countClientCases(admin: SupabaseClient, clientId: string): Promise<number> {
	const { count, error } = await admin
		.from('cases')
		.select('id', { count: 'exact', head: true })
		.eq('client_id', clientId);

	if (error) throw error;
	return count ?? 0;
}

async function deleteAuthUser(admin: SupabaseClient, userId: string): Promise<void> {
	const { data: profile, error: profileError } = await admin
		.from('profiles')
		.select('role')
		.eq('id', userId)
		.maybeSingle();

	if (profileError) throw profileError;
	if (profile?.role === 'admin') {
		throw new Error('No se puede eliminar un usuario administrador desde aquí.');
	}

	const { error } = await admin.auth.admin.deleteUser(userId);
	if (error) {
		const msg = error.message.toLowerCase();
		if (msg.includes('not found') || msg.includes('user not found')) return;
		throw new Error(error.message);
	}
}

/**
 * Sin casos: borra fila en clients (+ doctores) y usuario Auth.
 * Con casos: revoca login (borra Auth) y desactiva clients; conserva historial.
 */
export async function deletePortalClient(
	admin: SupabaseClient,
	clientId: string
): Promise<DeletePortalClientResult> {
	const { data: client, error: clientError } = await admin
		.from('clients')
		.select('id, profile_id, nombre')
		.eq('id', clientId)
		.maybeSingle();

	if (clientError) throw clientError;
	if (!client) throw new Error('Cliente no encontrado.');

	const caseCount = await countClientCases(admin, clientId);

	if (caseCount > 0) {
		if (client.profile_id) {
			await deleteAuthUser(admin, client.profile_id);
		}
		const { error: deactivateError } = await admin
			.from('clients')
			.update({ activo: false, profile_id: null })
			.eq('id', clientId);
		if (deactivateError) throw deactivateError;

		return {
			mode: client.profile_id ? 'access_revoked' : 'deactivated',
			caseCount
		};
	}

	const profileId = client.profile_id;

	const { error: deleteClientError } = await admin.from('clients').delete().eq('id', clientId);
	if (deleteClientError) throw deleteClientError;

	if (profileId) {
		await deleteAuthUser(admin, profileId);
	}

	return { mode: 'full', caseCount: 0 };
}
