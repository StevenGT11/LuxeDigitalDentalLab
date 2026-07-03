import { getCatalogSnapshot, isCatalogHydrated } from './catalog-cache';
import { isSobreImplanteTreatment } from './sobre-implante';
import {
	getTreatmentMaterialPriceUsd,
	getTreatmentMaterials,
	treatmentHasMaterials
} from './treatment-materials';
import {
	PRECIO_ADDON_CORONA_SOBRE_IMPLANTE_CRC,
	PRECIO_ADDON_CORONA_SOBRE_IMPLANTE_USD,
	PRECIO_DISENO_UNIDAD_RESTAURACION_CRC,
	PRECIO_DISENO_UNIDAD_RESTAURACION_USD,
	PRECIO_FRESADO_RESTAURACION_CRC,
	PRECIO_FRESADO_RESTAURACION_USD
} from './treatment-catalog';

/** Materiales de restauración (definen tarifa de fresado/diseño) */
export type MaterialRestauracion =
	| 'zirconio'
	| 'disilicato'
	| 'impreso'
	| 'resina_larga_duracion'
	| 'resina_provisional';

export const MATERIALES_RESTAURACION: { value: MaterialRestauracion; label: string }[] = [
	{ value: 'zirconio', label: 'Zirconio' },
	{ value: 'disilicato', label: 'Disilicato (silicato / vioclear)' },
	{ value: 'resina_larga_duracion', label: 'Resina de larga duración' },
	{ value: 'resina_provisional', label: 'Resina provisional' },
	{ value: 'impreso', label: 'Impreso (resina)' }
];

/** Tratamientos retirados del catálogo (misma pieza que inlay/onlay u otro tipo unificado) */
export const DEPRECATED_RESTORATION_VALUES = new Set([
	'rest_incrustacion',
	'rest_veneer',
	'rest_corona_implante',
	'rest_ferula_impresa',
	'rest_resina_larga_duracion',
	'rest_resina_provisional'
]);

/** Orden de tipos en UI (categoría Restauración) */
export const RESTAURACION_VALUE_ORDER: string[] = [
	'rest_corona',
	'rest_carilla',
	'rest_puente',
	'rest_inlay',
	'rest_onlay',
	'rest_pilar',
	'rest_estructura',
	'rest_modelo_resina',
	'rest_completo_arc',
	'rest_provisional_aletas',
	'rest_mockup_arcada'
];

export function restauracionSortIndex(value: string): number {
	const tipo = resolveRestauracionTipoTrabajo(value);
	const i = RESTAURACION_VALUE_ORDER.indexOf(tipo);
	return i >= 0 ? i : RESTAURACION_VALUE_ORDER.length + 1;
}

export function getMaterialRestauracionLabel(
	value: string | null | undefined,
	treatmentSlug?: string | null
): string {
	if (!value) return '—';
	if (treatmentSlug) {
		const fromTreatment = getTreatmentMaterials(treatmentSlug).find((m) => m.key === value);
		if (fromTreatment) return fromTreatment.label;
	}
	return MATERIALES_RESTAURACION.find((m) => m.value === value)?.label ?? value.replace(/_/g, ' ');
}

export interface RestauracionPrecio {
	precio_diseno: number;
	precio_fresado: number;
	precio_crc_diseno: number;
	precio_crc_fresado: number;
}

export interface RestauracionPrecioOpciones {
	corona_sobre_implante?: boolean;
}

function soloFresado(usd: number, crc: number): RestauracionPrecio {
	return { precio_diseno: 0, precio_fresado: usd, precio_crc_diseno: 0, precio_crc_fresado: crc };
}

function withCoronaImplante(base: RestauracionPrecio): RestauracionPrecio {
	const addon = getCatalogSnapshot().addons.get('corona_sobre_implante');
	const dUsd = addon?.precio_diseno_usd ?? PRECIO_ADDON_CORONA_SOBRE_IMPLANTE_USD;
	const fUsd = addon?.precio_fresado_usd ?? PRECIO_ADDON_CORONA_SOBRE_IMPLANTE_USD;
	const dCrc = addon?.precio_diseno_crc ?? PRECIO_ADDON_CORONA_SOBRE_IMPLANTE_CRC;
	const fCrc = addon?.precio_fresado_crc ?? PRECIO_ADDON_CORONA_SOBRE_IMPLANTE_CRC;
	if (base.precio_diseno === 0 && base.precio_crc_diseno === 0) {
		return {
			...base,
			precio_fresado: base.precio_fresado + dUsd + fUsd,
			precio_crc_fresado: base.precio_crc_fresado + dCrc + fCrc
		};
	}
	return {
		precio_diseno: base.precio_diseno + dUsd,
		precio_fresado: base.precio_fresado + fUsd,
		precio_crc_diseno: base.precio_crc_diseno + dCrc,
		precio_crc_fresado: base.precio_crc_fresado + fCrc
	};
}

/** Precio único por pieza (diseño incluido en restauraciones). */
export function normalizeRestauracionPrecio(p: RestauracionPrecio): RestauracionPrecio {
	if (p.precio_diseno === 0 && p.precio_crc_diseno === 0) return p;
	return soloFresado(
		p.precio_diseno + p.precio_fresado,
		p.precio_crc_diseno + p.precio_crc_fresado
	);
}

