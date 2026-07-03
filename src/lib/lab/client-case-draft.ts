import { formatImplantCrownDetails } from './implant-crown';
import {
	getPrecioDiseno,
	getPrecioFresado,
	getRestauracionPrecioUnitarioUsd,
	isGuiaQuirurgica,
	isRestauracionTipoTrabajo,
	treatmentHasMaterials,
	getTreatmentMaterialPriceUsd
} from './constants';
import { getTreatmentByValue, type TreatmentCategory } from './treatments';
import type { ArcadaScope } from './types';
import type { CaseItem, LabCase } from './types';

export interface CaseDraftItem {
	key: string;
	piezas_dentales: string[];
	categoria_seleccionada: TreatmentCategory | '';
	tipo_trabajo: string;
	implantes_guia: number | null;
	material: string;
	color: string;
	incluye_diseno: boolean;
	incluye_fresado: boolean;
	corona_sobre_implante: boolean;
	implante_marca: string;
	implante_plataforma: string;
	alcance_arcada: ArcadaScope | null;
}

export function newCaseDraftItem(): CaseDraftItem {
	return {
		key: crypto.randomUUID(),
		piezas_dentales: [],
		categoria_seleccionada: '',
		tipo_trabajo: '',
		implantes_guia: null,
		material: '',
		color: '',
		incluye_diseno: true,
		incluye_fresado: true,
		corona_sobre_implante: false,
		implante_marca: '',
		implante_plataforma: '',
		alcance_arcada: null
	};
}

export function labCaseItemsToDraft(items: CaseItem[]): CaseDraftItem[] {
	if (items.length === 0) return [newCaseDraftItem()];

	return items.map((item) => {
		const treatment = getTreatmentByValue(item.tipo_trabajo);
		return {
			key: crypto.randomUUID(),
			piezas_dentales: [...item.piezas_dentales],
			categoria_seleccionada: treatment?.categoria ?? '',
			tipo_trabajo: item.tipo_trabajo,
			implantes_guia: item.implantes_guia ?? null,
			material: item.material ?? '',
			color: item.color ?? '',
			incluye_diseno: item.incluye_diseno,
			incluye_fresado: item.incluye_fresado,
			corona_sobre_implante: item.corona_sobre_implante ?? false,
			implante_marca:
				formatImplantCrownDetails({
					corona_sobre_implante: item.corona_sobre_implante,
					implante_marca: item.implante_marca,
					implante_plataforma: item.implante_plataforma
				}) ?? '',
			implante_plataforma: '',
			alcance_arcada: item.alcance_arcada ?? null
		};
	});
}

export function canClientEditCase(caso: LabCase, clientId: string): boolean {
	return caso.client_id === clientId && caso.estado === 'pendiente';
}

/** Diseño/fresado según categoría y material — el cliente no elige servicios sueltos. */
export function resolveItemServices(row: {
	tipo_trabajo: string;
	categoria_seleccionada: TreatmentCategory | '';
	material: string;
	corona_sobre_implante: boolean;
}): { incluye_diseno: boolean; incluye_fresado: boolean } {
	if (!row.tipo_trabajo) return { incluye_diseno: false, incluye_fresado: false };

	if (isGuiaQuirurgica(row.tipo_trabajo)) {
		return { incluye_diseno: true, incluye_fresado: false };
	}

	const categoria =
		row.categoria_seleccionada || getTreatmentByValue(row.tipo_trabajo)?.categoria || '';
	const restOpts = { corona_sobre_implante: row.corona_sobre_implante };
	const material = row.material || null;

	if (categoria === 'restauracion' || isRestauracionTipoTrabajo(row.tipo_trabajo)) {
		if (!material) return { incluye_diseno: false, incluye_fresado: false };
		const unitario =
			treatmentHasMaterials(row.tipo_trabajo)
				? getTreatmentMaterialPriceUsd(row.tipo_trabajo, material, restOpts)
				: getRestauracionPrecioUnitarioUsd(row.tipo_trabajo, material, restOpts);
		return { incluye_diseno: false, incluye_fresado: unitario > 0 };
	}

	if (treatmentHasMaterials(row.tipo_trabajo)) {
		if (!material) return { incluye_diseno: false, incluye_fresado: false };
		const unitario = getTreatmentMaterialPriceUsd(row.tipo_trabajo, material, restOpts);
		if (categoria === 'diseno') {
			return { incluye_diseno: unitario > 0, incluye_fresado: false };
		}
		return { incluye_diseno: false, incluye_fresado: unitario > 0 };
	}

	if (categoria === 'diseno') {
		return { incluye_diseno: true, incluye_fresado: false };
	}

	const treatment = getTreatmentByValue(row.tipo_trabajo);
	return {
		incluye_diseno: (treatment?.precio_diseno ?? 0) > 0,
		incluye_fresado: (treatment?.precio_fresado ?? 0) > 0
	};
}
