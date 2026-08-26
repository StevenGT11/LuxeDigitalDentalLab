import { createSupabaseAdminClient } from '$lib/supabase/admin';
import { FE_CONSECUTIVO_DOC_TYPES } from './constants';
import type { FeAmbienteConsecutivos, FeConsecutivoCounter } from './consecutivos';
import type { FeAmbiente } from './types';

export type { FeAmbienteConsecutivos, FeConsecutivoCounter } from './consecutivos';

function sequenceName(tipoDocumento: string, ambiente: FeAmbiente): string {
	return `fe_consecutivo_${tipoDocumento}_${ambiente}`;
}

async function readSequenceValue(name: string): Promise<number> {
	const admin = createSupabaseAdminClient();
	const { data, error } = await admin.from('lab_sequences').select('value').eq('name', name).maybeSingle();
	if (error) throw error;
	return Number(data?.value ?? 0);
}

export async function fetchFeConsecutivosForAmbiente(ambiente: FeAmbiente): Promise<FeAmbienteConsecutivos> {
	const counters: FeConsecutivoCounter[] = [];

	for (const doc of FE_CONSECUTIVO_DOC_TYPES) {
		const current_num = await readSequenceValue(sequenceName(doc.tipo, ambiente));
		counters.push({
			tipo_documento: doc.tipo,
			label: doc.label,
			current_num
		});
	}

	return { ambiente, counters };
}

export async function fetchFeConsecutivosForConfigPage(): Promise<{
	staging: FeAmbienteConsecutivos;
	production: FeAmbienteConsecutivos;
}> {
	const [staging, production] = await Promise.all([
		fetchFeConsecutivosForAmbiente('staging'),
		fetchFeConsecutivosForAmbiente('production')
	]);
	return { staging, production };
}

export async function setFeConsecutivoCounter(
	ambiente: FeAmbiente,
	tipoDocumento: string,
	value: number
): Promise<void> {
	if (!FE_CONSECUTIVO_DOC_TYPES.some((d) => d.tipo === tipoDocumento)) {
		throw new Error(`Tipo de documento inválido: ${tipoDocumento}`);
	}
	if (!Number.isInteger(value) || value < 0) {
		throw new Error('El consecutivo debe ser un entero mayor o igual a 0.');
	}

	const admin = createSupabaseAdminClient();
	const name = sequenceName(tipoDocumento, ambiente);
	const { error } = await admin.from('lab_sequences').upsert({ name, value }, { onConflict: 'name' });
	if (error) throw error;
}

export async function setFeConsecutivosForAmbiente(
	ambiente: FeAmbiente,
	values: Record<string, number>
): Promise<void> {
	for (const doc of FE_CONSECUTIVO_DOC_TYPES) {
		const raw = values[doc.tipo];
		if (raw === undefined) {
			throw new Error(`Falta el consecutivo para ${doc.label}.`);
		}
		await setFeConsecutivoCounter(ambiente, doc.tipo, raw);
	}
}
