import { loadCabysCatalog } from '$lib/cabys/loadCatalog.server';
import { findCabysByCodigo } from '$lib/cabys/searchCatalog';
import { normalizeImpuestoTarifaForFe } from '$lib/fe/impuesto-tarifa';
import { normalizeFeUnidadMedida } from '$lib/fe/emisor-normalize';
import { resolveFeUnidadMedidaForCabys } from '$lib/fe/fe-unidad-medida';
import { createSupabaseAdminClient } from '$lib/supabase/admin';
import { assembleLabCase, buildCaseItemsFromInput, uid } from './case-builder';
import { buildInvoiceDraft } from './invoice-builder';
import { computeInvoiceTaxTotals } from './invoice-tax';
import { roundMoney } from './invoice-line-amounts';
import type { CreateCaseInput, CreateCaseItemInput } from './store-types';
import type { LabClient } from './types';

function throwDbError(context: string, error: { message?: string } | null): never {
	const detail = error?.message?.trim();
	throw new Error(detail ? `${context}: ${detail}` : context);
}

export type DirectInvoiceLineInput = CreateCaseItemInput & {
	/** Precio unitario USD; si se omite, se calcula desde tarifas del tratamiento. */
	precio_unitario?: number;
};

export function parseDirectInvoiceLinesJson(raw: string): DirectInvoiceLineInput[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new Error('Formato de líneas inválido.');
	}
	if (!Array.isArray(parsed) || parsed.length === 0) {
		throw new Error('Agregue al menos una línea.');
	}

	const lines: DirectInvoiceLineInput[] = [];
	for (const [index, row] of parsed.entries()) {
		if (!row || typeof row !== 'object') continue;
		const r = row as Record<string, unknown>;
		const tipo_trabajo = String(r.tipo_trabajo ?? '').trim();
		if (!tipo_trabajo) {
			throw new Error(`La línea ${index + 1} necesita un tratamiento.`);
		}
		const piezas = Math.max(1, Math.round(Number(r.piezas) || 1));
		const precioRaw = Number(r.precio_unitario);
		lines.push({
			tipo_trabajo,
			material: String(r.material ?? '').trim() || null,
			color: null,
			piezas,
			piezas_dentales: [],
			incluye_diseno: r.incluye_diseno !== false,
			incluye_fresado: r.incluye_fresado !== false,
			implantes_guia:
				r.implantes_guia != null && Number.isFinite(Number(r.implantes_guia))
					? Number(r.implantes_guia)
					: null,
			corona_sobre_implante: r.corona_sobre_implante === true,
			descripcion: String(r.descripcion ?? '').trim() || null,
			precio_unitario:
				Number.isFinite(precioRaw) && precioRaw >= 0 ? roundMoney(precioRaw) : undefined
		});
	}

	if (lines.length === 0) throw new Error('Agregue al menos una línea.');
	return lines;
}

