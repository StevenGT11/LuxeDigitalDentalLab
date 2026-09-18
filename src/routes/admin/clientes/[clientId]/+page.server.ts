import { fail, isRedirect, redirect } from '@sveltejs/kit';
import { deletePortalClient } from '$lib/auth/delete-portal-user';
import { requireAdmin } from '$lib/auth/require-admin';
import { requireStaff } from '$lib/auth/require-staff';
import { updatePortalClientCredentials } from '$lib/auth/update-portal-user';
import { canViewFinancial } from '$lib/auth/roles';
import {
	clientFeAddressRowToForm,
	parseClientFeAddressFromForm
} from '$lib/fe/client-fiscal-address';
import {
	validateClientTelefono,
	validateFeNumeroIdentificacion
} from '$lib/fe/client-fiscal-validation';
import { invalidFeCorreos, normalizeFeCorreos } from '$lib/fe/fe-correos';
import { loadFeEmitPanelContext } from '$lib/fe/emit-panel-context.server';
import { parseFeMonedaEmitForm } from '$lib/fe/fe-moneda';
import { parseMediosPagoFormValue } from '$lib/fe/medios-pago';
import { fetchInvoicesByClientId } from '$lib/lab/invoices-list.server';
import { createSupabaseAdminClient } from '$lib/supabase/admin';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, parent, depends }) => {
	depends('app:client-invoices');
	const { profile } = await parent();

	if (!canViewFinancial(profile?.role)) {
		return { fiscal: null, clientInvoices: [], hasActiveEmisor: false, facturadorOk: false };
	}

	const clientId = params.clientId;
	if (!clientId) {
		return { fiscal: null, clientInvoices: [], hasActiveEmisor: false, facturadorOk: false };
	}

	const admin = createSupabaseAdminClient();
	const emit = await loadFeEmitPanelContext();
	const [{ data, error }, clientInvoices] = await Promise.all([
		admin
			.from('clients')
			.select(
				'telefono, fe_tipo_identificacion, fe_numero_identificacion, fe_codigo_actividad, fe_correo_facturacion, fe_provincia, fe_canton, fe_distrito, fe_otras_senas'
			)
			.eq('id', clientId)
			.maybeSingle(),
		fetchInvoicesByClientId(clientId, emit.emitAmbiente)
	]);

	if (error) throw error;

	return {
		fiscal: {
			fe_tipo_identificacion: data?.fe_tipo_identificacion ?? '',
			fe_numero_identificacion: data?.fe_numero_identificacion ?? '',
			fe_codigo_actividad: data?.fe_codigo_actividad ?? '',
			fe_correo_facturacion: data?.fe_correo_facturacion ?? '',
			telefono: data?.telefono ?? '',
			...clientFeAddressRowToForm(data)
		},
		clientInvoices,
		...emit
	};
};

