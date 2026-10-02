import { fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/auth/require-admin';
import { deleteLabCaseAsAdmin } from '$lib/lab/delete-case.server';
import type { Actions } from './$types';

export const actions: Actions = {
	delete: async ({ params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		const gate = await requireAdmin(supabase, user?.id, 'Solo administradores pueden eliminar casos.');
		if (!gate.ok) return fail(gate.status, { message: gate.message });

		const caseId = params.caseId;
		if (!caseId) return fail(400, { message: 'Caso no válido.' });

		try {
			await deleteLabCaseAsAdmin(caseId);
			return { success: true, deletedCaseId: caseId };
		} catch (err) {
			const message = err instanceof Error ? err.message : 'No se pudo eliminar el caso.';
			return fail(400, { message });
		}
	}
};
