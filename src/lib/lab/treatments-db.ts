import { createSupabaseBrowserClient } from '$lib/supabase/client';
import {
	applyCatalogToSnapshot,
	type CatalogAddon,
	type CatalogSnapshot
} from './catalog-cache';
import type { MaterialRestauracion, RestauracionPrecio } from './restoration-pricing';
import {
	materialOptionToDbPrecio,
	type TreatmentMaterialOption
} from './treatment-materials';
import type { GuiaPrecioTier, ImplantesGuia } from './surgical-guide';
import {
	type LabTreatment,
	type TreatmentCategory,
	slugifyTreatmentLabel,
	uniqueTreatmentSlug
} from './treatments-core';

type DbTreatment = {
	id: string;
	slug: string;
	label: string;
	categoria: TreatmentCategory;
	sort_order: number;
	precio_diseno: number;
	precio_fresado: number;
	precio_crc_diseno: number;
	precio_crc_fresado: number;
	activo: boolean;
	por_arcadas: boolean;
	sobre_implante: boolean;
};

type DbRestorationRow = {
	treatment_id: string;
	material: string;
	material_label: string;
	precio_diseno: number;
	precio_fresado: number;
	precio_crc_diseno: number;
	precio_crc_fresado: number;
	treatments: { slug: string } | { slug: string }[] | null;
};

function num(v: unknown): number {
	const n = Number(v);
	return Number.isFinite(n) ? n : 0;
}

function mapTreatment(row: DbTreatment): LabTreatment {
	const precio_crc_diseno = num(row.precio_crc_diseno);
	const precio_crc_fresado = num(row.precio_crc_fresado);
	return {
		id: row.id,
		value: row.slug,
		label: row.label,
		categoria: row.categoria,
		precio_diseno: num(row.precio_diseno),
		precio_fresado: num(row.precio_fresado),
		precio_crc_diseno,
		precio_crc_fresado,
		precio_crc: precio_crc_diseno + precio_crc_fresado,
		activo: row.activo,
		por_arcadas: row.por_arcadas === true,
		sobre_implante: row.sobre_implante === true
	};
}

function treatmentSlugFromJoin(treatments: DbRestorationRow['treatments']): string | null {
	if (!treatments) return null;
	if (Array.isArray(treatments)) return treatments[0]?.slug ?? null;
	return treatments.slug;
}

