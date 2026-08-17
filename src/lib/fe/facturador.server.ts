import { env } from '$env/dynamic/private';

const DEFAULT_URL = 'http://localhost:3000';
const REQUEST_TIMEOUT_MS = 120_000;

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

export function getFacturadorBaseUrl(): string {
	return (env.FACTURADOR_URL || DEFAULT_URL).replace(/\/$/, '');
}

function authHeaders(): Record<string, string> {
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	const password = env.FACTURADOR_PASSWORD?.trim();
	if (password) headers['X-Facturador-Password'] = password;
	return headers;
}

function connectionErrorMessage(cause: unknown): string {
	const url = getFacturadorBaseUrl();
	const detail = cause instanceof Error ? cause.message : String(cause);
	const code =
		cause instanceof Error && cause.cause && typeof cause.cause === 'object' && 'code' in cause.cause
			? String((cause.cause as { code?: string }).code)
			: '';

	if (detail.includes('fetch failed') || code === 'ECONNREFUSED' || code === 'ENOTFOUND') {
		return (
			`No se pudo conectar con el Facturador en ${url}. ` +
			`Inicie el servicio Facturador (INTEGRATION_GUIDE.md) o corrija FACTURADOR_URL en .env. ` +
			`Si el Facturador exige contraseña, configure FACTURADOR_PASSWORD.`
		);
	}
	if (detail.includes('Timeout') || detail.includes('timeout')) {
		return `El Facturador en ${url} no respondió a tiempo. Compruebe que el servicio esté activo.`;
	}
	return `Error de red al llamar al Facturador (${url}): ${detail}`;
}

async function facturadorPost(path: string, payload: unknown): Promise<unknown> {
	const url = `${getFacturadorBaseUrl()}${path}`;
	let response: Response;
	try {
		response = await fetch(url, {
			method: 'POST',
			headers: authHeaders(),
			body: JSON.stringify(payload),
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
		});
	} catch (err) {
		throw new Error(connectionErrorMessage(err));
	}

	const text = await response.text();
	let result: Record<string, unknown>;
	try {
		result = text ? (JSON.parse(text) as Record<string, unknown>) : {};
	} catch {
		const snippet = text.slice(0, 120).replace(/\s+/g, ' ');
		throw new Error(
			`El Facturador respondió HTTP ${response.status} con un cuerpo no JSON. ` +
				`¿FACTURADOR_URL apunta al servicio correcto (${getFacturadorBaseUrl()})? ${snippet ? `Inicio: ${snippet}` : ''}`
		);
	}

	if (!response.ok && result.success !== true) {
		const msg = String(result.error ?? result.message ?? `HTTP ${response.status}`);
		throw new Error(msg);
	}

	return result;
}

/** Comprueba conectividad (p. ej. banner en admin facturas). */
export async function checkFacturadorConnection(): Promise<{ ok: boolean; url: string; error?: string }> {
	const url = getFacturadorBaseUrl();
	try {
		const response = await fetch(url, {
			method: 'GET',
			signal: AbortSignal.timeout(5000)
		});
		if (response.ok || response.status < 500) {
			return { ok: true, url };
		}
		return { ok: false, url, error: `HTTP ${response.status}` };
	} catch (err) {
		return { ok: false, url, error: connectionErrorMessage(err) };
	}
}

export async function facturadorValidarEnviar(payload: unknown): Promise<FacturadorEnviarResult> {
	const result = (await facturadorPost('/api/factura/validar?accion=enviar', payload)) as {
		success?: boolean;
		error?: string;
		message?: string;
		errors?: string[];
		data?: FacturadorEnviarData;
	};
	if (!result.success) {
		return {
			ok: false,
			error: result.error ?? result.message ?? 'Validación fallida',
			errors: result.errors
		};
	}
	return { ok: true, data: result.data ?? ({} as FacturadorEnviarData) };
}

export async function facturadorEnviar(payload: unknown): Promise<FacturadorEnviarResult> {
	const result = (await facturadorPost('/api/factura/enviar', payload)) as {
		success?: boolean;
		error?: string;
		message?: string;
		errors?: string[];
		data?: FacturadorEnviarData;
	};
	if (!result.success) {
		return {
			ok: false,
			error: result.error ?? result.message ?? 'Error al enviar comprobante',
			errors: result.errors
		};
	}
	return { ok: true, data: result.data as FacturadorEnviarData, message: result.message };
}

export async function facturadorConsultar(
	clave: string,
	config: Record<string, unknown>
): Promise<FacturadorConsultaResult> {
	const result = (await facturadorPost('/api/factura/consultar', { clave, config })) as {
		success?: boolean;
		estado?: string;
		data?: FacturadorConsultaResult extends { ok: true; data: infer D } ? D : never;
		message?: string;
		error?: string;
	};

	if (result.success && result.data) {
		return {
			ok: true,
			estado: result.data.estado ?? 'aceptado',
			data: result.data
		};
	}

	if (result.estado === 'procesando') {
		return { ok: false, estado: 'procesando', message: result.message ?? 'Aún procesando' };
	}

	return { ok: false, message: result.error ?? result.message ?? 'Consulta fallida' };
}
