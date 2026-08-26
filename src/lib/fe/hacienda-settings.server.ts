import { createSupabaseAdminClient } from '$lib/supabase/admin';
import { env } from '$env/dynamic/private';
import type { FeAmbiente } from './types';

function emitAmbienteFromEnv(): FeAmbiente {
	const raw = (env.FE_HACIENDA_AMBIENTE ?? 'staging').trim().toLowerCase();
	return raw === 'production' ? 'production' : 'staging';
}

/** Ambiente usado al emitir: DB (toggle admin) con fallback a FE_HACIENDA_AMBIENTE. */
export async function getEmitAmbiente(): Promise<FeAmbiente> {
	const admin = createSupabaseAdminClient();
	const { data, error } = await admin
		.from('fe_hacienda_settings')
		.select('emit_ambiente')
		.eq('id', 1)
		.maybeSingle();

	if (error) {
		// Tabla aún no migrada
		if (error.code === '42P01') return emitAmbienteFromEnv();
		throw error;
	}

	if (data?.emit_ambiente === 'production') return 'production';
	if (data?.emit_ambiente === 'staging') return 'staging';
	return emitAmbienteFromEnv();
}

export async function setEmitAmbiente(ambiente: FeAmbiente): Promise<void> {
	const admin = createSupabaseAdminClient();
	const value = ambiente === 'production' ? 'production' : 'staging';
	const { error } = await admin
		.from('fe_hacienda_settings')
		.upsert({ id: 1, emit_ambiente: value }, { onConflict: 'id' });
	if (error) throw error;
}

/** @deprecated Use getEmitAmbiente() */
export function resolveEmitAmbiente(): FeAmbiente {
	return emitAmbienteFromEnv();
}
