import { getCatalogSnapshot } from './catalog-cache';

/** Tratamientos del catálogo que pueden ir sobre implante (checkbox + datos del implante). */
export function isSobreImplanteTreatment(tipoTrabajo: string): boolean {
	return (
		getCatalogSnapshot().treatments.find((t) => t.value === tipoTrabajo)?.sobre_implante === true
	);
}
