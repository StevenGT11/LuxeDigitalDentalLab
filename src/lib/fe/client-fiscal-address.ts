import {
	normalizeHaciendaCantonDistrito,
	normalizeHaciendaProvincia
} from '$lib/fe/emisor-normalize';
import costaRicaLocationCodes from '$lib/components/addressPicker/utils/costa-rica-codes.json';

/** Catálogo provincia/cantón/distrito Hacienda CR — ver addressPicker/utils/costa-rica-codes.json */
export { default as costaRicaLocationCodes } from '$lib/components/addressPicker/utils/costa-rica-codes.json';

export type ClientFeAddress = {
	fe_provincia: number | null;
	fe_canton: string;
	fe_distrito: string;
	fe_otras_senas: string;
};

export function emptyClientFeAddress(): ClientFeAddress {
	return {
		fe_provincia: null,
		fe_canton: '',
		fe_distrito: '',
		fe_otras_senas: ''
	};
}

export function parseClientFeAddressFromForm(form: FormData): ClientFeAddress {
	const rawProvincia = String(form.get('fe_provincia') ?? '').trim();
	const fe_otras_senas = String(form.get('fe_otras_senas') ?? '').trim();
	const hasLocation =
		rawProvincia !== '' ||
		String(form.get('fe_canton') ?? '').trim() !== '' ||
		String(form.get('fe_distrito') ?? '').trim() !== '' ||
		fe_otras_senas !== '';

	if (!hasLocation) return emptyClientFeAddress();

	if (!rawProvincia || !fe_otras_senas) {
		throw new Error('Indique provincia, cantón, distrito y otras señas de la dirección fiscal.');
	}

	return {
		fe_provincia: normalizeHaciendaProvincia(rawProvincia),
		fe_canton: normalizeHaciendaCantonDistrito(form.get('fe_canton')),
		fe_distrito: normalizeHaciendaCantonDistrito(form.get('fe_distrito')),
		fe_otras_senas
	};
}

export function clientFeAddressRowToForm(row: {
	fe_provincia?: number | null;
	fe_canton?: string | null;
	fe_distrito?: string | null;
	fe_otras_senas?: string | null;
} | null): ClientFeAddress {
	if (!row) return emptyClientFeAddress();
	return {
		fe_provincia:
			row.fe_provincia != null && row.fe_provincia >= 1 && row.fe_provincia <= 7
				? row.fe_provincia
				: null,
		fe_canton: row.fe_canton?.trim() ?? '',
		fe_distrito: row.fe_distrito?.trim() ?? '',
		fe_otras_senas: row.fe_otras_senas?.trim() ?? ''
	};
}

/** Campos de ubicación para payload `cliente` de Facturador (cuando están completos). */
export function clientFeAddressToFacturadorCliente(
	address: ClientFeAddress
): Record<string, string | number> | null {
	if (!address.fe_provincia || !address.fe_otras_senas.trim()) return null;
	return {
		provincia: address.fe_provincia,
		canton: normalizeHaciendaCantonDistrito(address.fe_canton),
		distrito: normalizeHaciendaCantonDistrito(address.fe_distrito),
		otras_senas: address.fe_otras_senas.trim()
	};
}

type CantonCatalogEntry = { name: string; province: number };
type DistrictCatalogEntry = { name: string; canton: number };

/** Texto de dirección fiscal para UI (otras señas + distrito, cantón, provincia). */
export function formatClientFeAddressLabel(address: ClientFeAddress): string {
	const senas = address.fe_otras_senas.trim();
	if (!address.fe_provincia) return senas || '—';

	const provinces = costaRicaLocationCodes.provinces as Record<string, string>;
	const cantons = costaRicaLocationCodes.cantons as Record<string, CantonCatalogEntry>;
	const districts = costaRicaLocationCodes.districts as Record<string, DistrictCatalogEntry>;
	const provinceName = provinces[String(address.fe_provincia)] ?? `Provincia ${address.fe_provincia}`;
	const cantonN = parseInt(address.fe_canton, 10);
	const distN = parseInt(address.fe_distrito, 10);
	const cantonKey = Number.isFinite(cantonN) ? String(address.fe_provincia * 100 + cantonN) : '';
	const cantonName = cantonKey ? cantons[cantonKey]?.name : '';
	const distKey = cantonKey && Number.isFinite(distN) ? String(Number(cantonKey) * 100 + distN) : '';
	const distName = distKey ? districts[distKey]?.name : '';
	const location = [distName, cantonName, provinceName].filter(Boolean).join(', ');
	return [senas, location].filter(Boolean).join(' — ') || '—';
}
