import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireFinancialProfile } from '$lib/auth/guards.server';
import { requireAdmin } from '$lib/auth/require-admin';
import { consultarFacturaElectronica, emitirFacturaElectronica } from '$lib/fe/emit.server';
import { parseMediosPagoFormValue } from '$lib/fe/medios-pago';
import {
	getFeEmisorConfigForEmit,
	getFeEmisorConfigsPublicBatch,
	isEmisorCredentialsComplete,
	isEmisorProfileComplete,
	mergeEmisorProfilePublic
} from '$lib/fe/emisor.server';
import { getEmitAmbiente } from '$lib/fe/hacienda-settings.server';
import { checkFacturadorConnection } from '$lib/fe/facturador.server';
import { fetchInvoiceListPage, parseInvoiceListQuery } from '$lib/lab/invoices-list.server';

export const load: PageServerLoad = async ({ parent, url, depends }) => {
	depends('app:facturas-list');
	const { profile } = await parent();
	requireFinancialProfile(profile);

	const listQuery = parseInvoiceListQuery(url.searchParams);

	const [list, emitAmbiente, { staging, production }, facturador] = await Promise.all([
		fetchInvoiceListPage(listQuery),
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
		...list,
		hasActiveEmisor: Boolean(activeEmisor) && emitConfigReady,
		emitAmbiente,
		emitConfigReady,
		facturadorOk: facturador.ok,
		facturadorUrl: facturador.url,
		facturadorError: facturador.error
	};
};

export const actions: Actions = {
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
				return fail(400, { message, invoiceId });
			}
			const result = await emitirFacturaElectronica(invoiceId, { mediosPago });
			return { success: true, message: result.message, invoiceId, clave: result.clave };
		} catch (err) {
			const message = err instanceof Error ? err.message : 'No se pudo emitir.';
			return fail(400, { message, invoiceId });
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
			return { success: true, message: result.message, invoiceId, feEstado: result.estado };
		} catch (err) {
			const message = err instanceof Error ? err.message : 'No se pudo consultar.';
			return fail(400, { message, invoiceId });
		}
	}
};
