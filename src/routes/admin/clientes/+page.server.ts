import { fail, isRedirect, redirect } from '@sveltejs/kit';
import { createPortalClientUser } from '$lib/auth/create-portal-user';
import { requireAdmin } from '$lib/auth/require-admin';
import { createSupabaseAdminClient } from '$lib/supabase/admin';
import type { Actions } from './$types';

export const actions: Actions = {
	create: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		const gate = await requireAdmin(supabase, user?.id, 'No tienes permiso para crear clientes.');
		if (!gate.ok) {
			return fail(gate.status, { message: gate.message });
		}

		const form = await request.formData();
		const email = String(form.get('email') ?? '');
		const password = String(form.get('password') ?? '');
		const passwordConfirm = String(form.get('passwordConfirm') ?? '');
		const nombre = String(form.get('nombre') ?? '');
		const clinica = String(form.get('clinica') ?? '');
		const telefono = String(form.get('telefono') ?? '');

		try {
			const admin = createSupabaseAdminClient();
			const client = await createPortalClientUser(admin, {
				email,
				password,
				passwordConfirm,
				nombre,
				clinica,
				telefono
			});
			redirect(303, `/admin/clientes/${client.id}?created=1`);
		} catch (err) {
			if (isRedirect(err)) throw err;
			const message = err instanceof Error ? err.message : 'No se pudo crear el cliente.';
			return fail(400, { message });
		}
	}
};
