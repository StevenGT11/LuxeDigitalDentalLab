import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseAdminClient } from '$lib/supabase/admin';
import type { FeAmbiente, FeEmisorConfigInput, FeEmisorConfigPublic, FeEmisorConfigRow, FeEmisorCredentialsInput, FeEmisorProfileInput } from './types';
import { getEmitAmbiente } from './hacienda-settings.server';

const SELECT_COLS =
	'id, ambiente, activo, tipo_identificacion, numero_identificacion, razon_social, nombre_comercial, codigo_actividad, casa_matriz, terminal, provincia, canton, distrito, otras_senas, telefono, correo_electronico, hacienda_usuario, hacienda_password, certificado_p12, pin_certificado, updated_at';

function toPublic(row: FeEmisorConfigRow): FeEmisorConfigPublic {
	return {
		id: row.id,
		ambiente: row.ambiente,
		activo: row.activo,
		tipo_identificacion: row.tipo_identificacion,
		numero_identificacion: row.numero_identificacion,
		razon_social: row.razon_social,
		nombre_comercial: row.nombre_comercial ?? '',
		codigo_actividad: row.codigo_actividad,
		casa_matriz: row.casa_matriz,
		terminal: row.terminal,
		provincia: row.provincia,
		canton: row.canton,
		distrito: row.distrito,
		otras_senas: row.otras_senas,
		telefono: row.telefono,
		correo_electronico: row.correo_electronico,
		hacienda_usuario: row.hacienda_usuario,
		has_hacienda_password: Boolean(row.hacienda_password?.length),
		has_pin: Boolean(row.pin_certificado?.length),
		has_certificado: Boolean(row.certificado_p12?.length),
		updated_at: row.updated_at
	};
}

async function fetchEmisorRowByAmbiente(
	admin: ReturnType<typeof createSupabaseAdminClient>,
	ambiente: FeAmbiente
): Promise<FeEmisorConfigRow | null> {
	const { data: active, error: activeError } = await admin
		.from('fe_emisor_config')
		.select(SELECT_COLS)
		.eq('ambiente', ambiente)
		.eq('activo', true)
		.order('updated_at', { ascending: false })
		.limit(1)
		.maybeSingle();
	if (activeError) throw activeError;
	if (active) return active as FeEmisorConfigRow;

	const { data, error } = await admin
		.from('fe_emisor_config')
		.select(SELECT_COLS)
		.eq('ambiente', ambiente)
		.order('updated_at', { ascending: false })
		.limit(1)
		.maybeSingle();
	if (error) throw error;
	return (data as FeEmisorConfigRow | null) ?? null;
}

export async function listFeEmisorConfigsPublic(): Promise<FeEmisorConfigPublic[]> {
	const admin = createSupabaseAdminClient();
	const { data, error } = await admin.from('fe_emisor_config').select(SELECT_COLS).order('ambiente');
	if (error) throw error;
	return ((data ?? []) as FeEmisorConfigRow[]).map(toPublic);
}

export async function getFeEmisorConfigByAmbiente(
	ambiente: FeAmbiente
): Promise<FeEmisorConfigRow | null> {
	const admin = createSupabaseAdminClient();
	return fetchEmisorRowByAmbiente(admin, ambiente);
}

export async function getFeEmisorConfigPublicByAmbiente(
	ambiente: FeAmbiente
): Promise<FeEmisorConfigPublic | null> {
	const row = await getFeEmisorConfigByAmbiente(ambiente);
	return row ? toPublic(row) : null;
}

export function isEmisorProfileComplete(config: FeEmisorConfigPublic | null): boolean {
	if (!config) return false;
	return Boolean(
		config.numero_identificacion?.trim() &&
			config.razon_social?.trim() &&
			config.codigo_actividad?.trim()
	);
}

