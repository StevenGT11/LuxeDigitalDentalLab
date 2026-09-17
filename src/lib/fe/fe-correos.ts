import { isValidEmailAddress } from '$lib/email-address';

export function parseFeCorreos(raw: string | null | undefined): string[] {
	if (!raw?.trim()) return [];
	const seen = new Set<string>();
	const out: string[] = [];
	for (const part of raw.split(/[,;\n]+/)) {
		const email = part.trim();
		if (!email) continue;
		const key = email.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(email);
	}
	return out;
}

export function invalidFeCorreos(raw: string | null | undefined): string[] {
	return parseFeCorreos(raw).filter((email) => !isValidEmailAddress(email));
}

export function normalizeFeCorreos(raw: string | null | undefined): string {
	return parseFeCorreos(raw)
		.filter((email) => isValidEmailAddress(email))
		.join(', ');
}

export function primaryFeCorreo(
	stored: string | null | undefined,
	fallback?: string | null
): string | null {
	const first = parseFeCorreos(stored).find((email) => isValidEmailAddress(email));
	if (first) return first;
	const fb = fallback?.trim() ?? '';
	return fb && isValidEmailAddress(fb) ? fb : null;
}

export function formatFeCorreosLabel(
	stored: string | null | undefined,
	fallback?: string | null
): string {
	const list = parseFeCorreos(stored).filter((email) => isValidEmailAddress(email));
	if (list.length) return list.join(', ');
	const fb = fallback?.trim() ?? '';
	return fb && isValidEmailAddress(fb) ? fb : '—';
}

export function mergeFeCorreos(...sources: (string | null | undefined)[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const src of sources) {
		for (const email of parseFeCorreos(src)) {
			if (!isValidEmailAddress(email)) continue;
			const key = email.toLowerCase();
			if (seen.has(key)) continue;
			seen.add(key);
			out.push(email);
		}
	}
	return out;
}
