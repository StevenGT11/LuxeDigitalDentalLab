/** Versión del catálogo — incrementar para volver a cargar tarifas por defecto */
export const TREATMENT_CATALOG_VERSION = 9;

/** Recargo corona sobre implante (add-on dentro de Corona) */
export const PRECIO_ADDON_CORONA_SOBRE_IMPLANTE_USD = 15;
export const PRECIO_ADDON_CORONA_SOBRE_IMPLANTE_CRC = 7_500;

/** Diseño CAD por pieza (unidad de restauración) */
export const PRECIO_DISENO_UNIDAD_RESTAURACION_USD = 8;
export const PRECIO_DISENO_UNIDAD_RESTAURACION_CRC = 4_000;

/** Fresado / fabricación por pieza (restauraciones estándar zirconio / disilicato) */
export const PRECIO_FRESADO_RESTAURACION_USD = 90;
export const PRECIO_FRESADO_RESTAURACION_CRC = 45_000;

export type TreatmentCategory = 'diseno' | 'restauracion' | 'guias' | 'otros';

export interface CatalogTreatment {
	id: string;
	value: string;
	label: string;
	categoria: TreatmentCategory;
	/** Referencia zirconio (precio real según material en restoration-pricing) */
	precio_diseno: number;
	precio_fresado: number;
	precio_crc_diseno: number;
	precio_crc_fresado: number;
	precio_crc: number;
	activo: boolean;
}

export const TREATMENT_CATEGORY_ORDER: TreatmentCategory[] = [
	'diseno',
	'restauracion',
	'guias',
	'otros'
];

export const TREATMENT_CATEGORY_LABELS: Record<TreatmentCategory, string> = {
	diseno: 'Diseño',
	restauracion: 'Restauración',
	guias: 'Guías quirúrgicas',
	otros: 'Otros'
};

/** Solo restauración usa odontograma (pieza a pieza) */
export function treatmentRequiresTeeth(categoria: TreatmentCategory | ''): boolean {
	return categoria === 'restauracion';
}

type Billing = 'diseno' | 'fresado' | 'ambos';

function catalogEntry(
	id: string,
	value: string,
	label: string,
	categoria: TreatmentCategory,
	usd: number,
	crc: number,
	billing: Billing
): CatalogTreatment {
	const precio_diseno =
		billing === 'diseno' || billing === 'ambos'
			? billing === 'ambos'
				? PRECIO_DISENO_UNIDAD_RESTAURACION_USD
				: usd
			: 0;
	const precio_fresado = billing === 'fresado' || billing === 'ambos' ? usd : 0;
	const precio_crc_diseno =
		billing === 'diseno' ? crc : billing === 'ambos' ? PRECIO_DISENO_UNIDAD_RESTAURACION_CRC : 0;
	const precio_crc_fresado = billing === 'fresado' || billing === 'ambos' ? crc : 0;
	const precio_crc = precio_crc_diseno + precio_crc_fresado;

	return {
		id,
		value,
		label,
		categoria,
		precio_diseno,
		precio_fresado,
		precio_crc_diseno,
		precio_crc_fresado,
		precio_crc,
		activo: true
	};
}

/** Pieza estándar (tarifa zirconio de referencia en catálogo; el material ajusta el precio) */
function catalogEntryRestauracion(id: string, value: string, label: string): CatalogTreatment {
	return catalogEntry(
		id,
		value,
		label,
		'restauracion',
		PRECIO_FRESADO_RESTAURACION_USD,
		PRECIO_FRESADO_RESTAURACION_CRC,
		'ambos'
	);
}

function catalogEntryRestauracionSoloFresado(
	id: string,
	value: string,
	label: string,
	usd: number,
	crc: number
): CatalogTreatment {
	return catalogEntry(id, value, label, 'restauracion', usd, crc, 'fresado');
}

export const LUXE_TREATMENT_CATALOG: CatalogTreatment[] = [
	// ——— DISEÑO ———
	catalogEntry('tr-ferula-diseno', 'ferula_diseno', 'Férula', 'diseno', 30, 15_000, 'diseno'),
	catalogEntry(
		'tr-modelos-fundas-blanqueamiento',
		'modelos_fundas_blanqueamiento',
		'Modelos para fundas de blanqueamiento (2)',
		'diseno',
		20,
		10_000,
		'diseno'
	),
	catalogEntry('tr-carga-inmediata', 'carga_inmediata', 'Carga inmediata', 'diseno', 200, 100_000, 'diseno'),
	catalogEntry(
		'tr-diseno-arcada-completa',
		'diseno_arcada_completa',
		'Diseño de arcada completa',
		'diseno',
		100,
		50_000,
		'diseno'
	),

	// ——— RESTAURACIÓN (orden: corona → carilla → puente → inlay → onlay → …) ———
	catalogEntryRestauracion('tr-rest-corona', 'rest_corona', 'Corona'),
	catalogEntryRestauracion('tr-rest-carilla', 'rest_carilla', 'Carilla'),
	catalogEntryRestauracion('tr-rest-puente', 'rest_puente', 'Puente'),
	catalogEntryRestauracion('tr-rest-inlay', 'rest_inlay', 'Inlay'),
	catalogEntryRestauracion('tr-rest-onlay', 'rest_onlay', 'Onlay'),
	catalogEntryRestauracion('tr-rest-pilar', 'rest_pilar', 'Pilar personalizado'),
	catalogEntryRestauracionSoloFresado(
		'tr-rest-estructura',
		'rest_estructura_zirconio',
		'Estructura de zirconio (sin tibases)',
		1800,
		900_000
	),
	catalogEntryRestauracionSoloFresado('tr-rest-mod-resina', 'rest_modelo_resina', 'Modelo de resina', 10, 5_000),
	catalogEntryRestauracionSoloFresado('tr-rest-ferula-imp', 'rest_ferula_impresa', 'Férula impresa', 100, 50_000),
	catalogEntryRestauracionSoloFresado(
		'tr-rest-completo-arc',
		'rest_completo_arc',
		'Completo arc (prótesis implantada de larga duración)',
		500,
		250_000
	),
	catalogEntryRestauracionSoloFresado(
		'tr-rest-resina-larga',
		'rest_resina_larga_duracion',
		'Restauración resina de larga duración (unidad)',
		50,
		20_000
	),
	catalogEntryRestauracionSoloFresado(
		'tr-rest-resina-prov',
		'rest_resina_provisional',
		'Restauración resina provisional',
		30,
		10_000
	),
	catalogEntryRestauracionSoloFresado(
		'tr-rest-prov-aletas',
		'rest_provisional_aletas',
		'Provisional con aletas (unidad)',
		50,
		25_000
	),
	catalogEntryRestauracionSoloFresado(
		'tr-rest-mockup',
		'rest_mockup_arcada',
		'Arcada completa (mock up)',
		100,
		50_000
	),

	// ——— GUÍA QUIRÚRGICA ———
	catalogEntry('tr-guia-quirurgica', 'guia_quirurgica', 'Guía quirúrgica', 'guias', 0, 0, 'diseno'),

	// ——— OTROS ———
	catalogEntry(
		'tr-fundas-blanqueamiento',
		'fundas_blanqueamiento',
		'Fundas de blanqueamiento',
		'otros',
		40,
		20_000,
		'diseno'
	),
	catalogEntry(
		'tr-retenedores-ortodoncia',
		'retenedores_ortodoncia',
		'Retenedores de ortodoncia (ambas arcadas)',
		'otros',
		60,
		30_000,
		'diseno'
	)
];
