import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireFinancialProfile } from '$lib/auth/guards.server';
import { requireAdmin } from '$lib/auth/require-admin';
import { loadFeEmitPanelContext } from '$lib/fe/emit-panel-context.server';
import {
	fetchFeRecibidosList,
	insertFeRecibidoFromXml,
	isFeRecibidosSchemaMissing
} from '$lib/fe/fe-recibidos.server';
import { getEmitAmbiente } from '$lib/fe/hacienda-settings.server';
import {
	consultarMensajeReceptorParaRecibido,
	enviarMensajeReceptorParaRecibido,
	parseMensajeAction
} from '$lib/fe/mensaje-receptor.server';

export const load: PageServerLoad = async ({ parent, depends }) => {
	depends('app:facturas-recibidas');
	const { profile } = await parent();
	requireFinancialProfile(profile);

	const emit = await loadFeEmitPanelContext();

	try {
		const items = await fetchFeRecibidosList();
		return { items, schemaReady: true as const, schemaMessage: null, ...emit };
	} catch (err) {
		if (isFeRecibidosSchemaMissing(err)) {
			return {
				items: [],
				schemaReady: false as const,
				schemaMessage:
					'Faltan las tablas de gastos recibidos en Supabase. Ejecute la migración 20260729200000_fe_recibidos_mensaje_receptor.sql (Dashboard → SQL o supabase db push).',
				...emit
			};
		}
		throw err;
	}
};

export const actions: Actions = {
	subirXml: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		const gate = await requireAdmin(
			supabase,
			user?.id,
			'Solo administradores pueden registrar comprobantes recibidos.'
		);
		if (!gate.ok) return fail(gate.status, { message: gate.message });

		const form = await request.formData();
		const file = form.get('xml_file');
		if (!(file instanceof File) || file.size === 0) {
			return fail(400, { message: 'Seleccione un archivo XML.' });
		}
		if (file.size > 2_000_000) {
			return fail(400, { message: 'El XML es demasiado grande (máx. 2 MB).' });
		}

		const name = file.name.toLowerCase();
		if (!name.endsWith('.xml')) {
			return fail(400, { message: 'El archivo debe ser .xml' });
		}

		try {
			const xmlRaw = await file.text();
			const ambiente = await getEmitAmbiente();
			const { parsed } = await insertFeRecibidoFromXml(xmlRaw, ambiente);
			return {
				success: true,
				message: `Comprobante registrado (${parsed.emisor_nombre || parsed.emisor_numero_identificacion}).`,
				recibidoId: parsed.clave
			};
		} catch (err) {
			return fail(400, {
				message: err instanceof Error ? err.message : 'No se pudo registrar el XML.'
			});
		}
	},

	responder: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		const gate = await requireAdmin(
			supabase,
			user?.id,
			'Solo administradores pueden aceptar o rechazar comprobantes.'
		);
		if (!gate.ok) return fail(gate.status, { message: gate.message });

		const form = await request.formData();
		const feRecibidoId = String(form.get('fe_recibido_id') ?? '').trim();
		const mensaje = parseMensajeAction(String(form.get('mensaje') ?? 'aceptado'));
		const detalle = String(form.get('detalle_mensaje') ?? '').trim();

		if (!feRecibidoId) return fail(400, { message: 'Comprobante no válido.' });

		try {
			const result = await enviarMensajeReceptorParaRecibido(feRecibidoId, mensaje, detalle);
			return {
				success: true,
				message: result.message,
				feRecibidoId,
				feEstado: result.feEstado
			};
		} catch (err) {
			return fail(400, {
				message: err instanceof Error ? err.message : 'No se pudo enviar la confirmación.',
				feRecibidoId
			});
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
		const feRecibidoId = String(form.get('fe_recibido_id') ?? '').trim();
		if (!feRecibidoId) return fail(400, { message: 'Comprobante no válido.' });

		try {
			const result = await consultarMensajeReceptorParaRecibido(feRecibidoId);
			return {
				success: true,
				message: result.message,
				feRecibidoId,
				feEstado: result.feEstado
			};
		} catch (err) {
			return fail(400, {
				message: err instanceof Error ? err.message : 'No se pudo consultar.',
				feRecibidoId
			});
		}
	}
};
