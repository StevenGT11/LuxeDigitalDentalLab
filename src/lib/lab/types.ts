import type { ToothAnatomySummary, ToothAnatomyType } from './teeth';

export type { ToothAnatomySummary, ToothAnatomyType };

export type LabCaseEstado =
	| 'pendiente'
	| 'en_diseño'
	| 'diseñado'
	| 'fresado'
	| 'horneando'
	| 'maquillando'
	| 'finalizado';

export type InvoiceEstado = 'pendiente' | 'pagada' | 'cancelada';

export type CaseFileCategory = 'escaneo' | 'diseno';

/** Archivo adjunto a un caso (escaneo intraoral, STL, diseño CAD, etc.) */
export interface CaseFile {
	id: string;
	name: string;
	size: number;
	mime_type: string;
	category: CaseFileCategory;
	uploaded_at: string;
	/** Ruta en Supabase Storage */
	storage_path?: string;
	/** Legacy localStorage (base64) */
	data_url?: string;
}

export interface ClientProfile {
	id: string;
	nombre: string;
	clinica: string;
	email: string;
	telefono: string;
}

/** Cliente registrado en el laboratorio (admin) */
export interface LabClient {
	id: string;
	nombre: string;
	clinica: string;
	email: string;
	telefono: string;
	fecha_registro: string;
}

/** Línea de trabajo dentro de un caso */
export interface CaseItem {
	id: string;
	case_id: string;
	/** Número de pieza dental (FDI), ej. 14, 21, 24-26 */
	numero_pieza: string | null;
	/** Dientes seleccionados en notación FDI */
	piezas_dentales: string[];
	/** Clasificación anatómica para estadísticas */
	tipo_pieza: ToothAnatomySummary | null;
	tipo_trabajo: string;
	material: string | null;
	color: string | null;
	piezas: number;
	/** Servicio de diseño CAD (precio por pieza según tipo de trabajo) */
	incluye_diseno: boolean;
	/** Servicio de fresado (precio por pieza según tipo de trabajo) */
	incluye_fresado: boolean;
	/** Implantes (1–6) cuando tipo_trabajo es guía quirúrgica */
	implantes_guia?: number | null;
	/** Add-on en Corona: corona sobre implante (ajusta tarifa) */
	corona_sobre_implante?: boolean;
	descripcion: string | null;
	unit_price: number;
	subtotal: number;
}

export interface LabCase {
	id: string;
	case_number: string;
	client_id: string;
	client_name: string;
	client_clinica: string;
	paciente_name: string;
	doctor_id: string;
	doctor_name: string;
	/** Campos legacy / resumen del primer ítem */
	tipo_trabajo: string;
	material: string | null;
	color: string | null;
	piezas: number;
	items: CaseItem[];
	costo: number;
	fecha_creacion: string;
	fecha_entrega: string;
	estado: LabCaseEstado;
	notas: string | null;
	/** Escaneos y diseños adjuntos al enviar el caso */
	archivos: CaseFile[];
}

export interface Invoice {
	id: string;
	invoice_number: string;
	client_id: string;
	client_name: string;
	client_clinica: string;
	case_id: string;
	case_number: string;
	paciente_name: string;
	subtotal: number;
	impuesto: number;
	total: number;
	fecha_emision: string;
	fecha_vencimiento: string;
	estado: InvoiceEstado;
	lineas: {
		descripcion: string;
		cantidad: number;
		precio_unitario: number;
		subtotal: number;
	}[];
}

export interface Doctor {
	id: string;
	name: string;
}

export interface ClientStats {
	totalCasos: number;
	pendientes: number;
	enProceso: number;
	finalizados: number;
	totalGastado: number;
	totalPiezas: number;
}

export interface ProductionStat {
	tipo: string;
	label: string;
	piezas: number;
	casos: number;
	ingresos: number;
}

export interface ClientRanking {
	client: LabClient;
	totalGastado: number;
	totalCasos: number;
	totalPiezas: number;
}

export interface AdminDashboardStats {
	totalCasos: number;
	pendientes: number;
	enProceso: number;
	ingresosTotales: number;
	totalClientes: number;
	coronasPiezas: number;
	puentesPiezas: number;
	facturasPendientes: number;
}
