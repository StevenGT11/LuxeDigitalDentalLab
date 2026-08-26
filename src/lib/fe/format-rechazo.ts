export type FeRechazoErrorRow = {
	codigo: string;
	mensaje: string;
	fila: string;
	columna: string;
};

export type FeRechazoFormatted = {
	codigo: string | null;
	estado: string | null;
	intro: string;
	errors: FeRechazoErrorRow[];
};

const ERROR_TABLE_HEADER = /codigo,\s*mensaje,\s*fila,\s*columna/i;

function normalizeNewlines(value: string): string {
	return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function readStringField(obj: Record<string, unknown>, key: string): string | null {
	const raw = obj[key];
	if (raw == null) return null;
	if (typeof raw !== 'string') return String(raw).trim() || null;
	const trimmed = normalizeNewlines(raw).trim();
	return trimmed || null;
}

/** Prefer a single human message when detalle and razon repeat the same text. */
function mergeDetalleRazon(detalle: string | null, razon: string | null): string {
	if (!detalle && !razon) return '';
	if (!detalle) return razon!;
	if (!razon) return detalle;
	if (detalle === razon) return detalle;
	if (detalle.includes(razon)) return detalle;
	if (razon.includes(detalle)) return razon;
	return `${detalle}\n\n${razon}`;
}

function cleanMensaje(raw: string): string {
	let msg = raw.trim();
	msg = msg.replace(/^""+|""+$/g, '');
	msg = msg.replace(/^"+|"+$/g, '');
	return msg.replace(/""/g, '"').trim();
}

function parseErrorRows(body: string): { intro: string; errors: FeRechazoErrorRow[] } {
	const headerMatch = body.match(ERROR_TABLE_HEADER);
	if (!headerMatch || headerMatch.index == null) {
		return { intro: body.trim(), errors: [] };
	}

	const intro = body.slice(0, headerMatch.index).trim();
	const tableText = body.slice(headerMatch.index);
	const errors: FeRechazoErrorRow[] = [];

	for (const line of normalizeNewlines(tableText).split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || ERROR_TABLE_HEADER.test(trimmed) || trimmed === '[' || trimmed === ']') continue;

		const match = trimmed.match(/^(-?\d+)\s*,\s*(.+)\s*,\s*(\d+)\s*,\s*(\d+)\s*$/);
		if (!match) continue;

		errors.push({
			codigo: match[1],
			mensaje: cleanMensaje(match[2]),
			fila: match[3],
			columna: match[4]
		});
	}

	return { intro, errors };
}

export function parseFeRechazoObject(obj: Record<string, unknown>): FeRechazoFormatted | null {
	if (!obj || Object.keys(obj).length === 0) return null;

	const codigo = readStringField(obj, 'codigo');
	const estado = readStringField(obj, 'estado');
	const message = mergeDetalleRazon(readStringField(obj, 'detalle'), readStringField(obj, 'razon'));

	if (!message && !codigo && !estado) return null;

	const { intro, errors } = parseErrorRows(message);
	return { codigo, estado, intro, errors };
}

/** Resolve rechazo from JSON column or legacy `ultimo_error` JSON string. */
export function parseFeRechazoFromStored(
	rechazo: Record<string, unknown> | null | undefined,
	ultimoError: string | null | undefined
): FeRechazoFormatted | null {
	if (rechazo && Object.keys(rechazo).length > 0) {
		return parseFeRechazoObject(rechazo);
	}

	const text = ultimoError?.trim();
	if (!text) return null;

	if (text.startsWith('{')) {
		try {
			const parsed = JSON.parse(text) as Record<string, unknown>;
			return parseFeRechazoObject(parsed);
		} catch {
			return { codigo: null, estado: null, intro: text, errors: [] };
		}
	}

	return { codigo: null, estado: null, intro: text, errors: [] };
}

export function feRechazoSummaryLine(formatted: FeRechazoFormatted, maxLen = 160): string {
	const primary =
		formatted.errors[0]?.mensaje ||
		formatted.intro.split('\n').find((line) => line.trim()) ||
		formatted.estado ||
		'Rechazado por Hacienda';

	if (primary.length <= maxLen) return primary;
	return `${primary.slice(0, maxLen - 1)}…`;
}

export function feRechazoToUltimoError(rechazo: Record<string, unknown> | undefined | null): string | null {
	const formatted = parseFeRechazoObject(rechazo ?? {});
	if (!formatted) return null;
	return feRechazoSummaryLine(formatted, 2000);
}
