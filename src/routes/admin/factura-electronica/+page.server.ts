import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireFinancialProfile } from '$lib/auth/guards.server';
import { requireAdmin } from '$lib/auth/require-admin';
import {
	getFeEmisorConfigById,
	getFeEmisorConfigsPublicBatch,
	isEmisorCredentialsComplete,
	isEmisorProfileComplete,
	mergeEmisorProfilePublic,
	upsertEmisorCredentials,
	upsertEmisorProfile
} from '$lib/fe/emisor.server';
import { fetchFeConsecutivosForConfigPage, setFeConsecutivosForAmbiente } from '$lib/fe/consecutivos.server';
import { FE_CONSECUTIVO_DOC_TYPES } from '$lib/fe/constants';
import { getEmitAmbiente, setEmitAmbiente } from '$lib/fe/hacienda-settings.server';
import type { FeAmbiente, FeEmisorCredentialsInput, FeEmisorProfileInput } from '$lib/fe/types';
import { createSupabaseAdminClient } from '$lib/supabase/admin';

export const load: PageServerLoad = async ({ parent, depends, locals: { supabase, safeGetSession } }) => {
	depends('app:fe-emisor');
	const { profile } = await parent();
	requireFinancialProfile(profile);

	let feServerReady = true;
	try {
		createSupabaseAdminClient();
	} catch {
		feServerReady = false;
	}

	const [{ user }, emitAmbiente, { staging, production }, consecutivos] = await Promise.all([
		safeGetSession(),
		getEmitAmbiente(),
		getFeEmisorConfigsPublicBatch(),
		fetchFeConsecutivosForConfigPage().catch(() => ({
			staging: { ambiente: 'staging' as const, counters: [] },
			production: { ambiente: 'production' as const, counters: [] }
		}))
	]);
	const adminGate = await requireAdmin(supabase, user?.id, '');

	const sharedProfile = mergeEmisorProfilePublic(staging, production);
	const profileComplete = isEmisorProfileComplete(sharedProfile);
	const stagingComplete = profileComplete && isEmisorCredentialsComplete(staging);
	const productionComplete = profileComplete && isEmisorCredentialsComplete(production);
	const emitConfigReady = emitAmbiente === 'production' ? productionComplete : stagingComplete;

	return {
		staging,
		production,
		consecutivos,
		sharedProfile,
		profileComplete,
		emitAmbiente,
		stagingComplete,
		productionComplete,
		emitConfigReady,
		canConfigureEmisor: adminGate.ok,
		feServerReady
	};
};

function parseProfile(formData: FormData): FeEmisorProfileInput {
	return {
		tipo_identificacion: String(formData.get('tipo_identificacion') ?? '02'),
		numero_identificacion: String(formData.get('numero_identificacion') ?? ''),
		razon_social: String(formData.get('razon_social') ?? ''),
		nombre_comercial: String(formData.get('nombre_comercial') ?? ''),
		codigo_actividad: String(formData.get('codigo_actividad') ?? ''),
		casa_matriz: String(formData.get('casa_matriz') ?? '001'),
		terminal: String(formData.get('terminal') ?? '00001'),
		provincia: Number(formData.get('provincia') ?? 1),
		canton: String(formData.get('canton') ?? '01'),
		distrito: String(formData.get('distrito') ?? '01'),
		otras_senas: String(formData.get('otras_senas') ?? ''),
		telefono: String(formData.get('telefono') ?? ''),
		correo_electronico: String(formData.get('correo_electronico') ?? '')
	};
}

function parseCredentials(formData: FormData): FeEmisorCredentialsInput {
	const id = String(formData.get('id') ?? '').trim() || undefined;
	const ambiente = String(formData.get('ambiente') ?? 'staging') as FeAmbiente;
	return {
		id,
		ambiente: ambiente === 'production' ? 'production' : 'staging',
		hacienda_usuario: String(formData.get('hacienda_usuario') ?? ''),
		hacienda_password: String(formData.get('hacienda_password') ?? '').trim() || undefined,
		pin_certificado: String(formData.get('pin_certificado') ?? '').trim() || undefined
	};
}

