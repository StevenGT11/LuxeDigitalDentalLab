import { getCatalogSnapshot, isCatalogHydrated } from './catalog-cache';
import {
	PRECIO_ADDON_CORONA_SOBRE_IMPLANTE_CRC,
	PRECIO_ADDON_CORONA_SOBRE_IMPLANTE_USD,
	PRECIO_DISENO_UNIDAD_RESTAURACION_CRC,
	PRECIO_DISENO_UNIDAD_RESTAURACION_USD,
	PRECIO_FRESADO_RESTAURACION_CRC,
	PRECIO_FRESADO_RESTAURACION_USD
} from './treatment-catalog';

/** Materiales de restauración (definen tarifa de fresado/diseño) */
export type MaterialRestauracion = 'zirconio' | 'disilicato' | 'impreso';

export const MATERIALES_RESTAURACION: { value: MaterialRestauracion; label: string }[] = [
	{ value: 'zirconio', label: 'Zirconio' },
	{ value: 'disilicato', label: 'Disilicato (silicato / vioclear)' },
	{ value: 'impreso', label: 'Impreso (resina)' }
];

/** Tratamientos retirados del catálogo (misma pieza que inlay/onlay u otro tipo unificado) */
export const DEPRECATED_RESTORATION_VALUES = new Set([
	'rest_incrustacion',
	'rest_veneer',
	'rest_corona_implante',
	'rest_ferula_impresa'
]);

/** Orden de tipos en UI (categoría Restauración) */
export const RESTAURACION_VALUE_ORDER: string[] = [
	'rest_corona',
	'rest_carilla',
	'rest_puente',
	'rest_inlay',
	'rest_onlay',
	'rest_pilar',
	'rest_estructura_zirconio',
	'rest_modelo_resina',
	'rest_completo_arc',
	'rest_resina_larga_duracion',
	'rest_resina_provisional',
	'rest_provisional_aletas',
	'rest_mockup_arcada'
];

export function restauracionSortIndex(value: string): number {
	const tipo = resolveRestauracionTipoTrabajo(value);
	const i = RESTAURACION_VALUE_ORDER.indexOf(tipo);
	return i >= 0 ? i : RESTAURACION_VALUE_ORDER.length + 1;
}

export function getMaterialRestauracionLabel(value: string | null | undefined): string {
	if (!value) return '—';
	return MATERIALES_RESTAURACION.find((m) => m.value === value)?.label ?? value;
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

const STD: RestauracionPrecio = {
	precio_diseno: PRECIO_DISENO_UNIDAD_RESTAURACION_USD,
	precio_fresado: PRECIO_FRESADO_RESTAURACION_USD,
	precio_crc_diseno: PRECIO_DISENO_UNIDAD_RESTAURACION_CRC,
	precio_crc_fresado: PRECIO_FRESADO_RESTAURACION_CRC
};

function soloFresado(usd: number, crc: number): RestauracionPrecio {
	return { precio_diseno: 0, precio_fresado: usd, precio_crc_diseno: 0, precio_crc_fresado: crc };
}

function withCoronaImplante(base: RestauracionPrecio): RestauracionPrecio {
	const addon = getCatalogSnapshot().addons.get('corona_sobre_implante');
	const dUsd = addon?.precio_diseno_usd ?? PRECIO_ADDON_CORONA_SOBRE_IMPLANTE_USD;
	const fUsd = addon?.precio_fresado_usd ?? PRECIO_ADDON_CORONA_SOBRE_IMPLANTE_USD;
	const dCrc = addon?.precio_diseno_crc ?? PRECIO_ADDON_CORONA_SOBRE_IMPLANTE_CRC;
	const fCrc = addon?.precio_fresado_crc ?? PRECIO_ADDON_CORONA_SOBRE_IMPLANTE_CRC;
	return {
		precio_diseno: base.precio_diseno + dUsd,
		precio_fresado: base.precio_fresado + fUsd,
		precio_crc_diseno: base.precio_crc_diseno + dCrc,
		precio_crc_fresado: base.precio_crc_fresado + fCrc
	};
}

function getMatrixRow(tipo: string): Partial<Record<MaterialRestauracion, RestauracionPrecio>> | undefined {
	if (isCatalogHydrated()) {
		return getCatalogSnapshot().restorationMatrix.get(tipo);
	}
	return MATRIX[tipo];
}

/** Tarifa por tipo de pieza × material */
const MATRIX: Record<string, Partial<Record<MaterialRestauracion, RestauracionPrecio>>> = {
	rest_corona: { zirconio: STD, disilicato: STD },
	rest_inlay: { zirconio: STD, disilicato: STD },
	rest_onlay: { zirconio: STD, disilicato: STD },
	rest_carilla: { zirconio: STD, disilicato: STD },
	rest_puente: { zirconio: STD, disilicato: STD },
	rest_pilar: { zirconio: STD, disilicato: STD },
	rest_estructura_zirconio: {
		zirconio: soloFresado(1800, 900_000)
	},
	rest_modelo_resina: { impreso: soloFresado(10, 5_000) },
	rest_completo_arc: { impreso: soloFresado(500, 250_000) },
	rest_resina_larga_duracion: { impreso: soloFresado(50, 20_000) },
	rest_resina_provisional: { impreso: soloFresado(30, 10_000) },
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
	zirconio_estructura_sin_tibases: { tipo: 'rest_estructura_zirconio', material: 'zirconio' },
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
	imp_resina_larga_duracion: { tipo: 'rest_resina_larga_duracion', material: 'impreso' },
	imp_resina_provisional: { tipo: 'rest_resina_provisional', material: 'impreso' },
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

export function resolveRestauracionTipoTrabajo(tipoTrabajo: string): string {
	return LEGACY[tipoTrabajo]?.tipo ?? tipoTrabajo;
}

export function resolveRestauracionMaterial(
	tipoTrabajo: string,
	material: string | null | undefined
): MaterialRestauracion | null {
	const legacy = LEGACY[tipoTrabajo];
	if (legacy) return legacy.material;
	if (material === 'zirconio' || material === 'disilicato' || material === 'impreso') {
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

export function getMaterialesRestauracion(tipoTrabajo: string): MaterialRestauracion[] {
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
	const sobreImplante =
		tipo === 'rest_corona' &&
		resolveCoronaSobreImplante(tipoTrabajo, opciones?.corona_sobre_implante);
	return sobreImplante ? withCoronaImplante(base) : base;
}

/** Sin material por defecto: el usuario debe elegir en el paso «Material». */
export function getDefaultMaterialRestauracion(_tipoTrabajo: string): MaterialRestauracion | '' {
	return '';
}
