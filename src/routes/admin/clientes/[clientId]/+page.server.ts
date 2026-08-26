import { fail, isRedirect, redirect } from '@sveltejs/kit';
import { deletePortalClient } from '$lib/auth/delete-portal-user';
import { requireAdmin } from '$lib/auth/require-admin';
import { canViewFinancial } from '$lib/auth/roles';
import { createSupabaseAdminClient } from '$lib/supabase/admin';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, parent }) => {
	const { profile } = await parent();

	if (!canViewFinancial(profile?.role)) {
		return { fiscal: null };
	}

	const clientId = params.clientId;
	if (!clientId) return { fiscal: null };

	const admin = createSupabaseAdminClient();
	const { data, error } = await admin
		.from('clients')
		.select(
			'fe_tipo_identificacion, fe_numero_identificacion, fe_codigo_actividad, fe_correo_facturacion'
		)
		.eq('id', clientId)
		.maybeSingle();

	if (error) throw error;

	return {
		fiscal: {
			fe_tipo_identificacion: data?.fe_tipo_identificacion ?? '',
			fe_numero_identificacion: data?.fe_numero_identificacion ?? '',
			fe_codigo_actividad: data?.fe_codigo_actividad ?? '',
			fe_correo_facturacion: data?.fe_correo_facturacion ?? ''
		}
	};
};

export const actions: Actions = {
	saveFiscal: async ({ params, request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		const gate = await requireAdmin(supabase, user?.id, 'Solo administradores pueden editar datos fiscales.');
		if (!gate.ok) return fail(gate.status, { message: gate.message });

		const clientId = params.clientId;
		if (!clientId) return fail(400, { message: 'Cliente no válido.' });

		const form = await request.formData();
		const fe_tipo_identificacion = String(form.get('fe_tipo_identificacion') ?? '').trim();
		const fe_numero_identificacion = String(form.get('fe_numero_identificacion') ?? '').trim();
		const fe_codigo_actividad = String(form.get('fe_codigo_actividad') ?? '').trim();
		const fe_correo_facturacion = String(form.get('fe_correo_facturacion') ?? '').trim();

		if (!fe_tipo_identificacion || !fe_numero_identificacion) {
			return fail(400, { message: 'Tipo y número de identificación son requeridos.' });
		}

		const admin = createSupabaseAdminClient();
		const { error } = await admin
			.from('clients')
			.update({
				fe_tipo_identificacion,
				fe_numero_identificacion,
				fe_codigo_actividad: fe_codigo_actividad || null,
				fe_correo_facturacion: fe_correo_facturacion || null
			})
			.eq('id', clientId);

		if (error) return fail(400, { message: error.message });

		return { success: true, message: 'Datos fiscales guardados.' };
	},

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
