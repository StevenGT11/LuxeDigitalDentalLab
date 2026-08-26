import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireFinancialProfile } from '$lib/auth/guards.server';
import { requireAdmin } from '$lib/auth/require-admin';
import { canViewFinancial } from '$lib/auth/roles';
import { consultarFacturaElectronica, emitirFacturaElectronica } from '$lib/fe/emit.server';
import { parseMediosPagoFormValue } from '$lib/fe/medios-pago';
import {
	getFeEmisorConfigForEmit,
	getFeEmisorConfigsPublicBatch,
	isEmisorCredentialsComplete,
	isEmisorProfileComplete,
	mergeEmisorProfilePublic
} from '$lib/fe/emisor.server';
import { checkFacturadorConnection } from '$lib/fe/facturador.server';
import { getEmitAmbiente } from '$lib/fe/hacienda-settings.server';
import { loadInvoiceDetailPage } from '$lib/lab/invoice-detail.server';
import { updateInvoiceStatusInDb } from '$lib/lab/invoices-db';

export const load: PageServerLoad = async ({ params, parent }) => {
	const { profile } = await parent();
	requireFinancialProfile(profile);

	const invoiceId = params.invoiceId;
	if (!invoiceId) error(404, 'Factura no encontrada');

	const detail = await loadInvoiceDetailPage(invoiceId);
	if (!detail) error(404, 'Factura no encontrada');

	const [emitAmbiente, { staging, production }, facturador] = await Promise.all([
		getEmitAmbiente(),
		getFeEmisorConfigsPublicBatch(),
		checkFacturadorConnection()
	]);
	const sharedProfile = mergeEmisorProfilePublic(staging, production);
	const profileComplete = isEmisorProfileComplete(sharedProfile);
	const emitPublic = emitAmbiente === 'production' ? production : staging;
	const emitConfigReady = profileComplete && isEmisorCredentialsComplete(emitPublic);
	const activeEmisor = emitConfigReady ? await getFeEmisorConfigForEmit() : null;

	return {
		...detail,
		emitAmbiente,
		emitConfigReady,
		hasActiveEmisor: Boolean(activeEmisor) && emitConfigReady,
		facturadorOk: facturador.ok,
		facturadorUrl: facturador.url,
		facturadorError: facturador.error
	};
};

export const actions: Actions = {
	updateEstado: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: 'Debe iniciar sesión.' });

		const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
		if (!canViewFinancial(profile?.role)) {
			return fail(403, { message: 'Sin permiso para cambiar el estado de cobro.' });
		}

		const form = await request.formData();
		const invoiceId = String(form.get('invoice_id') ?? '').trim();
		const estado = String(form.get('estado') ?? '').trim();
		if (!invoiceId || !estado) return fail(400, { message: 'Datos inválidos.' });

		try {
			await updateInvoiceStatusInDb(invoiceId, estado as import('$lib/lab/types').InvoiceEstado);
			return { success: true, message: 'Estado de cobro actualizado.' };
		} catch (err) {
			return fail(400, { message: err instanceof Error ? err.message : 'No se pudo actualizar.' });
		}
	},

	emitir: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		const gate = await requireAdmin(supabase, user?.id, 'Solo administradores pueden emitir factura electrónica.');
		if (!gate.ok) return fail(gate.status, { message: gate.message });

		const form = await request.formData();
		const invoiceId = String(form.get('invoice_id') ?? '').trim();
		if (!invoiceId) return fail(400, { message: 'Factura no válida.' });

		try {
			let mediosPago;
			try {
				mediosPago = parseMediosPagoFormValue(form.get('medios_pago'));
			} catch (parseErr) {
				const message = parseErr instanceof Error ? parseErr.message : 'Medios de pago inválidos.';
				return fail(400, { message });
			}
			const result = await emitirFacturaElectronica(invoiceId, { mediosPago });
			return { success: true, message: result.message, clave: result.clave };
		} catch (err) {
			return fail(400, { message: err instanceof Error ? err.message : 'No se pudo emitir.' });
		}
	},

	consultar: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		const gate = await requireAdmin(supabase, user?.id, 'Solo administradores pueden consultar Hacienda.');
		if (!gate.ok) return fail(gate.status, { message: gate.message });

		const form = await request.formData();
		const invoiceId = String(form.get('invoice_id') ?? '').trim();
		if (!invoiceId) return fail(400, { message: 'Factura no válida.' });

		try {
			const result = await consultarFacturaElectronica(invoiceId);
			return { success: true, message: result.message, feEstado: result.estado };
		} catch (err) {
			return fail(400, { message: err instanceof Error ? err.message : 'No se pudo consultar.' });
		}
	}
};
