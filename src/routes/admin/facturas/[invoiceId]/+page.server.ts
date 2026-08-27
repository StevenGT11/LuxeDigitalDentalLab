import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireFinancialProfile } from '$lib/auth/guards.server';
import { requireAdmin } from '$lib/auth/require-admin';
import { canViewFinancial } from '$lib/auth/roles';
import { consultarFacturaElectronica, emitirYConsultarFacturaElectronica } from '$lib/fe/emit.server';
import { parseMediosPagoFormValue } from '$lib/fe/medios-pago';
import { reconcileInvoiceAmounts, updateInvoiceLinePrices } from '$lib/lab/invoice-detail.server';
import { updateInvoiceStatusInDb } from '$lib/lab/invoices-db';

/** Solo auth/redirect; datos vía GET /api/admin/facturas/:id (+page.ts). */
export const load: PageServerLoad = async ({ parent }) => {
	const { profile } = await parent();
	requireFinancialProfile(profile);
	return {};
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

	updateLineas: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: 'Debe iniciar sesión.' });

		const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
		if (!canViewFinancial(profile?.role)) {
			return fail(403, { message: 'Sin permiso para editar facturas.' });
		}

		const form = await request.formData();
		const invoiceId = String(form.get('invoice_id') ?? '').trim();
		const raw = String(form.get('lineas_json') ?? '').trim();
		if (!invoiceId || !raw) return fail(400, { message: 'Datos inválidos.' });

		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			return fail(400, { message: 'Formato de líneas inválido.' });
		}

		if (!Array.isArray(parsed)) return fail(400, { message: 'Formato de líneas inválido.' });

		const updates: { lineId: string; precio_unitario: number }[] = [];
		for (const row of parsed) {
			if (!row || typeof row !== 'object') continue;
			const lineId = String((row as { lineId?: unknown }).lineId ?? '').trim();
			const precio = Number((row as { precio_unitario?: unknown }).precio_unitario);
			if (!lineId || !Number.isFinite(precio)) continue;
			updates.push({ lineId, precio_unitario: precio });
		}

		if (updates.length === 0) return fail(400, { message: 'No hay líneas para actualizar.' });

		try {
			await updateInvoiceLinePrices(invoiceId, updates);
			return { success: true, message: 'Líneas y totales actualizados.' };
		} catch (err) {
			return fail(400, { message: err instanceof Error ? err.message : 'No se pudo guardar.' });
		}
	},

	reconciliarMontos: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: 'Debe iniciar sesión.' });

		const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
		if (!canViewFinancial(profile?.role)) {
			return fail(403, { message: 'Sin permiso para editar facturas.' });
		}

		const form = await request.formData();
		const invoiceId = String(form.get('invoice_id') ?? '').trim();
		if (!invoiceId) return fail(400, { message: 'Factura no válida.' });

		const { data: feRow } = await supabase
			.from('fe_comprobantes')
			.select('estado')
			.eq('invoice_id', invoiceId)
			.eq('tipo_documento', '01')
			.maybeSingle();
		if (feRow?.estado === 'aceptado') {
			return fail(400, { message: 'No se pueden corregir montos de una FE aceptada.' });
		}

		try {
			const result = await reconcileInvoiceAmounts(invoiceId);
			const detail =
				result.linesUpdated > 0
					? `${result.linesUpdated} línea(s) corregida(s).`
					: 'Totales del encabezado sincronizados.';
			return {
				success: true,
				message: `Montos actualizados. ${detail} Nuevo total: ${result.total.toFixed(2)}.`
			};
		} catch (err) {
			return fail(400, { message: err instanceof Error ? err.message : 'No se pudo corregir.' });
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
			const result = await emitirYConsultarFacturaElectronica(invoiceId, { mediosPago });
			return {
				success: true,
				message: result.message,
				clave: result.clave,
				feEstado: result.feEstado,
				consultaPending: result.consultaPending ?? false
			};
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
