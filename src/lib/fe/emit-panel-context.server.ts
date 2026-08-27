import {
	getFeEmisorConfigPublicByAmbiente,
	isEmisorCredentialsComplete,
	isEmisorProfileComplete
} from './emisor.server';
import { checkFacturadorConnectionCached } from './facturador.server';
import { getEmitAmbiente } from './hacienda-settings.server';
import type { FeAmbiente } from './types';

export type FeEmitPanelContext = {
	hasActiveEmisor: boolean;
	emitAmbiente: FeAmbiente;
	emitConfigReady: boolean;
	facturadorOk: boolean;
	facturadorUrl: string;
	facturadorError: string | null;
};

/** Emisor del ambiente activo + facturador (sin cargar staging y production a la vez). */
export async function loadFeEmitPanelContext(): Promise<FeEmitPanelContext> {
	const emitAmbiente = await getEmitAmbiente();
	const [emitPublic, facturador] = await Promise.all([
		getFeEmisorConfigPublicByAmbiente(emitAmbiente),
		checkFacturadorConnectionCached()
	]);

	const profileComplete = isEmisorProfileComplete(emitPublic);
	const emitConfigReady = profileComplete && isEmisorCredentialsComplete(emitPublic);

	return {
		hasActiveEmisor: emitConfigReady && Boolean(emitPublic?.activo),
		emitAmbiente,
		emitConfigReady,
		facturadorOk: facturador.ok,
		facturadorUrl: facturador.url,
		facturadorError: facturador.error ?? null
	};
}
