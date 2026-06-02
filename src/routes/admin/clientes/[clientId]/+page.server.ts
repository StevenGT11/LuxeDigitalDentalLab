import { fail, isRedirect, redirect } from '@sveltejs/kit';
import { deletePortalClient } from '$lib/auth/delete-portal-user';
import { requireAdmin } from '$lib/auth/require-admin';
import { createSupabaseAdminClient } from '$lib/supabase/admin';
import type { Actions } from './$types';

export const actions: Actions = {
	delete: async ({ params, request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		const gate = await requireAdmin(supabase, user?.id, 'No tienes permiso para eliminar clientes.');
		if (!gate.ok) {
			return fail(gate.status, { message: gate.message });
		}

		const clientId = params.clientId;
		if (!clientId) {
			return fail(400, { message: 'Cliente no válido.' });
		}

		const form = await request.formData();
		if (form.get('confirm') !== 'yes') {
			return fail(400, { message: 'Debes confirmar la eliminación.' });
		}

		try {
			const admin = createSupabaseAdminClient();
			const result = await deletePortalClient(admin, clientId);
			const q =
				result.mode === 'full'
					? 'deleted=full'
					: result.mode === 'access_revoked'
						? 'deleted=access'
						: 'deleted=deactivated';
			redirect(303, `/admin/clientes?${q}`);
		} catch (err) {
			if (isRedirect(err)) throw err;
			const message = err instanceof Error ? err.message : 'No se pudo eliminar el cliente.';
			return fail(400, { message });
		}
	}
};
