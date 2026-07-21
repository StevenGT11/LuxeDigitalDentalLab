import { createSupabaseBrowserClient } from '$lib/supabase/client';
import { mapDbCaseFile } from './case-files-db';
import { assembleLabCase, buildCaseItemsFromInput, uid } from './case-builder';
import { upsertCachedCase } from './cases-cache';
import type { CreateCaseInput } from './store-types';
import type { CaseFile, CaseItem, LabCase, LabCaseEstado, LabClient } from './types';

type DbTooth = { tooth_fdi: string };
type DbItem = {
	id: string;
	case_id: string;
	sort_order: number;
	numero_pieza: string | null;
	tipo_trabajo: string;
	material: string | null;
	color: string | null;
	piezas: number;
	incluye_diseno: boolean;
	incluye_fresado: boolean;
	implantes_guia: number | null;
	alcance_arcada: import('./arcada-scope').ArcadaScope | null;
	corona_sobre_implante: boolean;
	implante_marca: string | null;
	implante_plataforma: string | null;
	descripcion: string | null;
	tipo_pieza: CaseItem['tipo_pieza'];
	unit_price: number;
	subtotal: number;
	case_item_teeth: DbTooth[] | null;
};

type DbCase = {
	id: string;
	case_number: string;
	client_id: string;
	doctor_id: string | null;
	doctor_name: string;
	paciente_name: string;
	client_name: string;
	client_clinica: string;
	tipo_trabajo: string;
	material: string | null;
	color: string | null;
	piezas: number;
	costo: number;
	fecha_creacion: string;
	fecha_entrega: string;
	estado: LabCaseEstado;
	notas: string | null;
	last_edited_at: string | null;
	last_edited_by: string | null;
	last_edited_by_name: string | null;
	archivos: CaseFile[] | null;
	case_items: DbItem[] | null;
	case_files: {
		id: string;
		category: CaseFile['category'];
		file_name: string;
		storage_path: string;
		mime_type: string;
		size_bytes: number;
		uploaded_at: string;
	}[] | null;
};

const CASE_SELECT = `
	id,
	case_number,
	client_id,
	doctor_id,
	doctor_name,
	paciente_name,
	client_name,
	client_clinica,
	tipo_trabajo,
	material,
	color,
	piezas,
	costo,
	fecha_creacion,
	fecha_entrega,
	estado,
	notas,
	last_edited_at,
	last_edited_by,
	last_edited_by_name,
	case_files (
		id,
		category,
		file_name,
		storage_path,
		mime_type,
		size_bytes,
		uploaded_at
	),
	case_items (
		id,
		case_id,
		sort_order,
		numero_pieza,
		tipo_trabajo,
		material,
		color,
		piezas,
		incluye_diseno,
		incluye_fresado,
		implantes_guia,
		alcance_arcada,
		corona_sobre_implante,
		implante_marca,
		implante_plataforma,
		descripcion,
		tipo_pieza,
		unit_price,
		subtotal,
		case_item_teeth ( tooth_fdi )
	)
`;

function num(v: unknown): number {
	const n = Number(v);
	return Number.isFinite(n) ? n : 0;
}

function mapItem(row: DbItem): CaseItem {
	const teeth = row.case_item_teeth ?? [];
	return {
		id: row.id,
		case_id: row.case_id,
		numero_pieza: row.numero_pieza,
		piezas_dentales: teeth.map((t) => t.tooth_fdi),
		tipo_pieza: row.tipo_pieza,
		tipo_trabajo: row.tipo_trabajo,
		material: row.material,
		color: row.color,
		piezas: row.piezas,
		incluye_diseno: row.incluye_diseno,
		incluye_fresado: row.incluye_fresado,
		implantes_guia: row.implantes_guia,
		alcance_arcada: row.alcance_arcada,
		corona_sobre_implante: row.corona_sobre_implante,
		implante_marca: row.implante_marca,
		implante_plataforma: row.implante_plataforma,
		descripcion: row.descripcion,
		unit_price: num(row.unit_price),
		subtotal: num(row.subtotal)
	};
}