export const actions: Actions = {
	saveFiscal: async ({ params, request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		const gate = await requireAdmin(supabase, user?.id, 'Solo administradores pueden editar datos fiscales.');
		if (!gate.ok) return fail(gate.status, { message: gate.message, kind: 'fiscal' as const });

		const clientId = params.clientId;
		if (!clientId) return fail(400, { message: 'Cliente no válido.', kind: 'fiscal' as const });

		const form = await request.formData();
		const fe_tipo_identificacion = String(form.get('fe_tipo_identificacion') ?? '').trim();
		const fe_numero_identificacion = String(form.get('fe_numero_identificacion') ?? '').trim();
		const fe_codigo_actividad = String(form.get('fe_codigo_actividad') ?? '').trim();
		const fe_correo_raw = String(form.get('fe_correo_facturacion') ?? '').trim();
		const invalidCorreos = invalidFeCorreos(fe_correo_raw);
		if (invalidCorreos.length) {
			return fail(400, {
				message: `Correo inválido: ${invalidCorreos.join(', ')}`,
				kind: 'fiscal' as const
			});
		}
		const fe_correo_facturacion = normalizeFeCorreos(fe_correo_raw);

		const idCheck = validateFeNumeroIdentificacion(fe_tipo_identificacion, fe_numero_identificacion);
		if (!idCheck.ok) {
			return fail(400, { message: idCheck.message, kind: 'fiscal' as const });
		}

		const telefonoRaw = String(form.get('telefono') ?? '').trim();
		const telCheck = validateClientTelefono(telefonoRaw);
		if (!telCheck.ok) {
			return fail(400, { message: telCheck.message, kind: 'fiscal' as const });
		}

		let feAddress;
		try {
			feAddress = parseClientFeAddressFromForm(form);
		} catch (err) {
			return fail(400, {
				message: err instanceof Error ? err.message : 'Dirección fiscal inválida.',
				kind: 'fiscal' as const
			});
		}

		const admin = createSupabaseAdminClient();
		const { error } = await admin
			.from('clients')
			.update({
				fe_tipo_identificacion,
				fe_numero_identificacion: idCheck.normalized,
				fe_codigo_actividad: fe_codigo_actividad || null,
				fe_correo_facturacion,
				telefono: telCheck.normalized || null,
				fe_provincia: feAddress.fe_provincia,
				fe_canton: feAddress.fe_canton || null,
				fe_distrito: feAddress.fe_distrito || null,
				fe_otras_senas: feAddress.fe_otras_senas || null
			})
			.eq('id', clientId);

		if (error) return fail(400, { message: error.message, kind: 'fiscal' as const });

		return { success: true, message: 'Datos fiscales guardados.', kind: 'fiscal' as const };
	},

	updateCredentials: async ({ params, request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		const gate = await requireStaff(
			supabase,
			user?.id,
			'Solo el equipo puede cambiar el acceso del cliente.'
		);
		if (!gate.ok) return fail(gate.status, { message: gate.message, kind: 'credentials' as const });

		const clientId = params.clientId;
		if (!clientId) return fail(400, { message: 'Cliente no válido.', kind: 'credentials' as const });

		const form = await request.formData();
		try {
			const admin = createSupabaseAdminClient();
			const result = await updatePortalClientCredentials(admin, clientId, {
				email: String(form.get('email') ?? ''),
				password: String(form.get('password') ?? ''),
				passwordConfirm: String(form.get('passwordConfirm') ?? '')
			});
			const parts = [
				result.changedEmail ? 'correo de acceso' : null,
				result.changedPassword ? 'contraseña' : null
			].filter(Boolean);
			return {
				success: true,
				kind: 'credentials' as const,
				email: result.email,
				message: `Se actualizó ${parts.join(' y ')} del portal.`
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : 'No se pudo actualizar el acceso.';
			return fail(400, { message, kind: 'credentials' as const });
		}
	},

	emitir: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		const gate = await requireAdmin(
			supabase,
			user?.id,
			'Solo administradores pueden emitir factura electrónica.'
		);
		if (!gate.ok) return fail(gate.status, { message: gate.message });

		const form = await request.formData();
		const invoiceId = String(form.get('invoice_id') ?? '').trim();
		if (!invoiceId) return fail(400, { message: 'Factura no válida.' });

		try {
			let mediosPago;
			let monedaEmit;
			try {
				mediosPago = parseMediosPagoFormValue(form.get('medios_pago'));
				monedaEmit = parseFeMonedaEmitForm(form);
			} catch (parseErr) {
				const message = parseErr instanceof Error ? parseErr.message : 'Medios de pago inválidos.';
				return fail(400, { message, invoiceId });
			}
			const result = await emitirYConsultarFacturaElectronica(invoiceId, {
				mediosPago,
				...monedaEmit
			});
			return {
				success: true,
				message: result.message,
				invoiceId,
				clave: result.clave,
				feEstado: result.feEstado,
				consultaPending: result.consultaPending ?? false
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : 'No se pudo emitir.';
			return fail(400, { message, invoiceId });
		}
	},

	consultar: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		const gate = await requireAdmin(
			supabase,
			user?.id,
			'Solo administradores pueden consultar Hacienda.'
		);
		if (!gate.ok) return fail(gate.status, { message: gate.message });

		const form = await request.formData();
		const invoiceId = String(form.get('invoice_id') ?? '').trim();
		if (!invoiceId) return fail(400, { message: 'Factura no válida.' });

		try {
			const result = await consultarFacturaElectronica(invoiceId);
			return { success: true, message: result.message, invoiceId, feEstado: result.estado };
		} catch (err) {
			const message = err instanceof Error ? err.message : 'No se pudo consultar.';
			return fail(400, { message, invoiceId });
		}
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
