import { fail, isRedirect, redirect } from '@sveltejs/kit';
import { createPortalClientUser } from '$lib/auth/create-portal-user';
import { requireStaff } from '$lib/auth/require-staff';
import { createSupabaseAdminClient } from '$lib/supabase/admin';
import type { Actions } from './$types';

export const actions: Actions = {
	create: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		const gate = await requireStaff(supabase, user?.id, 'No tienes permiso para crear clientes.');
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

		const fe_tipo_identificacion = String(form.get('fe_tipo_identificacion') ?? '').trim();
		const fe_numero_identificacion = String(form.get('fe_numero_identificacion') ?? '').trim();
		const fe_codigo_actividad = String(form.get('fe_codigo_actividad') ?? '').trim();

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

			if (fe_tipo_identificacion || fe_numero_identificacion || fe_codigo_actividad) {
				if (!fe_tipo_identificacion || !fe_numero_identificacion) {
					return fail(400, {
						message:
							'Para datos fiscales al crear, indique tipo y número de identificación, o déjelos vacíos.'
					});
				}
				const { error: feError } = await admin
					.from('clients')
					.update({
						fe_tipo_identificacion,
						fe_numero_identificacion,
						fe_codigo_actividad: fe_codigo_actividad || null
					})
					.eq('id', client.id);
				if (feError) return fail(400, { message: feError.message });
			}

			redirect(303, `/admin/clientes/${client.id}?created=1`);
		} catch (err) {
			if (isRedirect(err)) throw err;
			const message = err instanceof Error ? err.message : 'No se pudo crear el cliente.';
			return fail(400, { message });
		}
	}
};