function mapCase(row: DbCase): LabCase {
	const items = (row.case_items ?? [])
		.sort((a, b) => a.sort_order - b.sort_order)
		.map(mapItem);
	return {
		id: row.id,
		case_number: row.case_number,
		client_id: row.client_id,
		client_name: row.client_name,
		client_clinica: row.client_clinica,
		paciente_name: row.paciente_name,
		doctor_id: row.doctor_id ?? row.client_id,
		doctor_name: row.doctor_name,
		tipo_trabajo: row.tipo_trabajo,
		material: row.material,
		color: row.color,
		piezas: row.piezas,
		items,
		costo: num(row.costo),
		fecha_creacion: row.fecha_creacion,
		fecha_entrega: row.fecha_entrega,
		estado: row.estado,
		notas: row.notas,
		last_edited_at: row.last_edited_at,
		last_edited_by: row.last_edited_by,
		last_edited_by_name: row.last_edited_by_name,
		archivos: mapCaseFiles(row)
	};
}

function mapCaseFiles(row: DbCase): CaseFile[] {
	const fromTable = (row.case_files ?? []).map((f) =>
		mapDbCaseFile({
			id: f.id,
			category: f.category,
			file_name: f.file_name,
			storage_path: f.storage_path,
			mime_type: f.mime_type,
			size_bytes: f.size_bytes,
			uploaded_at: f.uploaded_at
		})
	);
	if (fromTable.length > 0) return fromTable;
	const legacy = row.archivos ?? [];
	return Array.isArray(legacy) ? legacy : [];
}

export async function fetchAllCasesFromDb(): Promise<LabCase[]> {
	const supabase = createSupabaseBrowserClient();
	const { data, error } = await supabase
		.from('cases')
		.select(CASE_SELECT)
		.order('fecha_creacion', { ascending: false });

	if (error) throw error;
	return ((data ?? []) as DbCase[]).map(mapCase);
}

export async function fetchCaseByIdFromDb(id: string): Promise<LabCase | null> {
	const supabase = createSupabaseBrowserClient();
	const { data, error } = await supabase
		.from('cases')
		.select(CASE_SELECT)
		.eq('id', id)
		.maybeSingle();

	if (error) throw error;
	if (!data) return null;
	const caso = mapCase(data as DbCase);
	upsertCachedCase(caso);
	return caso;
}

export async function hydrateCasesFromDb(): Promise<LabCase[]> {
	return fetchAllCasesFromDb();
}

export async function createCaseInDb(
	input: CreateCaseInput,
	client: LabClient,
	doctor: { doctor_id: string; doctor_name: string }
): Promise<LabCase> {
	const supabase = createSupabaseBrowserClient();
	const caseId = uid();

	const { data: caseNumber, error: seqError } = await supabase.rpc('next_case_number');
	if (seqError) throw seqError;

	const items = buildCaseItemsFromInput(caseId, input);
	const draft = assembleLabCase({
		caseId,
		caseNumber: String(caseNumber),
		input,
		client,
		doctor_id: doctor.doctor_id,
		doctor_name: doctor.doctor_name,
		items,
		archivos: input.archivos
	});

	const { error: caseError } = await supabase.from('cases').insert({
		id: caseId,
		case_number: draft.case_number,
		client_id: draft.client_id,
		doctor_id: doctor.doctor_id,
		doctor_name: draft.doctor_name,
		paciente_name: draft.paciente_name,
		client_name: draft.client_name,
		client_clinica: draft.client_clinica,
		tipo_trabajo: draft.tipo_trabajo,
		material: draft.material,
		color: draft.color,
		piezas: draft.piezas,
		costo: draft.costo,
		fecha_entrega: draft.fecha_entrega,
		estado: draft.estado,
		notas: draft.notas,
		archivos: []
	});

	if (caseError) throw caseError;

	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		const { data: itemRow, error: itemError } = await supabase
			.from('case_items')
			.insert({
				id: item.id,
				case_id: caseId,
				sort_order: i,
				numero_pieza: item.numero_pieza,
				tipo_trabajo: item.tipo_trabajo,
				material: item.material,
				color: item.color,
				piezas: item.piezas,
				incluye_diseno: item.incluye_diseno,
				incluye_fresado: item.incluye_fresado,
				implantes_guia: item.implantes_guia,
				alcance_arcada: item.alcance_arcada,
				corona_sobre_implante: item.corona_sobre_implante,
				implante_marca: item.implante_marca,
				implante_plataforma: item.implante_plataforma,
				descripcion: item.descripcion,
				tipo_pieza: item.tipo_pieza,
				unit_price: item.unit_price,
				subtotal: item.subtotal
			})
			.select('id')
			.single();

		if (itemError) throw itemError;

		if (item.piezas_dentales.length > 0) {
			const { error: teethError } = await supabase.from('case_item_teeth').insert(
				item.piezas_dentales.map((tooth_fdi) => ({
					case_item_id: itemRow.id,
					tooth_fdi
				}))
			);
			if (teethError) throw teethError;
		}
	}

	const saved = await fetchCaseByIdFromDb(caseId);
	if (!saved) throw new Error('No se pudo cargar el caso creado');
	upsertCachedCase(saved);
	return saved;
}

