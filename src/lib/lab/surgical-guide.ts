/** Identificador del tratamiento único de guía quirúrgica */
export const GUIA_QUIRURGICA_VALUE = 'guia_quirurgica';

export const IMPLANTES_GUIA_MIN = 1;
export const IMPLANTES_GUIA_MAX = 6;

export const IMPLANTES_GUIA_OPTIONS = [1, 2, 3, 4, 5, 6] as const;

export type ImplantesGuia = (typeof IMPLANTES_GUIA_OPTIONS)[number];

export interface GuiaPrecioTier {
	usd: number;
	crc: number;
}

import { getCatalogSnapshot, isCatalogHydrated } from './catalog-cache';

/** Tarifario guía quirúrgica por cantidad de implantes (fallback local) */
export const GUIA_PRECIOS_POR_IMPLANTES: Record<ImplantesGuia, GuiaPrecioTier> = {
	1: { usd: 240, crc: 120_000 },
	2: { usd: 280, crc: 140_000 },
	3: { usd: 320, crc: 160_000 },
	4: { usd: 350, crc: 175_000 },
	5: { usd: 380, crc: 190_000 },
	6: { usd: 400, crc: 200_000 }
};

function guidePrices(): Record<ImplantesGuia, GuiaPrecioTier> {
	const fromDb = getCatalogSnapshot().guidePrices;
	if (isCatalogHydrated() && Object.keys(fromDb).length > 0) {
		return { ...GUIA_PRECIOS_POR_IMPLANTES, ...fromDb };
	}
	return GUIA_PRECIOS_POR_IMPLANTES;
}

const LEGACY_GUIA_PATTERN = /^guia_(\d)_implantes?$/;

export function isGuiaQuirurgica(tipoTrabajo: string): boolean {
	if (tipoTrabajo === GUIA_QUIRURGICA_VALUE) return true;
	return LEGACY_GUIA_PATTERN.test(tipoTrabajo);
}

export function clampImplantesGuia(value: unknown): ImplantesGuia | null {
	const n = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
	if (!Number.isFinite(n) || n < IMPLANTES_GUIA_MIN || n > IMPLANTES_GUIA_MAX) return null;
	return n as ImplantesGuia;
}

/** Convierte valores legacy (guia_3_implantes) al tratamiento único + cantidad */
export function normalizeGuiaTipoTrabajo(tipoTrabajo: string): {
	tipo_trabajo: string;
	implantes_guia: ImplantesGuia | null;
} {
	const legacy = LEGACY_GUIA_PATTERN.exec(tipoTrabajo);
	if (legacy) {
		const implantes = clampImplantesGuia(Number(legacy[1]));
		return { tipo_trabajo: GUIA_QUIRURGICA_VALUE, implantes_guia: implantes };
	}
	if (tipoTrabajo === GUIA_QUIRURGICA_VALUE) {
		return { tipo_trabajo: GUIA_QUIRURGICA_VALUE, implantes_guia: null };
	}
	return { tipo_trabajo: tipoTrabajo, implantes_guia: null };
}

export function getGuiaPrecio(implantes: number): GuiaPrecioTier | null {
	const n = clampImplantesGuia(implantes);
	if (!n) return null;
	return guidePrices()[n];
}

export function getGuiaPrecioUsd(implantes: number): number {
	return getGuiaPrecio(implantes)?.usd ?? 0;
}

export function getGuiaPrecioCrc(implantes: number): number {
	return getGuiaPrecio(implantes)?.crc ?? 0;
}

export function formatImplantesGuiaLabel(implantes: number): string {
	const n = clampImplantesGuia(implantes);
	if (!n) return '';
	return n === 1 ? '1 implante' : `${n} implantes`;
}
