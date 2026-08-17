import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireFinancialProfile } from '$lib/auth/guards.server';
import { requireAdmin } from '$lib/auth/require-admin';
import { consultarFacturaElectronica, emitirFacturaElectronica } from '$lib/fe/emit.server';
import { parseMediosPagoFormValue } from '$lib/fe/medios-pago';
import {
	getFeEmisorConfigForEmit,
	getFeEmisorConfigPublicByAmbiente,
	isEmisorCredentialsComplete,
	isEmisorProfileComplete,
	mergeEmisorProfilePublic
} from '$lib/fe/emisor.server';
import { getEmitAmbiente } from '$lib/fe/hacienda-settings.server';
import { checkFacturadorConnection } from '$lib/fe/facturador.server';
import type { FeComprobanteSummary } from '$lib/fe/types';
import { createSupabaseAdminClient } from '$lib/supabase/admin';

export const load: PageServerLoad = async ({ parent }) => {
	const { profile } = await parent();
	requireFinancialProfile(profile);

	const emitAmbiente = await getEmitAmbiente();
	const [staging, production] = await Promise.all([
		getFeEmisorConfigPublicByAmbiente('staging'),
		getFeEmisorConfigPublicByAmbiente('production')
	]);
	const sharedProfile = mergeEmisorProfilePublic(staging, production);
	const profileComplete = isEmisorProfileComplete(sharedProfile);
	const emitPublic = emitAmbiente === 'production' ? production : staging;
	const emitConfigReady =
		profileComplete && isEmisorCredentialsComplete(emitPublic);
	const activeEmisor = emitConfigReady ? await getFeEmisorConfigForEmit() : null;
	const facturador = await checkFacturadorConnection();
	const admin = createSupabaseAdminClient();
	const { data: feRows, error } = await admin
		.from('fe_comprobantes')
		.select(
			'id, invoice_id, clave, consecutivo, estado, hacienda_status, ultimo_error, enviado_at, resuelto_at'
		)
		.eq('tipo_documento', '01')
		.not('invoice_id', 'is', null);

	if (error) throw error;

	const feByInvoice: Record<string, FeComprobanteSummary> = {};
	for (const row of feRows ?? []) {
		if (row.invoice_id) {
			feByInvoice[row.invoice_id] = {
				id: row.id,
				invoice_id: row.invoice_id,
				clave: row.clave,
				consecutivo: row.consecutivo,
				estado: row.estado,
				hacienda_status: row.hacienda_status,
				ultimo_error: row.ultimo_error,
				enviado_at: row.enviado_at,
				resuelto_at: row.resuelto_at
			};
		}
	}

	return {
		hasActiveEmisor: Boolean(activeEmisor) && emitConfigReady,
		emitAmbiente,
		emitConfigReady,
		facturadorOk: facturador.ok,
		facturadorUrl: facturador.url,
		facturadorError: facturador.error,
		feByInvoice
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
