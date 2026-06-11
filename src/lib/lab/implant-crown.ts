/** Marcas de implante frecuentes en el laboratorio */
export const IMPLANTE_MARCAS = [
	'Straumann',
	'Nobel Biocare',
	'BioHorizons',
	'Neodent',
	'Megagen',
	'Osstem',
	'Zimmer Biomet',
	'MIS',
	'Alpha-Bio',
	'Otra'
] as const;

/** Tamaños de plataforma habituales */
export const IMPLANTE_PLATAFORMAS = [
	'NP (estrecha / narrow)',
	'RP (regular)',
	'WP (ancha / wide)',
	'3.0 mm',
	'3.3 mm',
	'3.5 mm',
	'4.0 mm',
	'4.1 mm',
	'4.3 mm',
	'4.8 mm',
	'5.0 mm',
	'Otra'
] as const;

export function formatImplantCrownDetails(item: {
	corona_sobre_implante?: boolean | null;
	implante_marca?: string | null;
	implante_plataforma?: string | null;
}): string | null {
	if (!item.corona_sobre_implante) return null;
	const parts: string[] = [];
	if (item.implante_marca?.trim()) parts.push(item.implante_marca.trim());
	if (item.implante_plataforma?.trim()) parts.push(item.implante_plataforma.trim());
	return parts.length > 0 ? parts.join(' · ') : null;
}