export async function updateCaseInDb(
	caseId: string,
	input: CreateCaseInput,
	client: LabClient,
	doctor: { doctor_id: string; doctor_name: string }
): Promise<LabCase> {
	const supabase = createSupabaseBrowserClient();
	const existing = await fetchCaseByIdFromDb(caseId);
	if (!existing) throw new Error('Caso no encontrado');
	if (existing.estado !== 'pendiente') {
		throw new Error('Solo se pueden editar casos en estado pendiente');
	}
	if (existing.client_id !== input.client_id) {
		throw new Error('No tienes permiso para editar este caso');
	}

	const items = buildCaseItemsFromInput(caseId, input);
	const first = items[0];
	const costo = input.costo ?? items.reduce((s, i) => s + i.subtotal, 0);
	const piezas = items.reduce((s, i) => s + i.piezas, 0);

	const { error: deleteError } = await supabase.from('case_items').delete().eq('case_id', caseId);
	if (deleteError) throw deleteError;

	const { error: caseError } = await supabase
		.from('cases')
		.update({
			doctor_id: doctor.doctor_id,
			doctor_name: doctor.doctor_name,
			paciente_name: input.paciente_name.trim(),
			tipo_trabajo: first.tipo_trabajo,
			material: first.material,
			color: first.color,
			piezas,
			costo,
			fecha_entrega: input.fecha_entrega,
			notas: input.notas
		})
		.eq('id', caseId);

	if (caseError) throw caseError;

	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		const { data: itemRow, error: itemError } = await supabase
			.from('case_items')
			.insert({
				id: item.id,
				case_id: caseId,
				sort_order: i,
				numero_pieza: item.numero_pieza,
				tipo_trabajo: item.tipo_trabajo,
				material: item.material,
				color: item.color,
				piezas: item.piezas,
				incluye_diseno: item.incluye_diseno,
				incluye_fresado: item.incluye_fresado,
				implantes_guia: item.implantes_guia,
				alcance_arcada: item.alcance_arcada,
				corona_sobre_implante: item.corona_sobre_implante,
				implante_marca: item.implante_marca,
				implante_plataforma: item.implante_plataforma,
				descripcion: item.descripcion,
				tipo_pieza: item.tipo_pieza,
				unit_price: item.unit_price,
				subtotal: item.subtotal
			})
			.select('id')
			.single();

		if (itemError) throw itemError;

		if (item.piezas_dentales.length > 0) {
			const { error: teethError } = await supabase.from('case_item_teeth').insert(
				item.piezas_dentales.map((tooth_fdi) => ({
					case_item_id: itemRow.id,
					tooth_fdi
				}))
			);
			if (teethError) throw teethError;
		}
	}

	const saved = await fetchCaseByIdFromDb(caseId);
	if (!saved) throw new Error('No se pudo cargar el caso actualizado');
	upsertCachedCase(saved);
	return saved;
}

export async function updateCaseStatusInDb(
	id: string,
	estado: LabCaseEstado
): Promise<LabCase | null> {
	const supabase = createSupabaseBrowserClient();
	const { error } = await supabase.from('cases').update({ estado }).eq('id', id);
	if (error) throw error;
	return fetchCaseByIdFromDb(id);
}

export async function updateCaseCostInDb(id: string, costo: number): Promise<LabCase | null> {
	const supabase = createSupabaseBrowserClient();
	const existing = await fetchCaseByIdFromDb(id);
	if (!existing) return null;

	const safeCost = Math.max(0, costo);
	const { error } = await supabase.from('cases').update({ costo: safeCost }).eq('id', id);
	if (error) throw error;

	if (existing.items.length === 1) {
		const item = existing.items[0];
		const subtotal = safeCost;
		const unit_price = Math.round((subtotal / Math.max(1, item.piezas)) * 100) / 100;
		await supabase
			.from('case_items')
			.update({ subtotal, unit_price })
			.eq('id', item.id);
	}

	return fetchCaseByIdFromDb(id);
}
