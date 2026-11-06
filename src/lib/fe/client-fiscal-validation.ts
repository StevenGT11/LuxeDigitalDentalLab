import {
	isValidEmisorTelefonoForFe,
	normalizeEmisorTelefonoForFe
} from '$lib/fe/emisor-normalize';

/**
 * Quita espacios y guiones.
 * Cédula jurídica (02) conserva letras en mayúscula (ej. 3101A00001).
 * Los demás tipos quedan solo en dígitos.
 * Una jurídica de 12 caracteres `00` + 10 es la forma de la clave; se guarda el id de 10.
 */
export function normalizeFeNumeroIdentificacion(raw: unknown, tipo?: string): string {
	const compact = String(raw ?? '')
		.replace(/[\s-]/g, '')
		.toUpperCase();

	if (tipo === '02') {
		const alnum = compact.replace(/[^0-9A-Z]/g, '');
		if (/^00[0-9A-Z]{10}$/.test(alnum)) return alnum.slice(2);
		return alnum;
	}

	return compact.replace(/\D/g, '');
}

export function feIdentificacionAllowsLetters(tipo: string): boolean {
	return tipo === '02';
}

export function feIdentificacionInputHint(tipo: string): string {
	switch (tipo) {
		case '01':
			return '9 dígitos (cédula física)';
		case '02':
			return '10 caracteres alfanuméricos, sin guiones (ej. 3101234567 o 3101A00001)';
		case '03':
			return '11–12 dígitos (DIMEX)';
		case '04':
			return '10 dígitos (NITE)';
		default:
			return 'Seleccione el tipo de identificación';
	}
}

/** Largo máximo ya normalizado. Jurídica admite 12 solo para pegar la forma de la clave (`00` + 10). */
export function feIdentificacionMaxLength(tipo: string): number {
	switch (tipo) {
		case '01':
			return 9;
		case '02':
			return 12;
		case '03':
			return 12;
		case '04':
			return 10;
		default:
			return 12;
	}
}

/** Largo del input en crudo, para poder pegar guiones antes de normalizar. */
export function feIdentificacionFieldMaxLength(tipo: string): number {
	return tipo === '02' ? 20 : feIdentificacionMaxLength(tipo);
}

export function validateFeNumeroIdentificacion(
	tipo: string,
	raw: unknown
): { ok: true; normalized: string } | { ok: false; message: string } {
	if (!tipo) {
		return { ok: false, message: 'Seleccione el tipo de identificación.' };
	}

	const normalized = normalizeFeNumeroIdentificacion(raw, tipo);
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
			if (!/^[0-9A-Z]{10}$/.test(normalized)) {
				return {
					ok: false,
					message:
						'Cédula jurídica: use 10 caracteres alfanuméricos, sin guiones (ej. 3101234567 o 3101A00001).'
				};
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
