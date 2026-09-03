/** Códigos Nota 9 — motivo de NC/ND ante Hacienda v4.4. */
export const FE_REFERENCIA_CODIGO_OPTIONS = [
	{ value: '01', label: 'Anula documento de referencia' },
	{ value: '02', label: 'Corrige monto' },
	{ value: '06', label: 'Devolución de mercancía' },
	{ value: '07', label: 'Sustituye comprobante electrónico' },
	{ value: '13', label: 'Anula por error material' },
	{ value: '14', label: 'Corrige monto por error material' },
	{ value: '99', label: 'Otros' }
] as const;

export type FeReferenciaCodigo = (typeof FE_REFERENCIA_CODIGO_OPTIONS)[number]['value'];

export type FeReferenciaPayload = {
	tipoDoc: string;
	numero: string;
	fechaEmision: string;
	codigo: string;
	razon: string;
};

export function defaultRazonForCodigo(codigo: string, tipoDocumento: '02' | '03'): string {
	switch (codigo) {
		case '01':
			return 'Anulación total de factura';
		case '02':
			return tipoDocumento === '03' ? 'Corrección de monto a la baja' : 'Corrección de monto al alza';
		case '06':
			return 'Devolución de mercancía';
		case '13':
			return 'Anulación por error material';
		case '14':
			return 'Corrección de monto por error material';
		default:
			return tipoDocumento === '03' ? 'Nota de crédito' : 'Nota de débito';
	}
}

/** Fecha de emisión del comprobante referenciado en YYYY-MM-DD. */
export function feReferenciaFechaFromIso(iso: string | null | undefined): string {
	if (!iso?.trim()) return new Date().toISOString().slice(0, 10);
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
	return d.toISOString().slice(0, 10);
}

export function buildReferenciaFromFe(input: {
	feClave: string;
	feFechaEmision: string | null;
	feTipoDocumento: string;
	codigo: string;
	razon: string;
}): FeReferenciaPayload {
	const tipoDocMap: Record<string, string> = {
		'01': '01',
		'02': '02',
		'03': '03',
		'04': '04'
	};
	return {
		tipoDoc: tipoDocMap[input.feTipoDocumento] ?? '01',
		numero: input.feClave,
		fechaEmision: feReferenciaFechaFromIso(input.feFechaEmision),
		codigo: input.codigo,
		razon: input.razon.trim().slice(0, 180)
	};
}
