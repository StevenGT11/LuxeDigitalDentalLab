import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadCabysCatalog } from '$lib/cabys/loadCatalog.server';
import { findCabysByCodigo, searchCabysCatalog } from '$lib/cabys/searchCatalog';
import { normalizeCabys } from '$lib/cabys/normalize';

export const GET: RequestHandler = async ({ url, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ cabys: [] }, { status: 401 });
	}

	const q = url.searchParams.get('q') ?? '';
	const limit = Number(url.searchParams.get('limit') ?? '25');
	const catalog = loadCabysCatalog();
	const normalized = normalizeCabys(q);

	let cabys = searchCabysCatalog(catalog, q, limit);
	if (normalized.length === 13 && !cabys.some((e) => normalizeCabys(e.codigo) === normalized)) {
		const exact = findCabysByCodigo(catalog, normalized);
		if (exact) cabys = [exact, ...cabys].slice(0, Math.min(limit, 50));
	}

	return json({ cabys });
};
