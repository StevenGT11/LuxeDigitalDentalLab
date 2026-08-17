export type FeAmbiente = 'staging' | 'production';

export type FeComprobanteEstado =
	| 'pendiente_envio'
	| 'enviado'
	| 'procesando'
	| 'aceptado'
	| 'rechazado'
	| 'error';

export interface FeComprobanteSummary {
	id: string;
	invoice_id: string;
	clave: string | null;
	consecutivo: string | null;
	estado: FeComprobanteEstado;
	hacienda_status: number | null;
	ultimo_error: string | null;
	enviado_at: string | null;
	resuelto_at: string | null;
}

export interface FeEmisorConfigRow {
	id: string;
	ambiente: FeAmbiente;
	activo: boolean;
	tipo_identificacion: string;
	numero_identificacion: string;
	razon_social: string;
	nombre_comercial: string | null;
	codigo_actividad: string;
	casa_matriz: string;
	terminal: string;
	provincia: number;
	canton: string;
	distrito: string;
	otras_senas: string;
	telefono: string;
	correo_electronico: string;
	hacienda_usuario: string;
	hacienda_password: string;
	certificado_p12: string;
	pin_certificado: string;
	updated_at?: string;
}

/** Datos del formulario admin (secretos opcionales al actualizar). */
export interface FeEmisorConfigInput {
	id?: string;
	ambiente: FeAmbiente;
	activo: boolean;
	tipo_identificacion: string;
	numero_identificacion: string;
	razon_social: string;
	nombre_comercial: string;
	codigo_actividad: string;
	casa_matriz: string;
	terminal: string;
	provincia: number;
	canton: string;
	distrito: string;
	otras_senas: string;
	telefono: string;
	correo_electronico: string;
	hacienda_usuario: string;
	hacienda_password?: string;
	pin_certificado?: string;
	certificado_p12?: string;
}

export interface FeEmisorConfigPublic extends Omit<
	FeEmisorConfigInput,
	'hacienda_password' | 'pin_certificado' | 'certificado_p12'
> {
	id: string;
	has_hacienda_password: boolean;
	has_pin: boolean;
	has_certificado: boolean;
	updated_at?: string;
}

/** Datos fiscales del emisor (compartidos entre staging y producción). */
export type FeEmisorProfileInput = Pick<
	FeEmisorConfigInput,
	| 'tipo_identificacion'
	| 'numero_identificacion'
	| 'razon_social'
	| 'nombre_comercial'
	| 'codigo_actividad'
	| 'casa_matriz'
	| 'terminal'
	| 'provincia'
	| 'canton'
	| 'distrito'
	| 'otras_senas'
	| 'telefono'
	| 'correo_electronico'
>;

export type FeEmisorCredentialsInput = {
	id?: string;
	ambiente: FeAmbiente;
	hacienda_usuario: string;
	hacienda_password?: string;
	pin_certificado?: string;
	certificado_p12?: string;
};
