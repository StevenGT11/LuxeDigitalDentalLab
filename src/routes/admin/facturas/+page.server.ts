import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireFinancialProfile } from '$lib/auth/guards.server';
import { requireAdmin } from '$lib/auth/require-admin';
import { canViewFinancial } from '$lib/auth/roles';
import { consultarFacturaElectronica, emitirYConsultarFacturaElectronica } from '$lib/fe/emit.server';
import { loadFeEmitPanelContext } from '$lib/fe/emit-panel-context.server';
import { parseMediosPagoFormValue } from '$lib/fe/medios-pago';
import { fetchInvoiceListPage, parseInvoiceListQuery } from '$lib/lab/invoices-list.server';
import { updateInvoiceStatusInDb } from '$lib/lab/invoices-db';
import type { InvoiceEstado } from '$lib/lab/types';

/** Una carga: facturas paginadas + flags FE (sin hop extra a /api). */
export const load: PageServerLoad = async ({ parent, url, depends }) => {
	depends('app:facturas-list');
	const { profile } = await parent();
	requireFinancialProfile(profile);

	const listQuery = parseInvoiceListQuery(url.searchParams);
	const [list, emit] = await Promise.all([
		fetchInvoiceListPage(listQuery),
		loadFeEmitPanelContext()
	]);

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
			await updateInvoiceStatusInDb(invoiceId, estado as InvoiceEstado);
			return { success: true, message: 'Estado de cobro actualizado.', invoiceId };
		} catch (err) {
			return fail(400, { message: err instanceof Error ? err.message : 'No se pudo actualizar.', invoiceId });
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
				return fail(400, { message, invoiceId });
			}
			const result = await emitirYConsultarFacturaElectronica(invoiceId, { mediosPago });
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