export function getRestauracionPrecioUnitarioUsd(
	tipoTrabajo: string,
	material: string | null | undefined,
	opciones?: RestauracionPrecioOpciones
): number {
	if (treatmentHasMaterials(tipoTrabajo) && material) {
		return getTreatmentMaterialPriceUsd(tipoTrabajo, material, opciones);
	}
	return getRestauracionPrecio(tipoTrabajo, material, opciones)?.precio_fresado ?? 0;
}

export function getRestauracionPrecioUnitarioCrc(
	tipoTrabajo: string,
	material: string | null | undefined,
	opciones?: RestauracionPrecioOpciones
): number {
	return getRestauracionPrecio(tipoTrabajo, material, opciones)?.precio_crc_fresado ?? 0;
}

function getMatrixRow(tipo: string): Partial<Record<MaterialRestauracion, RestauracionPrecio>> | undefined {
	if (isCatalogHydrated()) {
		return getCatalogSnapshot().restorationMatrix.get(tipo);
	}
	return MATRIX[tipo];
}

const ZIRCONIO = soloFresado(
	PRECIO_DISENO_UNIDAD_RESTAURACION_USD + PRECIO_FRESADO_RESTAURACION_USD,
	PRECIO_DISENO_UNIDAD_RESTAURACION_CRC + PRECIO_FRESADO_RESTAURACION_CRC
);

const DISILICATO = soloFresado(108, 54_000);

const RESINA_LARGA_DURACION = soloFresado(50, 20_000);
const RESINA_PROVISIONAL = soloFresado(30, 10_000);

const RESTAURACION_CON_RESINAS: Partial<Record<MaterialRestauracion, RestauracionPrecio>> = {
	zirconio: ZIRCONIO,
	disilicato: DISILICATO,
	resina_larga_duracion: RESINA_LARGA_DURACION,
	resina_provisional: RESINA_PROVISIONAL
};

/** Tarifa por tipo de pieza × material */
const MATRIX: Record<string, Partial<Record<MaterialRestauracion, RestauracionPrecio>>> = {
	rest_corona: RESTAURACION_CON_RESINAS,
	rest_inlay: RESTAURACION_CON_RESINAS,
	rest_onlay: RESTAURACION_CON_RESINAS,
	rest_carilla: RESTAURACION_CON_RESINAS,
	rest_puente: RESTAURACION_CON_RESINAS,
	rest_pilar: { zirconio: ZIRCONIO, disilicato: DISILICATO },
	rest_estructura: {
		zirconio: soloFresado(1800, 900_000),
		resina_larga_duracion: soloFresado(500, 250_000)
	},
	rest_modelo_resina: { impreso: soloFresado(10, 5_000) },
	rest_completo_arc: { impreso: soloFresado(500, 250_000) },
	rest_provisional_aletas: { impreso: soloFresado(50, 25_000) },
	rest_mockup_arcada: { impreso: soloFresado(100, 50_000) }
};

type LegacyMap = {
	tipo: string;
	material: MaterialRestauracion;
	corona_sobre_implante?: boolean;
};

/** Valores antiguos del catálogo → tipo + material (+ add-ons) */
const LEGACY: Record<string, LegacyMap> = {
	zirconio_corona: { tipo: 'rest_corona', material: 'zirconio' },
	zirconio_corona_implante: { tipo: 'rest_corona', material: 'zirconio', corona_sobre_implante: true },
	rest_corona_implante: { tipo: 'rest_corona', material: 'zirconio', corona_sobre_implante: true },
	zirconio_inlay: { tipo: 'rest_inlay', material: 'zirconio' },
	zirconio_onlay: { tipo: 'rest_onlay', material: 'zirconio' },
	zirconio_veneer: { tipo: 'rest_carilla', material: 'zirconio' },
	rest_veneer: { tipo: 'rest_carilla', material: 'zirconio' },
	zirconio_unidad_puente: { tipo: 'rest_puente', material: 'zirconio' },
	zirconio_pilar_personalizado: { tipo: 'rest_pilar', material: 'zirconio' },
	zirconio_estructura_sin_tibases: { tipo: 'rest_estructura', material: 'zirconio' },
	silicato_corona: { tipo: 'rest_corona', material: 'disilicato' },
	silicato_carilla: { tipo: 'rest_carilla', material: 'disilicato' },
	silicato_veneer: { tipo: 'rest_carilla', material: 'disilicato' },
	silicato_inlay: { tipo: 'rest_inlay', material: 'disilicato' },
	silicato_onlay: { tipo: 'rest_onlay', material: 'disilicato' },
	silicato_unidad_puente: { tipo: 'rest_puente', material: 'disilicato' },
	/** Incrustación = inlay (retirada del catálogo) */
	silicato_incrustacion: { tipo: 'rest_inlay', material: 'disilicato' },
	rest_incrustacion: { tipo: 'rest_inlay', material: 'disilicato' },
	imp_modelo_resina: { tipo: 'rest_modelo_resina', material: 'impreso' },
	imp_ferula: { tipo: 'ferula_impresa', material: 'impreso' },
	rest_ferula_impresa: { tipo: 'ferula_impresa', material: 'impreso' },
	imp_completo_arc: { tipo: 'rest_completo_arc', material: 'impreso' },
	rest_resina_larga_duracion: { tipo: 'rest_corona', material: 'resina_larga_duracion' },
	rest_resina_provisional: { tipo: 'rest_corona', material: 'resina_provisional' },
	imp_resina_larga_duracion: { tipo: 'rest_corona', material: 'resina_larga_duracion' },
	imp_resina_provisional: { tipo: 'rest_corona', material: 'resina_provisional' },
	imp_provisional_aletas: { tipo: 'rest_provisional_aletas', material: 'impreso' },
	imp_arcada_mockup: { tipo: 'rest_mockup_arcada', material: 'impreso' }
};

