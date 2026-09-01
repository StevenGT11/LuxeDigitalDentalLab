export type FeRecibidoEstado =
	| 'pendiente_aceptacion'
	| 'mensaje_enviado'
	| 'aceptado'
	| 'rechazado'
	| 'vencido';

export type FeMensajeReceptorTipo = 'aceptado' | 'aceptado_parcial' | 'rechazado';

export type FeRecibidoRow = {
	id: string;
	clave: string;
	tipo_documento: string;
	emisor_tipo_identificacion: string;
	emisor_numero_identificacion: string;
	emisor_nombre: string;
	fecha_emision: string;
	subtotal: number;
	impuesto: number;
	total: number;
	moneda: string;
	estado: FeRecibidoEstado;
	plazo_limite: string | null;
	notas: string | null;
	ambiente: 'staging' | 'production';
	created_at: string;
	updated_at: string;
};

export type FeMensajeReceptorRow = {
	id: string;
	fe_recibido_id: string;
	mensaje: FeMensajeReceptorTipo;
	detalle_mensaje: string;
	consecutivo_num: number;
	clave: string | null;
	consecutivo: string | null;
	estado: string;
	hacienda_status: number | null;
	ultimo_error: string | null;
	enviado_at: string | null;
	resuelto_at: string | null;
	ambiente: 'staging' | 'production';
};

export type FeRecibidoListItem = FeRecibidoRow & {
	ultimo_mensaje: FeMensajeReceptorRow | null;
};

export type ParsedRecibidoXml = {
	clave: string;
	tipo_documento: string;
	emisor_tipo_identificacion: string;
	emisor_numero_identificacion: string;
	emisor_nombre: string;
	fecha_emision: string;
	fecha_emision_doc_raw: string;
	subtotal: number;
	impuesto: number;
	total: number;
	moneda: string;
};