export function isEmisorCredentialsComplete(config: FeEmisorConfigPublic | null): boolean {
	if (!config) return false;
	return (
		Boolean(config.hacienda_usuario?.trim()) &&
		config.has_hacienda_password &&
		config.has_pin &&
		config.has_certificado
	);
}

export function isEmisorConfigComplete(config: FeEmisorConfigPublic | null): boolean {
	return isEmisorProfileComplete(config) && isEmisorCredentialsComplete(config);
}

export function mergeEmisorProfilePublic(
	staging: FeEmisorConfigPublic | null,
	production: FeEmisorConfigPublic | null
): FeEmisorConfigPublic | null {
	const candidates = [staging, production].filter(Boolean) as FeEmisorConfigPublic[];
	if (candidates.length === 0) return null;

	const complete = candidates.filter(isEmisorProfileComplete);
	const pool = complete.length > 0 ? complete : candidates;

	return [...pool].sort(
		(a, b) =>
			new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime()
	)[0]!;
}

function fiscalPatchFromProfile(profile: FeEmisorProfileInput): Record<string, unknown> {
	return {
		tipo_identificacion: profile.tipo_identificacion.trim(),
		numero_identificacion: profile.numero_identificacion.trim(),
		razon_social: profile.razon_social.trim(),
		nombre_comercial: profile.nombre_comercial.trim() || null,
		codigo_actividad: profile.codigo_actividad.trim(),
		casa_matriz: profile.casa_matriz.trim() || '001',
		terminal: profile.terminal.trim() || '00001',
		provincia: profile.provincia,
		canton: profile.canton.trim(),
		distrito: profile.distrito.trim(),
		otras_senas: profile.otras_senas.trim(),
		telefono: profile.telefono.trim(),
		correo_electronico: profile.correo_electronico.trim(),
		activo: true
	};
}

const EMPTY_SECRETS = {
	hacienda_usuario: '',
	hacienda_password: '',
	certificado_p12: '',
	pin_certificado: ''
};

export async function upsertEmisorProfile(profile: FeEmisorProfileInput): Promise<void> {
	if (!profile.numero_identificacion?.trim() || !profile.razon_social?.trim() || !profile.codigo_actividad?.trim()) {
		throw new Error('Complete identificación, razón social y código de actividad.');
	}

	const admin = createSupabaseAdminClient();
	const fiscal = fiscalPatchFromProfile(profile);

	for (const ambiente of ['staging', 'production'] as FeAmbiente[]) {
		const { data: rows, error: listError } = await admin
			.from('fe_emisor_config')
			.select('id')
			.eq('ambiente', ambiente);
		if (listError) throw listError;

		if (rows && rows.length > 0) {
			const { data, error } = await admin
				.from('fe_emisor_config')
				.update(fiscal)
				.eq('ambiente', ambiente)
				.select('id');
			if (error) throw error;
			if (!data?.length) {
				throw new Error(
					'No se pudo guardar el emisor en la base de datos. Compruebe SUPABASE_SERVICE_ROLE_KEY en .env.'
				);
			}
		} else {
			const { data, error } = await admin
				.from('fe_emisor_config')
				.insert({
					ambiente,
					...fiscal,
					...EMPTY_SECRETS
				})
				.select('id')
				.single();
			if (error) throw error;
			if (!data) {
				throw new Error('No se pudo crear la configuración del emisor.');
			}
		}
	}
}

