import type { FeAmbiente } from './types';

/** Comprobantes sin ambiente guardado se consideran staging (emisión anterior a la columna). */
export function feComprobanteEffectiveAmbiente(raw: string | null | undefined): FeAmbiente {
	return raw === 'production' ? 'production' : 'staging';
}

export function feComprobanteMatchesEmitAmbiente(
	comprobanteAmbiente: string | null | undefined,
	emitAmbiente: FeAmbiente
): boolean {
	return feComprobanteEffectiveAmbiente(comprobanteAmbiente) === emitAmbiente;
}

/** Filtro PostgREST para comprobantes del ambiente activo (incluye legacy null en staging). */
export function feAmbienteOrFilter(emitAmbiente: FeAmbiente): string {
	if (emitAmbiente === 'production') return 'ambiente.eq.production';
	return 'ambiente.eq.staging,ambiente.is.null';
}