export const actions: Actions = {
	setEmitAmbiente: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		const gate = await requireAdmin(supabase, user?.id, 'Solo administradores pueden cambiar el ambiente.');
		if (!gate.ok) return fail(gate.status, { message: gate.message });

		const form = await request.formData();
		const raw = String(form.get('emit_ambiente') ?? 'staging');
		const emit_ambiente: FeAmbiente = raw === 'production' ? 'production' : 'staging';

		try {
			await setEmitAmbiente(emit_ambiente);
			const label = emit_ambiente === 'production' ? 'Producción' : 'Pruebas (staging)';
			return {
				success: true,
				message: `Ambiente de envío: ${label}.`,
				savedScope: 'emitAmbiente'
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : 'No se pudo cambiar el ambiente.';
			return fail(400, { message });
		}
	},

	saveProfile: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		const gate = await requireAdmin(supabase, user?.id, 'Solo administradores pueden configurar el emisor.');
		if (!gate.ok) return fail(gate.status, { message: gate.message });

		try {
			const formData = await request.formData();
			await upsertEmisorProfile(parseProfile(formData));
			return { success: true, message: 'Datos del emisor guardados (aplican a ambos ambientes).', savedScope: 'profile' };
		} catch (err) {
			const message = err instanceof Error ? err.message : 'No se pudo guardar.';
			return fail(400, { message });
		}
	},

	saveCredentials: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		const gate = await requireAdmin(supabase, user?.id, 'Solo administradores pueden configurar el emisor.');
		if (!gate.ok) return fail(gate.status, { message: gate.message });

		try {
			const formData = await request.formData();
			const p12File = formData.get('certificado_file');
			let input = parseCredentials(formData);

			if (p12File instanceof File && p12File.size > 0) {
				const buffer = Buffer.from(await p12File.arrayBuffer());
				input = { ...input, certificado_p12: buffer.toString('base64') };
			}

			await upsertEmisorCredentials(input);
			const label = input.ambiente === 'production' ? 'Producción' : 'Pruebas (staging)';
			return {
				success: true,
				message: `Credenciales de ${label} guardadas.`,
				savedScope: 'credentials',
				savedAmbiente: input.ambiente
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : 'No se pudo guardar.';
			return fail(400, { message });
		}
	},

	saveConsecutivos: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		const gate = await requireAdmin(
			supabase,
			user?.id,
			'Solo administradores pueden editar los consecutivos Hacienda.'
		);
		if (!gate.ok) return fail(gate.status, { message: gate.message });

		try {
			createSupabaseAdminClient();
		} catch {
			return fail(503, { message: 'Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.' });
		}

		const form = await request.formData();
		const rawAmbiente = String(form.get('ambiente') ?? 'staging');
		const ambiente: FeAmbiente = rawAmbiente === 'production' ? 'production' : 'staging';

		const values: Record<string, number> = {};
		for (const doc of FE_CONSECUTIVO_DOC_TYPES) {
			const raw = String(form.get(`consecutivo_${doc.tipo}`) ?? '').trim();
			if (!raw) {
				return fail(400, {
					message: `Indique el consecutivo actual para ${doc.label}.`,
					savedScope: 'consecutivos',
					savedAmbiente: ambiente
				});
			}
			const value = Number.parseInt(raw, 10);
			if (!Number.isInteger(value) || value < 0) {
				return fail(400, {
					message: `Consecutivo inválido para ${doc.label}. Use un entero ≥ 0.`,
					savedScope: 'consecutivos',
					savedAmbiente: ambiente
				});
			}
			values[doc.tipo] = value;
		}

		try {
			await setFeConsecutivosForAmbiente(ambiente, values);
			const label = ambiente === 'production' ? 'Producción' : 'Pruebas (staging)';
			return {
				success: true,
				message: `Consecutivos de ${label} guardados.`,
				savedScope: 'consecutivos',
				savedAmbiente: ambiente
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : 'No se pudieron guardar los consecutivos.';
			return fail(400, { message, savedScope: 'consecutivos', savedAmbiente: ambiente });
		}
	},

	revealSecret: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		const gate = await requireAdmin(
			supabase,
			user?.id,
			'Solo administradores pueden ver credenciales guardadas.'
		);
		if (!gate.ok) return fail(gate.status, { message: gate.message });

		const form = await request.formData();
		const id = String(form.get('id') ?? '').trim();
		const field = String(form.get('field') ?? '').trim();

		if (!id) return fail(400, { message: 'Configuración no válida.' });
		if (field !== 'hacienda_password' && field !== 'pin_certificado') {
			return fail(400, { message: 'Campo no válido.' });
		}

		try {
			createSupabaseAdminClient();
		} catch {
			return fail(503, { message: 'Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.' });
		}

		try {
			const row = await getFeEmisorConfigById(id);
			if (!row) return fail(404, { message: 'Configuración no encontrada.' });

			const value = field === 'hacienda_password' ? row.hacienda_password : row.pin_certificado;
			if (!value?.trim()) {
				return fail(404, { message: 'No hay valor guardado para este campo.' });
			}

			return { success: true, value };
		} catch (err) {
			const message = err instanceof Error ? err.message : 'No se pudo leer el valor guardado.';
			return fail(400, { message });
		}
	}
};