export async function upsertEmisorCredentials(input: FeEmisorCredentialsInput): Promise<FeEmisorConfigPublic> {
	if (!input.hacienda_usuario?.trim()) {
		throw new Error('El usuario Hacienda (ATV) es requerido.');
	}

	const admin = createSupabaseAdminClient();
	const existing = input.id
		? await getFeEmisorConfigById(input.id)
		: await getFeEmisorConfigByAmbiente(input.ambiente);
	if (input.id && existing && existing.ambiente !== input.ambiente) {
		throw new Error('Ambiente no coincide con la configuración guardada.');
	}

	const staging = await getFeEmisorConfigByAmbiente('staging');
	const production = await getFeEmisorConfigByAmbiente('production');
	const fiscalSource = existing ?? staging ?? production;
	if (!fiscalSource) {
		throw new Error('Guarde primero los datos del emisor (identificación y ubicación).');
	}

	const patch: Record<string, unknown> = {
		ambiente: input.ambiente,
		activo: true,
		hacienda_usuario: input.hacienda_usuario.trim(),
		tipo_identificacion: fiscalSource.tipo_identificacion,
		numero_identificacion: fiscalSource.numero_identificacion,
		razon_social: fiscalSource.razon_social,
		nombre_comercial: fiscalSource.nombre_comercial,
		codigo_actividad: fiscalSource.codigo_actividad,
		casa_matriz: fiscalSource.casa_matriz,
		terminal: fiscalSource.terminal,
		provincia: fiscalSource.provincia,
		canton: fiscalSource.canton,
		distrito: fiscalSource.distrito,
		otras_senas: fiscalSource.otras_senas,
		telefono: fiscalSource.telefono,
		correo_electronico: fiscalSource.correo_electronico
	};

	if (input.hacienda_password?.trim()) patch.hacienda_password = input.hacienda_password.trim();
	else if (!existing?.hacienda_password) throw new Error('La contraseña de Hacienda es requerida la primera vez.');

	if (input.pin_certificado?.trim()) patch.pin_certificado = input.pin_certificado.trim();
	else if (!existing?.pin_certificado) throw new Error('El PIN del certificado es requerido la primera vez.');

	if (input.certificado_p12?.trim()) patch.certificado_p12 = input.certificado_p12.trim();
	else if (!existing?.certificado_p12) throw new Error('El certificado P12 es requerido la primera vez.');

	if (existing) {
		const { data, error } = await admin
			.from('fe_emisor_config')
			.update(patch)
			.eq('id', existing.id)
			.select(SELECT_COLS)
			.single();
		if (error) throw error;
		return toPublic(data as FeEmisorConfigRow);
	}

	const { data, error } = await admin.from('fe_emisor_config').insert(patch).select(SELECT_COLS).single();
	if (error) throw error;
	return toPublic(data as FeEmisorConfigRow);
}

/** Ambiente usado al emitir: ver getEmitAmbiente() en hacienda-settings.server.ts */
export async function getFeEmisorConfigForEmit(): Promise<FeEmisorConfigRow | null> {
	return getFeEmisorConfigByAmbiente(await getEmitAmbiente());
}

/** @deprecated Use getFeEmisorConfigForEmit */
export async function getActiveFeEmisorConfig(): Promise<FeEmisorConfigRow | null> {
	return getFeEmisorConfigForEmit();
}

export async function getFeEmisorConfigById(id: string): Promise<FeEmisorConfigRow | null> {
	const admin = createSupabaseAdminClient();
	const { data, error } = await admin.from('fe_emisor_config').select(SELECT_COLS).eq('id', id).maybeSingle();
	if (error) throw error;
	return (data as FeEmisorConfigRow | null) ?? null;
}

function parseInput(form: FeEmisorConfigInput): Partial<FeEmisorConfigRow> {
	return {
		ambiente: form.ambiente,
		activo: form.activo,
		tipo_identificacion: form.tipo_identificacion.trim(),
		numero_identificacion: form.numero_identificacion.trim(),
		razon_social: form.razon_social.trim(),
		nombre_comercial: form.nombre_comercial.trim() || null,
		codigo_actividad: form.codigo_actividad.trim(),
		casa_matriz: form.casa_matriz.trim() || '001',
		terminal: form.terminal.trim() || '00001',
		provincia: form.provincia,
		canton: form.canton.trim(),
		distrito: form.distrito.trim(),
		otras_senas: form.otras_senas.trim(),
		telefono: form.telefono.trim(),
		correo_electronico: form.correo_electronico.trim(),
		hacienda_usuario: form.hacienda_usuario.trim()
	};
}

