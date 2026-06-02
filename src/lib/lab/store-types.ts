import type { CaseFile } from './types';

export interface CreateCaseItemInput {
	tipo_trabajo: string;
	material: string | null;
	color: string | null;
	piezas?: number;
	piezas_dentales: string[];
	incluye_diseno: boolean;
	incluye_fresado: boolean;
	implantes_guia?: number | null;
	corona_sobre_implante?: boolean;
	numero_pieza?: string;
	descripcion?: string | null;
}

export interface CreateCaseInput {
	client_id: string;
	paciente_name: string;
	doctor_id?: string;
	doctor_name?: string;
	fecha_entrega: string;
	notas: string | null;
	costo?: number;
	archivos?: CaseFile[];
	escaneoFiles?: File[];
	disenosFiles?: File[];
	items?: CreateCaseItemInput[];
	tipo_trabajo?: string;
	material?: string | null;
	color?: string | null;
	piezas?: number;
	extra_items?: {
		tipo_trabajo: string;
		material: string | null;
		color: string | null;
		piezas: number;
		numero_pieza?: string;
		descripcion?: string | null;
	}[];
}