export async function fetchCatalogFromDb(): Promise<CatalogSnapshot> {
	const supabase = createSupabaseBrowserClient();

	const [tRes, rRes, gRes, aRes] = await Promise.all([
		supabase
			.from('treatments')
			.select(
				'id, slug, label, categoria, sort_order, precio_diseno, precio_fresado, precio_crc_diseno, precio_crc_fresado, activo, por_arcadas, sobre_implante'
			)
			.order('categoria')
			.order('sort_order')
			.order('label'),
		supabase
			.from('restoration_prices')
			.select(
				'treatment_id, material, material_label, precio_diseno, precio_fresado, precio_crc_diseno, precio_crc_fresado, treatments(slug)'
			),
		supabase.from('surgical_guide_prices').select('implantes, precio_usd, precio_crc').order('implantes'),
		supabase
			.from('pricing_addons')
			.select(
				'code, label, treatment_slug, precio_diseno_usd, precio_fresado_usd, precio_diseno_crc, precio_fresado_crc'
			)
	]);

	if (tRes.error) throw tRes.error;
	if (rRes.error) throw rRes.error;
	if (gRes.error) throw gRes.error;
	if (aRes.error) throw aRes.error;

	const treatments = (tRes.data as DbTreatment[]).map(mapTreatment);

	const treatmentMaterials = new Map<string, TreatmentMaterialOption[]>();
	const restorationMatrix = new Map<string, Partial<Record<MaterialRestauracion, RestauracionPrecio>>>();
	for (const row of (rRes.data ?? []) as DbRestorationRow[]) {
		const slug = treatmentSlugFromJoin(row.treatments);
		if (!slug) continue;
		const option: TreatmentMaterialOption = {
			key: row.material,
			label: row.material_label?.trim() || row.material,
			precio_usd: num(row.precio_fresado) || num(row.precio_diseno),
			precio_crc: num(row.precio_crc_fresado) || num(row.precio_crc_diseno)
		};
		const list = treatmentMaterials.get(slug) ?? [];
		list.push(option);
		treatmentMaterials.set(slug, list);

		const preset = row.material as MaterialRestauracion;
		if (
			preset === 'zirconio' ||
			preset === 'disilicato' ||
			preset === 'impreso' ||
			preset === 'resina_larga_duracion' ||
			preset === 'resina_provisional'
		) {
			const cur = restorationMatrix.get(slug) ?? {};
			cur[preset] = {
				precio_diseno: num(row.precio_diseno),
				precio_fresado: num(row.precio_fresado),
				precio_crc_diseno: num(row.precio_crc_diseno),
				precio_crc_fresado: num(row.precio_crc_fresado)
			};
			restorationMatrix.set(slug, cur);
		}
	}

	const guidePrices = {} as Record<ImplantesGuia, GuiaPrecioTier>;
	for (const row of gRes.data ?? []) {
		const n = Number(row.implantes) as ImplantesGuia;
		if (n >= 1 && n <= 6) {
			guidePrices[n] = { usd: num(row.precio_usd), crc: num(row.precio_crc) };
		}
	}

	const addons: CatalogAddon[] = (aRes.data ?? []).map((row) => ({
		code: row.code,
		label: row.label,
		treatment_slug: row.treatment_slug,
		precio_diseno_usd: num(row.precio_diseno_usd),
		precio_fresado_usd: num(row.precio_fresado_usd),
		precio_diseno_crc: num(row.precio_diseno_crc),
		precio_fresado_crc: num(row.precio_fresado_crc)
	}));

	return applyCatalogToSnapshot({ treatments, restorationMatrix, treatmentMaterials, guidePrices, addons });
}

export async function hydrateTreatmentsCatalog(): Promise<CatalogSnapshot> {
	return fetchCatalogFromDb();
}

export interface UpsertTreatmentInput {
	label: string;
	categoria?: TreatmentCategory;
	precio_diseno: number;
	precio_fresado: number;
	precio_crc_diseno?: number;
	precio_crc_fresado?: number;
	activo?: boolean;
	por_arcadas?: boolean;
	sobre_implante?: boolean;
}

export async function createTreatmentInDb(
	input: UpsertTreatmentInput,
	existingSlugs: Set<string>
): Promise<LabTreatment> {
	const supabase = createSupabaseBrowserClient();
	const label = input.label.trim();
	if (label.length < 2) throw new Error('El nombre del tratamiento debe tener al menos 2 caracteres.');

	const slug = uniqueTreatmentSlug(slugifyTreatmentLabel(label), existingSlugs);
	const precio_crc_diseno = Math.max(0, input.precio_crc_diseno ?? 0);
	const precio_crc_fresado = Math.max(0, input.precio_crc_fresado ?? 0);

	const { data, error } = await supabase
		.from('treatments')
		.insert({
			slug,
			label,
			categoria: input.categoria ?? 'otros',
			sort_order: 999,
			precio_diseno:
				input.categoria === 'restauracion' ? 0 : Math.max(0, input.precio_diseno),
			precio_fresado: Math.max(0, input.precio_fresado),
			precio_crc_diseno: input.categoria === 'restauracion' ? 0 : precio_crc_diseno,
			precio_crc_fresado,
			activo: input.activo !== false,
			por_arcadas: input.por_arcadas === true,
			sobre_implante: input.sobre_implante === true
		})
		.select(
			'id, slug, label, categoria, sort_order, precio_diseno, precio_fresado, precio_crc_diseno, precio_crc_fresado, activo, por_arcadas, sobre_implante'
		)
		.single();

	if (error) throw error;
	await fetchCatalogFromDb();
	return mapTreatment(data as DbTreatment);
}

