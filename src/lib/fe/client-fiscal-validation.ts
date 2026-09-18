import {
	isValidEmisorTelefonoForFe,
	normalizeEmisorTelefonoForFe
} from '$lib/fe/emisor-normalize';

/** Solo dígitos (sin guiones ni espacios). */
export function normalizeFeNumeroIdentificacion(raw: unknown): string {
	return String(raw ?? '').replace(/\D/g, '');
}

export function feIdentificacionInputHint(tipo: string): string {
	switch (tipo) {
		case '01':
			return '9 dígitos (cédula física)';
		case '02':
			return '10 dígitos (cédula jurídica)';
		case '03':
			return '11–12 dígitos (DIMEX)';
		case '04':
			return '10 dígitos (NITE)';
		default:
			return 'Seleccione el tipo de identificación';
	}
}

export function feIdentificacionMaxLength(tipo: string): number {
	switch (tipo) {
		case '01':
			return 9;
		case '02':
			return 10;
		case '03':
			return 12;
		case '04':
			return 10;
		default:
			return 12;
	}
}

export function validateFeNumeroIdentificacion(
	tipo: string,
	raw: unknown
): { ok: true; normalized: string } | { ok: false; message: string } {
	if (!tipo) {
		return { ok: false, message: 'Seleccione el tipo de identificación.' };
	}

	const normalized = normalizeFeNumeroIdentificacion(raw);
	if (!normalized) {
		return { ok: false, message: 'Indique el número de identificación.' };
	}

	switch (tipo) {
		case '01':
			if (!/^\d{9}$/.test(normalized)) {
				return { ok: false, message: 'Cédula física: use exactamente 9 dígitos.' };
			}
			break;
		case '02':
			if (!/^\d{10}$/.test(normalized)) {
				return { ok: false, message: 'Cédula jurídica: use exactamente 10 dígitos.' };
			}
			break;
		case '03':
			if (!/^\d{11,12}$/.test(normalized)) {
				return { ok: false, message: 'DIMEX: use 11 o 12 dígitos.' };
			}
			break;
		case '04':
			if (!/^\d{10}$/.test(normalized)) {
				return { ok: false, message: 'NITE: use exactamente 10 dígitos.' };
			}
			break;
		default:
			return { ok: false, message: 'Tipo de identificación inválido.' };
	}

	return { ok: true, normalized };
}

/** Teléfono CR: 8 dígitos locales o con prefijo +506. Vacío permitido. */
export function validateClientTelefono(
	raw: unknown
): { ok: true; normalized: string } | { ok: false; message: string } {
	const trimmed = String(raw ?? '').trim();
	if (!trimmed) return { ok: true, normalized: '' };

	const normalized = normalizeEmisorTelefonoForFe(trimmed);
	if (!isValidEmisorTelefonoForFe(normalized)) {
		return {
			ok: false,
			message: 'Teléfono inválido: use 8 dígitos (ej. 88887777) o incluya +506.'
		};
	}

	return { ok: true, normalized };
}
