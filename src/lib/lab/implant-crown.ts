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
