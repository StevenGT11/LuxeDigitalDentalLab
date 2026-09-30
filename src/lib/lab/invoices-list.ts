import type { FeComprobanteEstado, FeComprobanteSummary } from '$lib/fe/types';
import type { InvoiceEstado } from './types';

/** NC o ND asociada a una factura, para listados. */
export type InvoiceListNota = {
	id: string;
	tipo_documento: string;
	consecutivo: string | null;
	clave: string | null;
	estado: FeComprobanteEstado;
	total: number;
	moneda: string;
	enviado_at: string | null;
};

/** Campos mínimos para la tabla de facturas (sin líneas). */
export type InvoiceListRow = {
	id: string;
	invoice_number: string;
	client_id: string;
	client_name: string;
	client_clinica: string;
	case_id: string;
	case_number: string;
	paciente_name: string;
	total: number;
	fecha_emision: string;
	estado: InvoiceEstado;
	fe: FeComprobanteSummary | null;
	notas: InvoiceListNota[];
	/** NC aceptada + factura corregida (solo cuando FE original está aceptada). */
	reemit?: {
		ncAceptada: boolean;
		correctionInvoiceId: string | null;
		correctionInvoiceNumber: string | null;
	};
};

export const INVOICE_LIST_PAGE_SIZES = [10, 15, 25, 50] as const;
export type InvoiceListPageSize = (typeof INVOICE_LIST_PAGE_SIZES)[number];

export type InvoiceListQuery = {
	page: number;
	pageSize: InvoiceListPageSize;
	q: string;
	estado: 'todos' | InvoiceEstado;
};