export async function upsertFeEmisorConfig(input: FeEmisorConfigInput): Promise<FeEmisorConfigPublic> {
	const admin = createSupabaseAdminClient();
	const base = parseInput(input);

	if (!base.numero_identificacion || !base.razon_social || !base.codigo_actividad || !base.hacienda_usuario) {
		throw new Error('Complete identificación, razón social, código de actividad y usuario Hacienda.');
	}

	let existing: FeEmisorConfigRow | null = null;
	if (input.id) {
		existing = await getFeEmisorConfigById(input.id);
		if (!existing) throw new Error('Configuración no encontrada.');
	} else {
		existing = await getFeEmisorConfigByAmbiente(input.ambiente);
	}

	const patch: Record<string, unknown> = { ...base };

	if (input.hacienda_password?.trim()) {
		patch.hacienda_password = input.hacienda_password.trim();
	} else if (!existing) {
		throw new Error('La contraseña de Hacienda es requerida en la primera configuración.');
	}

	if (input.pin_certificado?.trim()) {
		patch.pin_certificado = input.pin_certificado.trim();
	} else if (!existing) {
		throw new Error('El PIN del certificado es requerido en la primera configuración.');
	}

	if (input.certificado_p12?.trim()) {
		patch.certificado_p12 = input.certificado_p12.trim();
	} else if (!existing) {
		throw new Error('El certificado P12 (base64) es requerido en la primera configuración.');
	}

	if (input.activo) {
		await admin
			.from('fe_emisor_config')
			.update({ activo: false })
			.eq('ambiente', input.ambiente)
			.neq('id', existing?.id ?? '00000000-0000-0000-0000-000000000000');
	}

	patch.activo = input.activo;

	let row: FeEmisorConfigRow;
	if (existing) {
		const { data, error } = await admin
			.from('fe_emisor_config')
			.update(patch)
			.eq('id', existing.id)
			.select(SELECT_COLS)
			.single();
		if (error) throw error;
		row = data as FeEmisorConfigRow;
	} else {
		const { data, error } = await admin.from('fe_emisor_config').insert(patch).select(SELECT_COLS).single();
		if (error) throw error;
		row = data as FeEmisorConfigRow;
	}

	return toPublic(row);
}

export function emisorRowToFacturadorConfig(row: FeEmisorConfigRow): Record<string, unknown> {
	return {
		cedula: row.numero_identificacion,
		tipo_cedula: row.tipo_identificacion,
		razon_social: row.razon_social,
		nombre_comercial: row.nombre_comercial ?? undefined,
		codigo_actividad: row.codigo_actividad,
		casa_matriz: row.casa_matriz,
		terminal: row.terminal,
		provincia: row.provincia,
		canton: row.canton,
		distrito: row.distrito,
		otras_senas: row.otras_senas,
		telefono: row.telefono,
		correo_electronico: row.correo_electronico,
		certificado_p12: row.certificado_p12,
		pin: row.pin_certificado,
		hacienda_usuario: row.hacienda_usuario,
		hacienda_password: row.hacienda_password,
		hacienda_ambiente: row.ambiente === 'production' ? 'production' : 'staging'
	};
}

/** Solo consulta Hacienda (sin secretos de firma). */
export function emisorRowToConsultaConfig(row: FeEmisorConfigRow): Record<string, unknown> {
	return {
		hacienda_usuario: row.hacienda_usuario,
		hacienda_password: row.hacienda_password,
		hacienda_ambiente: row.ambiente === 'production' ? 'production' : 'staging'
	};
}

export async function deactivateOtherAmbienteConfigs(
	admin: SupabaseClient,
	ambiente: FeAmbiente,
	keepId: string
): Promise<void> {
	await admin.from('fe_emisor_config').update({ activo: false }).eq('ambiente', ambiente).neq('id', keepId);
}