export function isCoronaRestauracion(tipoTrabajo: string): boolean {
	return resolveRestauracionTipoTrabajo(tipoTrabajo) === 'rest_corona';
}

export function isRestauracionTipoTrabajo(tipoTrabajo: string): boolean {
	if (!tipoTrabajo) return false;
	if (tipoTrabajo.startsWith('rest_')) return true;
	return tipoTrabajo in LEGACY;
}

const TIPO_TRABAJO_ALIASES: Record<string, string> = {
	rest_estructura_zirconio: 'rest_estructura'
};

export function resolveRestauracionTipoTrabajo(tipoTrabajo: string): string {
	if (LEGACY[tipoTrabajo]) return LEGACY[tipoTrabajo].tipo;
	return TIPO_TRABAJO_ALIASES[tipoTrabajo] ?? tipoTrabajo;
}

export function resolveRestauracionMaterial(
	tipoTrabajo: string,
	material: string | null | undefined
): MaterialRestauracion | null {
	const legacy = LEGACY[tipoTrabajo];
	if (legacy) return legacy.material;
	if (
		material === 'zirconio' ||
		material === 'disilicato' ||
		material === 'impreso' ||
		material === 'resina_larga_duracion' ||
		material === 'resina_provisional'
	) {
		return material;
	}
	if (material === 'emax') return 'disilicato';
	if (material === 'resina' || material === 'pmma') return 'impreso';
	return null;
}

export function resolveCoronaSobreImplante(
	tipoTrabajo: string,
	corona_sobre_implante?: boolean | null
): boolean {
	if (corona_sobre_implante === true) return true;
	const legacy = LEGACY[tipoTrabajo];
	return legacy?.corona_sobre_implante === true;
}

export function normalizeRestauracionItem(input: {
	tipo_trabajo: string;
	material: string | null | undefined;
	corona_sobre_implante?: boolean | null;
}): {
	tipo_trabajo: string;
	material: MaterialRestauracion | null;
	corona_sobre_implante: boolean;
} {
	const legacy = LEGACY[input.tipo_trabajo];
	if (legacy) {
		const material =
			resolveRestauracionMaterial(legacy.tipo, input.material) ?? legacy.material;
		return {
			tipo_trabajo: legacy.tipo,
			material,
			corona_sobre_implante:
				input.corona_sobre_implante === true || legacy.corona_sobre_implante === true
		};
	}
	const tipo = input.tipo_trabajo;
	const material = resolveRestauracionMaterial(tipo, input.material);
	const sobreImplante = resolveCoronaSobreImplante(tipo, input.corona_sobre_implante);
	return { tipo_trabajo: tipo, material, corona_sobre_implante: sobreImplante };
}

export function getMaterialesRestauracion(tipoTrabajo: string): string[] {
	const fromCatalog = getTreatmentMaterials(tipoTrabajo).map((m) => m.key);
	if (fromCatalog.length > 0) return fromCatalog;
	const tipo = resolveRestauracionTipoTrabajo(tipoTrabajo);
	const row = getMatrixRow(tipo);
	if (!row) return ['zirconio', 'disilicato'];
	return (Object.keys(row) as MaterialRestauracion[]).filter((m) => row[m] != null);
}

export function getRestauracionPrecio(
	tipoTrabajo: string,
	material: string | null | undefined,
	opciones?: RestauracionPrecioOpciones
): RestauracionPrecio | null {
	const tipo = resolveRestauracionTipoTrabajo(tipoTrabajo);
	const mat = resolveRestauracionMaterial(tipoTrabajo, material);
	if (!mat) return null;
	const base = getMatrixRow(tipo)?.[mat];
	if (!base) return null;
	const normalized = normalizeRestauracionPrecio(base);
	const sobreImplante =
		isSobreImplanteTreatment(tipoTrabajo) &&
		resolveCoronaSobreImplante(tipoTrabajo, opciones?.corona_sobre_implante);
	return sobreImplante ? withCoronaImplante(normalized) : normalized;
}

/** Sin material por defecto: el usuario debe elegir en el paso «Material». */
export function getDefaultMaterialRestauracion(_tipoTrabajo: string): MaterialRestauracion | '' {
	return '';
}
