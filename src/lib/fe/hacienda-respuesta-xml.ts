/** Hacienda API returns `respuesta-xml` base64-encoded; Facturador exposes both raw and decoded. */

function looksLikeXml(value: string): boolean {
	const s = value.trimStart();
	return s.startsWith('<') || s.startsWith('<?xml');
}

/**
 * Returns UTF-8 XML for storage, display and email attachments.
 * Accepts Facturador `respuesta_xml` (often base64) and optional `respuesta_xml_decoded`.
 */
export function decodeHaciendaRespuestaXml(
	raw: string | null | undefined,
	decoded?: string | null | undefined
): string | null {
	const decodedTrim = decoded?.trim();
	if (decodedTrim && looksLikeXml(decodedTrim)) return decodedTrim;

	const rawTrim = raw?.trim();
	if (!rawTrim) return null;
	if (looksLikeXml(rawTrim)) return rawTrim;

	try {
		const fromBase64 = Buffer.from(rawTrim, 'base64').toString('utf-8').trim();
		if (fromBase64 && looksLikeXml(fromBase64)) return fromBase64;
	} catch {
		// not valid base64
	}

	return null;
}
