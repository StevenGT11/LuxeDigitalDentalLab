import { env } from '$env/dynamic/private';
import { enviarFacturaConDesgloseExento } from './facturador-enviar.server';
import { installFacturadorExemptDesglosePatch } from './facturador-patch.server';

export const FACTURADOR_LIBRARY_LABEL = '@happy-prod/facturador';

type FacturadorLib = typeof import('@happy-prod/facturador');
let facturadorLib: FacturadorLib | null = null;

/** Load facturador after exempt-desglose patch (Hacienda -488). */
async function getFacturador(): Promise<FacturadorLib> {
	if (!facturadorLib) {
		installFacturadorExemptDesglosePatch();
		facturadorLib = await import('@happy-prod/facturador');
	}
	return facturadorLib;
}

export type FacturadorEnviarData = {
	clave: string;
	consecutivo: string;
	tipo_documento: string;
	fecha_emision?: string;
	subtotal?: number;
	impuesto?: number;
	total?: number;
	moneda?: string;
	hacienda_status?: number;
	xml?: string;
};

export type FacturadorEnviarResult =
	| { ok: true; data: FacturadorEnviarData; message?: string }
	| { ok: false; error: string; errors?: string[] };

export type FacturadorConsultaResult =
	| {
			ok: true;
			estado: 'aceptado' | 'rechazado' | string;
			data: {
				clave: string;
				respuesta_xml?: string;
				rechazo?: Record<string, unknown>;
				detalle_mensaje?: string;
			};
	  }
	| { ok: false; estado?: 'procesando' | string; message: string };

type LibraryResult = {
	success?: boolean;
	error?: string;
	message?: string;
	errors?: string[];
	estado?: string;
	data?: Record<string, unknown>;
};

/** @deprecated HTTP mode removed — library runs in-process. */
export function getFacturadorBaseUrl(): string {
	return FACTURADOR_LIBRARY_LABEL;
}

/** Verifies the npm library is loaded (no external HTTP server required). */
export async function checkFacturadorConnection(): Promise<{ ok: boolean; url: string; error?: string }> {
	const url = FACTURADOR_LIBRARY_LABEL;
	try {
		const { validarFactura, enviarFactura } = await getFacturador();
		if (typeof validarFactura !== 'function' || typeof enviarFactura !== 'function') {
			return {
				ok: false,
				url,
				error: 'No se pudo cargar @happy-prod/facturador. Ejecute npm install.'
			};
		}
		return { ok: true, url };
	} catch (err) {
		return {
			ok: false,
			url,
			error: err instanceof Error ? err.message : 'Error al cargar @happy-prod/facturador'
		};
	}
}

export async function facturadorValidarEnviar(payload: unknown): Promise<FacturadorEnviarResult> {
	const { validarFactura } = await getFacturador();
	const result = validarFactura(payload as object, { requireHacienda: true }) as LibraryResult;
	if (!result.success) {
		return {
			ok: false,
			error: result.error ?? result.message ?? 'Validación fallida',
			errors: result.errors
		};
	}
	return { ok: true, data: (result.data ?? {}) as FacturadorEnviarData };
}

export async function facturadorEnviar(payload: unknown): Promise<FacturadorEnviarResult> {
	try {
		const result = (await enviarFacturaConDesgloseExento(payload as object)) as LibraryResult;
		if (!result.success) {
			return {
				ok: false,
				error: result.error ?? result.message ?? 'Error al enviar comprobante',
				errors: result.errors
			};
		}
		return {
			ok: true,
			data: result.data as FacturadorEnviarData,
			message: result.message
		};
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : 'Error al enviar comprobante'
		};
	}
}

export async function facturadorConsultar(
	clave: string,
	config: Record<string, unknown>
): Promise<FacturadorConsultaResult> {
	try {
		const { consultarFactura } = await getFacturador();
		const result = (await consultarFactura({ clave, config })) as LibraryResult;

		if (result.success && result.data) {
			const data = result.data as FacturadorConsultaResult extends { ok: true; data: infer D } ? D : never;
			return {
				ok: true,
				estado: (result.data.estado as string) ?? 'aceptado',
				data
			};
		}

		if (result.estado === 'procesando') {
			return { ok: false, estado: 'procesando', message: result.message ?? 'Aún procesando' };
		}

		return {
			ok: false,
			message: result.error ?? result.message ?? 'Consulta fallida'
		};
	} catch (err) {
		return {
			ok: false,
			message: err instanceof Error ? err.message : 'Consulta fallida'
		};
	}
}

export function getFacturadorProjectName(): string {
	return env.FACTURADOR_PROJECT_NAME?.trim() || 'luxe-digital-dental-lab';
}