/** Caso mínimo + factura interna sin flujo de portal (desde ficha de cliente). */
export async function createDirectInvoiceForClient(
	clientId: string,
	input: {
		paciente_name: string;
		notas?: string;
		items: DirectInvoiceLineInput[];
	}
): Promise<{ invoiceId: string; invoice_number: string; caseId: string }> {
	const admin = createSupabaseAdminClient();

	const { data: clientRow, error: clientErr } = await admin
		.from('clients')
		.select('id, nombre, clinica, email, telefono, created_at')
		.eq('id', clientId)
		.single();
	if (clientErr || !clientRow) throw new Error('Cliente no encontrado.');

	const client: LabClient = {
		id: clientRow.id,
		nombre: clientRow.nombre,
		clinica: clientRow.clinica ?? '',
		email: clientRow.email ?? '',
		telefono: clientRow.telefono ?? '',
		fecha_registro: clientRow.created_at ?? new Date().toISOString()
	};

	const createInput: CreateCaseInput = {
		client_id: clientId,
		paciente_name: input.paciente_name.trim() || 'Factura directa',
		doctor_name: '—',
		fecha_entrega: new Date(Date.now() + 30 * 86400000).toISOString(),
		notas: input.notas?.trim() || 'Factura creada directamente desde ficha de cliente.',
		items: input.items
	};

	const caseId = uid();
	const [{ data: caseNumber, error: caseSeqErr }, { data: invoiceNumber, error: invSeqErr }] =
		await Promise.all([admin.rpc('next_case_number'), admin.rpc('next_invoice_number')]);
	if (caseSeqErr) throwDbError('No se pudo asignar número de caso', caseSeqErr);
	if (invSeqErr) throwDbError('No se pudo asignar número de factura', invSeqErr);

	const items = buildCaseItemsFromInput(caseId, createInput).map((item, i) => {
		const override = input.items[i]?.precio_unitario;
		if (override == null || !Number.isFinite(override)) return item;
		const subtotal = roundMoney(override * item.piezas);
		return { ...item, unit_price: override, subtotal };
	});
	const caseCosto = roundMoney(items.reduce((sum, item) => sum + item.subtotal, 0));
	const draftCase = assembleLabCase({
		caseId,
		caseNumber: String(caseNumber),
		input: createInput,
		client,
		doctor_id: '',
		doctor_name: '—',
		items,
		archivos: []
	});

	const { error: caseError } = await admin.from('cases').insert({
		id: caseId,
		case_number: draftCase.case_number,
		client_id: draftCase.client_id,
		doctor_id: null,
		doctor_name: draftCase.doctor_name,
		paciente_name: draftCase.paciente_name,
		client_name: draftCase.client_name,
		client_clinica: draftCase.client_clinica,
		tipo_trabajo: draftCase.tipo_trabajo,
		material: draftCase.material,
		color: draftCase.color,
		piezas: draftCase.piezas,
		costo: caseCosto,
		fecha_entrega: draftCase.fecha_entrega,
		estado: 'finalizado',
		notas: draftCase.notas
	});
	if (caseError) throwDbError('No se pudo crear el caso interno', caseError);

	for (let i = 0; i < items.length; i++) {
		const item = items[i]!;
		const { error: itemError } = await admin.from('case_items').insert({
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
		});
		if (itemError) throwDbError(`No se pudo guardar la línea ${i + 1}`, itemError);
	}

	const labCase = { ...draftCase, items, id: caseId };
	const { invoice: invDraft, lineas } = buildInvoiceDraft(labCase, client, String(invoiceNumber));
	const invoiceId = uid();

	const slugs = [...new Set(items.map((i) => i.tipo_trabajo))];
	const { data: treatmentRows } = await admin
		.from('treatments')
		.select('slug, fe_cabys, fe_unidad_medida, impuesto_tarifa')
		.in('slug', slugs);
	const treatmentBySlug = new Map((treatmentRows ?? []).map((t) => [t.slug as string, t]));
	const cabysCatalog = loadCabysCatalog();
	const cabysLookup = (code: string) => findCabysByCodigo(cabysCatalog, code);

	const lineRows = lineas.map((l, i) => {
		const item = items[i]!;
		const treatment = treatmentBySlug.get(item.tipo_trabajo);
		const fe_cabys = treatment?.fe_cabys?.trim() || null;
		return {
			invoice_id: invoiceId,
			sort_order: i,
			descripcion: l.descripcion,
			cantidad: l.cantidad,
			precio_unitario: l.precio_unitario,
			subtotal: l.subtotal,
			fe_cabys,
			fe_unidad_medida: fe_cabys
				? resolveFeUnidadMedidaForCabys(fe_cabys, treatment?.fe_unidad_medida, cabysLookup)
				: normalizeFeUnidadMedida(treatment?.fe_unidad_medida),
			impuesto_tarifa: normalizeImpuestoTarifaForFe(treatment?.impuesto_tarifa ?? 13)
		};
	});

	const headerTotals = computeInvoiceTaxTotals(
		lineRows.map((r) => ({ subtotal: r.subtotal, impuesto_tarifa: r.impuesto_tarifa }))
	);

	const { error: invError } = await admin.from('invoices').insert({
		id: invoiceId,
		invoice_number: invDraft.invoice_number,
		client_id: invDraft.client_id,
		case_id: caseId,
		client_name: invDraft.client_name,
		client_clinica: invDraft.client_clinica,
		case_number: invDraft.case_number,
		paciente_name: invDraft.paciente_name,
		subtotal: headerTotals.subtotal,
		impuesto: headerTotals.impuesto,
		total: headerTotals.total,
		fecha_emision: invDraft.fecha_emision,
		fecha_vencimiento: invDraft.fecha_vencimiento,
		estado: invDraft.estado
	});
	if (invError) throwDbError('No se pudo crear la factura', invError);

	if (lineRows.length > 0) {
		const { error: linesError } = await admin.from('invoice_lines').insert(lineRows);
		if (linesError) throwDbError('No se pudieron guardar las líneas de la factura', linesError);
	}

	return {
		invoiceId,
		invoice_number: invDraft.invoice_number,
		caseId
	};
}
