import {
	calcularCostoItem,
	formatImplantesGuiaLabel,
	isGuiaQuirurgica
} from './constants';
import { formatArcadaScopeLabel, isArcadaScopeTreatment, normalizeArcadaScope } from './arcada-scope';
import { isSobreImplanteTreatment } from './sobre-implante';
import { normalizeGuiaTipoTrabajo } from './surgical-guide';
import { normalizeRestauracionItem } from './restoration-pricing';
import {
	formatTeethSelection,
	inferAnatomySummary,
	parseTeethFromString,
	sortTeethFdi
} from './teeth';
import type { CaseFile, CaseItem, LabCase, LabCaseEstado, LabClient } from './types';
import type { CreateCaseInput, CreateCaseItemInput } from './store-types';

export function uid(): string {
	return crypto.randomUUID();
}

export function buildCaseItem(
	caseId: string,
	tipo_trabajo: string,
	material: string | null,
	color: string | null,
	piezas: number,
	options?: {
		descripcion?: string | null;
		numero_pieza?: string | null;
		piezas_dentales?: string[];
		tipo_pieza?: CaseItem['tipo_pieza'];
		incluye_diseno?: boolean;
		incluye_fresado?: boolean;
		implantes_guia?: number | null;
		alcance_arcada?: import('./arcada-scope').ArcadaScope | null;
		corona_sobre_implante?: boolean;
		implante_marca?: string | null;
		implante_plataforma?: string | null;
	}
): CaseItem {
	const esGuia = isGuiaQuirurgica(tipo_trabajo);
	const esArcadaScope = isArcadaScopeTreatment(tipo_trabajo);
	const implantes_guia = options?.implantes_guia ?? null;
	const alcance_arcada = esArcadaScope
		? (normalizeArcadaScope(options?.alcance_arcada) ?? 'ambas')
		: null;
	const piezas_dentales = esGuia || esArcadaScope ? [] : sortTeethFdi(options?.piezas_dentales ?? []);
	const numero = esGuia
		? implantes_guia
			? formatImplantesGuiaLabel(implantes_guia)
			: (options?.numero_pieza?.trim() ?? null)
		: esArcadaScope
			? formatArcadaScopeLabel(alcance_arcada)
			: options?.numero_pieza?.trim() ||
				(piezas_dentales.length > 0 ? formatTeethSelection(piezas_dentales) : null);
	const p = esGuia || esArcadaScope ? 1 : Math.max(1, piezas_dentales.length > 0 ? piezas_dentales.length : piezas);
	const incluye_diseno = esGuia ? true : (options?.incluye_diseno ?? false);
	const incluye_fresado = esGuia ? false : (options?.incluye_fresado ?? false);
	const corona_sobre_implante = options?.corona_sobre_implante === true;
	const implante_marca = corona_sobre_implante ? options?.implante_marca?.trim() || null : null;
	const implante_plataforma = corona_sobre_implante
		? options?.implante_plataforma?.trim() || null
		: null;
	const subtotal = calcularCostoItem({
		tipo_trabajo,
		material,
		piezas: p,
		incluye_diseno,
		incluye_fresado,
		implantes_guia,
		alcance_arcada,
		corona_sobre_implante
	});
	return {
		id: uid(),
		case_id: caseId,
		numero_pieza: numero,
		piezas_dentales,
		tipo_pieza: esGuia ? null : (options?.tipo_pieza ?? inferAnatomySummary(piezas_dentales)),
		tipo_trabajo,
		material,
		color,
		piezas: p,
		incluye_diseno,
		incluye_fresado,
		implantes_guia: esGuia ? implantes_guia : null,
		alcance_arcada: esArcadaScope ? alcance_arcada : null,
		corona_sobre_implante: isSobreImplanteTreatment(tipo_trabajo) ? corona_sobre_implante : false,
		implante_marca: isSobreImplanteTreatment(tipo_trabajo) ? implante_marca : null,
		implante_plataforma: isSobreImplanteTreatment(tipo_trabajo) ? implante_plataforma : null,
		descripcion: options?.descripcion ?? null,
		unit_price: Math.round(subtotal * 100) / 100,
		subtotal
	};
}

export function buildCaseItemsFromInput(caseId: string, input: CreateCaseInput): CaseItem[] {
	if (input.items && input.items.length > 0) {
		return input.items.map((row: CreateCaseItemInput) =>
			buildCaseItem(caseId, row.tipo_trabajo, row.material, row.color, row.piezas ?? row.piezas_dentales.length, {
				piezas_dentales: row.piezas_dentales,
				numero_pieza: row.numero_pieza,
				incluye_diseno: row.incluye_diseno,
				incluye_fresado: row.incluye_fresado,
				implantes_guia: row.implantes_guia,
				alcance_arcada: row.alcance_arcada,
				corona_sobre_implante: row.corona_sobre_implante,
				implante_marca: row.implante_marca,
				implante_plataforma: row.implante_plataforma,
				descripcion: row.descripcion
			})
		);
	}
	if (input.tipo_trabajo) {
		const items = [
			buildCaseItem(caseId, input.tipo_trabajo, input.material ?? null, input.color ?? null, input.piezas ?? 1, {
				incluye_diseno: true,
				incluye_fresado: true
			})
		];
		if (input.extra_items?.length) {
			for (const extra of input.extra_items) {
				items.push(
					buildCaseItem(caseId, extra.tipo_trabajo, extra.material, extra.color, extra.piezas, {
						numero_pieza: extra.numero_pieza ?? null,
						incluye_diseno: true,
						incluye_fresado: true,
						descripcion: extra.descripcion
					})
				);
			}
		}
		return items;
	}
	throw new Error('El caso debe incluir al menos un ítem de trabajo');
}

