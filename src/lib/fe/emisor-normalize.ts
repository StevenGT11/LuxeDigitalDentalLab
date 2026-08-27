/** Hacienda v4.4 service units (must match @happy-prod/facturador services/xml.js). */
const FE_SERVICE_UNITS = new Set(['Sp', 'Spe', 'OS', 'STE', 'STN']);

const UNIDAD_ALIASES: Record<string, string> = {
	os: 'OS',
	sp: 'Sp',
	spe: 'Spe',
	ste: 'STE',
	stn: 'STN',
	unid: 'Unid'
};

/** Strip country code and non-digits; Hacienda expects 8-digit NumTelefono. */
export function normalizeEmisorTelefonoForFe(raw: unknown): string {
	let digits = String(raw ?? '').replace(/\D/g, '');
	if (digits.length === 11 && digits.startsWith('506')) {
		digits = digits.slice(3);
	}
	return digits;
}

export function isValidEmisorTelefonoForFe(telefono: string): boolean {
	return /^\d{8}$/.test(telefono);
}

/** Keep catalog shape; trim only — Hacienda expects the code exactly as registered in RUT. */
export function normalizeCodigoActividadForFe(raw: unknown): string {
	return String(raw ?? '')
		.trim()
		.replace(/\s+/g, '');
}

export function isPlausibleCodigoActividadForFe(codigo: string): boolean {
	return /^\d{4}(\.\d)?$/.test(codigo) || /^\d{6}$/.test(codigo);
}

export function normalizeFeUnidadMedida(raw: unknown): string {
	const trimmed = String(raw ?? '').trim();
	if (!trimmed) return 'Sp';
	const alias = UNIDAD_ALIASES[trimmed.toLowerCase()];
	if (alias) return alias;
	if (FE_SERVICE_UNITS.has(trimmed) || trimmed === 'Unid') return trimmed;
	return 'Sp';
}

export function isFeServiceUnidadMedida(unidad: string): boolean {
	return FE_SERVICE_UNITS.has(normalizeFeUnidadMedida(unidad));
}

export function normalizeHaciendaCantonDistrito(raw: unknown): string {
	const n = parseInt(String(raw ?? '').trim(), 10);
	if (!Number.isFinite(n) || n < 1) return '01';
	return String(n).padStart(2, '0').slice(0, 2);
}

export function normalizeHaciendaProvincia(raw: unknown): number {
	const n = Number(raw);
	if (Number.isFinite(n) && n >= 1 && n <= 7) return Math.floor(n);
	return 1;
}

export type EmisorEmitValidation = {
	ok: true;
	telefono: string;
	codigo_actividad: string;
	provincia: number;
	canton: string;
	distrito: string;
};
export type EmisorEmitValidationError = { ok: false; errors: string[] };

/** Pre-flight checks with actionable messages for Admin → Factura electrónica. */
export function validateEmisorForEmit(input: {
	telefono: string | null | undefined;
	codigo_actividad: string | null | undefined;
	provincia: number | null | undefined;
	canton: string | null | undefined;
	distrito: string | null | undefined;
}): EmisorEmitValidation | EmisorEmitValidationError {
	const errors: string[] = [];

	const telefono = normalizeEmisorTelefonoForFe(input.telefono);
	if (!isValidEmisorTelefonoForFe(telefono)) {
		errors.push(
			'Teléfono del emisor inválido: use 8 dígitos (ej. 88888888). Si incluye +506, se normaliza al guardar/emitir.'
		);
	}

	const codigo_actividad = normalizeCodigoActividadForFe(input.codigo_actividad);
	if (!codigo_actividad) {
		errors.push('Falta el código de actividad económica del emisor.');
	} else if (!isPlausibleCodigoActividadForFe(codigo_actividad)) {
		errors.push(
			`Código de actividad «${codigo_actividad}» no tiene formato CIIU válido (ej. 3250.0). Debe coincidir exactamente con el registrado en su RUT ante Hacienda.`
		);
	}

	const provincia = normalizeHaciendaProvincia(input.provincia);
	const canton = normalizeHaciendaCantonDistrito(input.canton);
	const distrito = normalizeHaciendaCantonDistrito(input.distrito);

	if (errors.length > 0) return { ok: false, errors };

	return { ok: true, telefono, codigo_actividad, provincia, canton, distrito };
}
