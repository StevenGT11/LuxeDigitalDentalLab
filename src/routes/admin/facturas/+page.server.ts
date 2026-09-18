import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireFinancialProfile } from '$lib/auth/guards.server';
import { requireAdmin } from '$lib/auth/require-admin';
import { canViewFinancial } from '$lib/auth/roles';
import { consultarFacturaElectronica } from '$lib/fe/emit.server';
import { getEmitAmbiente } from '$lib/fe/hacienda-settings.server';
import { loadFeEmitPanelContext } from '$lib/fe/emit-panel-context.server';
import {
	duplicateInvoiceForCorrection,
	findCorrectionInvoiceForSource
} from '$lib/lab/invoice-detail.server';
import { hasAcceptedNotaCreditoForInvoice } from '$lib/fe/comprobantes.server';
import { fetchInvoiceListPage, parseInvoiceListQuery } from '$lib/lab/invoices-list.server';
import { updateInvoiceStatusServer } from '$lib/lab/invoice-status.server';

/** Una carga: facturas paginadas + flags FE (sin hop extra a /api). */
export const load: PageServerLoad = async ({ parent, url, depends }) => {
	depends('app:facturas-list');
	const { profile } = await parent();
	requireFinancialProfile(profile);

	const listQuery = parseInvoiceListQuery(url.searchParams);
	const emit = await loadFeEmitPanelContext();
	const list = await fetchInvoiceListPage(listQuery, emit.emitAmbiente);

	return { ...list, ...emit };
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
			await updateInvoiceStatusServer(invoiceId, estado);
			return { success: true, message: 'Estado de cobro actualizado.', invoiceId };
		} catch (err) {
			return fail(400, { message: err instanceof Error ? err.message : 'No se pudo actualizar.', invoiceId });
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
	},

	crearFacturaCorreccion: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		const gate = await requireAdmin(
			supabase,
			user?.id,
			'Solo administradores pueden crear facturas corregidas.'
		);
		if (!gate.ok) return fail(gate.status, { message: gate.message });

		const form = await request.formData();
		const invoiceId = String(form.get('invoice_id') ?? '').trim();
		if (!invoiceId) return fail(400, { message: 'Factura no válida.' });

		try {
			const emitAmbiente = await getEmitAmbiente();
			const ncOk = await hasAcceptedNotaCreditoForInvoice(invoiceId, emitAmbiente);
			if (!ncOk) {
				return fail(400, {
					message:
						'Requiere una nota de crédito aceptada por Hacienda en esta factura antes de reemitir.',
					invoiceId
				});
			}
			const existing = await findCorrectionInvoiceForSource(invoiceId);
			if (existing) {
				return {
					success: true,
					message: `Ya existe la factura corregida ${existing.invoice_number}.`,
					invoiceId,
					redirectTo: `/admin/facturas/${existing.id}`
				};
			}
			const copy = await duplicateInvoiceForCorrection(invoiceId);
			return {
				success: true,
				message: `Se creó la factura ${copy.invoice_number} para emitir FE corregida.`,
				invoiceId,
				redirectTo: `/admin/facturas/${copy.id}`
			};
		} catch (err) {
			return fail(400, {
				message: err instanceof Error ? err.message : 'No se pudo crear la factura corregida.',
				invoiceId
			});
		}
	}
};