export function assembleLabCase(params: {
	caseId: string;
	caseNumber: string;
	input: CreateCaseInput;
	client: LabClient;
	doctor_id: string;
	doctor_name: string;
	items: CaseItem[];
	archivos?: CaseFile[];
}): LabCase {
	const { caseId, caseNumber, input, client, doctor_id, doctor_name, items, archivos } = params;
	const costo = input.costo ?? items.reduce((s, i) => s + i.subtotal, 0);
	const first = items[0];
	return {
		id: caseId,
		case_number: caseNumber,
		client_id: client.id,
		client_name: client.nombre,
		client_clinica: client.clinica,
		paciente_name: input.paciente_name,
		doctor_id,
		doctor_name,
		tipo_trabajo: first.tipo_trabajo,
		material: first.material,
		color: first.color,
		piezas: items.reduce((s, i) => s + i.piezas, 0),
		items,
		costo,
		fecha_creacion: new Date().toISOString(),
		fecha_entrega: input.fecha_entrega,
		estado: 'pendiente' as LabCaseEstado,
		notas: input.notas,
		archivos: archivos ?? []
	};
}

export function migrateCaseRow(raw: LabCase): LabCase {
	const rawItems =
		raw.items?.length > 0
			? raw.items
			: [
					{
						id: uid(),
						case_id: raw.id,
						numero_pieza: null,
						piezas_dentales: [] as string[],
						tipo_pieza: null,
						tipo_trabajo: raw.tipo_trabajo,
						material: raw.material,
						color: raw.color,
						piezas: raw.piezas,
						descripcion: null,
						incluye_diseno: true,
						incluye_fresado: true,
						unit_price: raw.piezas > 0 ? raw.costo / raw.piezas : raw.costo,
						subtotal: raw.costo
					}
				];

	const items = rawItems.map((item) => {
		const guiaNorm = normalizeGuiaTipoTrabajo(item.tipo_trabajo);
		const restNorm = normalizeRestauracionItem({
			tipo_trabajo: guiaNorm.tipo_trabajo,
			material: item.material,
			corona_sobre_implante: item.corona_sobre_implante
		});
		const tipo_trabajo = restNorm.tipo_trabajo;
		const material = restNorm.material ?? item.material;
		const corona_sobre_implante = restNorm.corona_sobre_implante;
		const implantes_guia = item.implantes_guia ?? guiaNorm.implantes_guia ?? null;
		const esGuia = isGuiaQuirurgica(tipo_trabajo);
		const esArcadaScope = isArcadaScopeTreatment(tipo_trabajo);
		const alcance_arcada = esArcadaScope
			? (normalizeArcadaScope(item.alcance_arcada) ?? 'ambas')
			: null;

		const piezas_dentales = esGuia || esArcadaScope
			? []
			: item.piezas_dentales?.length > 0
				? sortTeethFdi(item.piezas_dentales)
				: parseTeethFromString(item.numero_pieza);
		const numero_pieza = esGuia
			? implantes_guia
				? formatImplantesGuiaLabel(implantes_guia)
				: (item.numero_pieza ?? null)
			: esArcadaScope
				? formatArcadaScopeLabel(alcance_arcada)
				: (item.numero_pieza ?? (piezas_dentales.length > 0 ? formatTeethSelection(piezas_dentales) : null));
		const incluye_diseno = esGuia ? true : (item.incluye_diseno ?? true);
		const incluye_fresado = esGuia ? false : (item.incluye_fresado ?? true);
		const p = esGuia || esArcadaScope ? 1 : item.piezas;
		const subtotal = calcularCostoItem({
			tipo_trabajo,
			material,
			piezas: p,
			incluye_diseno,
			incluye_fresado,
			implantes_guia,
			alcance_arcada,
			corona_sobre_implante
		});
		return {
			...item,
			tipo_trabajo,
			material,
			corona_sobre_implante: isSobreImplanteTreatment(tipo_trabajo) ? corona_sobre_implante : false,
			implantes_guia,
			alcance_arcada,
			piezas_dentales,
			numero_pieza,
			tipo_pieza: esGuia ? null : (item.tipo_pieza ?? inferAnatomySummary(piezas_dentales)),
			piezas: p,
			incluye_diseno,
			incluye_fresado,
			subtotal,
			unit_price: Math.round((subtotal / Math.max(1, p)) * 100) / 100
		};
	});

	const costo = items.reduce((s, i) => s + i.subtotal, 0);
	const first = items[0];

	return {
		...raw,
		items,
		costo,
		tipo_trabajo: first.tipo_trabajo ?? raw.tipo_trabajo,
		material: first.material ?? raw.material,
		color: first.color ?? raw.color,
		piezas: items.reduce((s, i) => s + i.piezas, 0),
		archivos: raw.archivos ?? [],
		estado: raw.estado ?? 'pendiente'
	};
}
