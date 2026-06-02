import { getCaseItemTipoLabel, isGuiaQuirurgica } from './constants';
import type { CaseItem, Invoice, LabCase, LabClient } from './types';

function invoiceLineLabel(item: CaseItem): string {
	const tipo = getCaseItemTipoLabel(item);
	if (isGuiaQuirurgica(item.tipo_trabajo)) {
		return `${tipo} — Diseño`;
	}
	const pieza = item.numero_pieza ? ` · pieza ${item.numero_pieza}` : '';
	const servicios: string[] = [];
	if (item.incluye_diseno) servicios.push('Diseño');
	if (item.incluye_fresado) servicios.push('Fresado');
	const serv = servicios.length ? ` — ${servicios.join(' + ')}` : '';
	return `${tipo}${pieza}${serv} ×${item.piezas}`;
}

export function buildInvoiceDraft(caso: LabCase, client: LabClient, invoiceNumber: string): {
	invoice: Omit<Invoice, 'id'>;
	lineas: Invoice['lineas'];
} {
	const lineas = caso.items.map((item) => ({
		descripcion: item.descripcion ?? invoiceLineLabel(item),
		cantidad: item.piezas,
		precio_unitario: item.unit_price,
		subtotal: item.subtotal
	}));

	const subtotal = caso.costo;
	const impuesto = Math.round(subtotal * 0.13 * 100) / 100;
	const total = Math.round((subtotal + impuesto) * 100) / 100;
	const now = new Date();

	return {
		invoice: {
			invoice_number: invoiceNumber,
			client_id: client.id,
			client_name: client.nombre,
			client_clinica: client.clinica,
			case_id: caso.id,
			case_number: caso.case_number,
			paciente_name: caso.paciente_name,
			subtotal,
			impuesto,
			total,
			fecha_emision: now.toISOString(),
			fecha_vencimiento: new Date(now.getTime() + 30 * 86400000).toISOString(),
			estado: 'pendiente',
			lineas
		},
		lineas
	};
}