export async function updateTreatmentInDb(
	id: string,
	patch: Partial<
		Pick<
			LabTreatment,
			| 'label'
			| 'categoria'
			| 'precio_diseno'
			| 'precio_fresado'
			| 'precio_crc_diseno'
			| 'precio_crc_fresado'
			| 'activo'
			| 'por_arcadas'
			| 'sobre_implante'
		>
	>
): Promise<LabTreatment> {
	const supabase = createSupabaseBrowserClient();
	const payload: Record<string, unknown> = {};

	if (patch.label !== undefined) payload.label = patch.label.trim();
	if (patch.categoria !== undefined) payload.categoria = patch.categoria;
	if (patch.precio_diseno !== undefined) payload.precio_diseno = Math.max(0, patch.precio_diseno);
	if (patch.precio_fresado !== undefined) payload.precio_fresado = Math.max(0, patch.precio_fresado);
	if (patch.precio_crc_diseno !== undefined) payload.precio_crc_diseno = Math.max(0, patch.precio_crc_diseno);
	if (patch.precio_crc_fresado !== undefined) payload.precio_crc_fresado = Math.max(0, patch.precio_crc_fresado);
	if (patch.activo !== undefined) payload.activo = patch.activo;
	if (patch.por_arcadas !== undefined) payload.por_arcadas = patch.por_arcadas;
	if (patch.sobre_implante !== undefined) payload.sobre_implante = patch.sobre_implante;

	const { data, error } = await supabase
		.from('treatments')
		.update(payload)
		.eq('id', id)
		.select(
			'id, slug, label, categoria, sort_order, precio_diseno, precio_fresado, precio_crc_diseno, precio_crc_fresado, activo, por_arcadas, sobre_implante'
		)
		.single();

	if (error) throw error;
	await fetchCatalogFromDb();
	return mapTreatment(data as DbTreatment);
}

export async function setTreatmentActiveInDb(id: string, activo: boolean): Promise<LabTreatment> {
	return updateTreatmentInDb(id, { activo });
}

export async function deleteTreatmentInDb(id: string): Promise<void> {
	const supabase = createSupabaseBrowserClient();
	const { error } = await supabase.from('treatments').delete().eq('id', id);
	if (error) throw error;
	await fetchCatalogFromDb();
}

export async function upsertTreatmentMaterialInDb(
	treatmentId: string,
	option: TreatmentMaterialOption
): Promise<void> {
	const supabase = createSupabaseBrowserClient();
	const prices = materialOptionToDbPrecio(option);
	const { error } = await supabase.from('restoration_prices').upsert(
		{
			treatment_id: treatmentId,
			material: option.key,
			material_label: option.label.trim(),
			...prices
		},
		{ onConflict: 'treatment_id,material' }
	);
	if (error) throw error;
	await fetchCatalogFromDb();
}

/** @deprecated Use upsertTreatmentMaterialInDb */
export async function upsertRestorationPriceInDb(
	treatmentId: string,
	material: string,
	prices: RestauracionPrecio,
	label?: string
): Promise<void> {
	await upsertTreatmentMaterialInDb(treatmentId, {
		key: material,
		label: label ?? material,
		precio_usd: prices.precio_fresado || prices.precio_diseno,
		precio_crc: prices.precio_crc_fresado || prices.precio_crc_diseno
	});
}

export async function deleteTreatmentMaterialInDb(
	treatmentId: string,
	materialKey: string
): Promise<void> {
	const supabase = createSupabaseBrowserClient();
	const { error } = await supabase
		.from('restoration_prices')
		.delete()
		.eq('treatment_id', treatmentId)
		.eq('material', materialKey);
	if (error) throw error;
	await fetchCatalogFromDb();
}

/** @deprecated Use deleteTreatmentMaterialInDb */
export async function deleteRestorationPriceInDb(
	treatmentId: string,
	material: string
): Promise<void> {
	return deleteTreatmentMaterialInDb(treatmentId, material);
}

export async function updateSurgicalGuidePriceInDb(
	implantes: ImplantesGuia,
	usd: number,
	crc: number
): Promise<void> {
	const supabase = createSupabaseBrowserClient();
	const { error } = await supabase
		.from('surgical_guide_prices')
		.update({ precio_usd: usd, precio_crc: crc })
		.eq('implantes', implantes);
	if (error) throw error;
	await fetchCatalogFromDb();
}
