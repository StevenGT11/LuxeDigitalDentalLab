/** Normaliza tipo FE (p. ej. 3 → 03) para comparaciones. */
export function normalizeFeTipoDocumento(tipo: string | number | null | undefined): string {
	if (tipo == null || tipo === '') return '';
	return String(tipo).padStart(2, '0');
}

export function isFeEstadoAceptado(estado: string | null | undefined): boolean {
	return String(estado ?? '').toLowerCase() === 'aceptado';
}

export function isNotaCreditoComprobante(nota: { tipo_documento: string }): boolean {
	return normalizeFeTipoDocumento(nota.tipo_documento) === '03';
}

export function isNotaCreditoAceptada(nota: { tipo_documento: string; estado: string }): boolean {
	return isNotaCreditoComprobante(nota) && isFeEstadoAceptado(nota.estado);
}

export type ReemitFacturaNotaCheck = {
	id: string;
	tipo: string;
	estado: string;
	aceptada: boolean;
};

export type ReemitFacturaDebug = {
	invoiceId: string;
	eligible: boolean;
	blockers: string[];
	checks: {
		sourceInvoiceId: string | null;
		hasSourceInvoice: boolean;
		feId: string | null;
		feEstado: string | null;
		feAceptada: boolean;
		notasCount: number;
		notasNc: ReemitFacturaNotaCheck[];
		ncAceptadaEmbed: boolean;
		ncAceptadaDb: boolean | null;
		correctionInvoiceId: string | null;
	};
};

/** FE aceptada + NC aceptada en esta factura → puede crear otra copia corregida. */
export function canReemitFacturaTrasNc(params: {
	feEstado: string | null | undefined;
	notas: { tipo_documento: string; estado: string }[];
}): boolean {
	return explainReemitFacturaTrasNc(params).eligible;
}

/** Desglose para logs / panel de depuración. */
export function explainReemitFacturaTrasNc(params: {
	invoiceId?: string;
	feId?: string | null;
	feEstado: string | null | undefined;
	notas: { id: string; tipo_documento: string; estado: string }[];
	sourceInvoiceId?: string | null;
	ncAceptadaDb?: boolean | null;
	correctionInvoiceId?: string | null;
}): ReemitFacturaDebug {
	const blockers: string[] = [];
	const parentInvoiceId = params.sourceInvoiceId ?? null;
	const feAceptada = isFeEstadoAceptado(params.feEstado);
	const notasNc: ReemitFacturaNotaCheck[] = params.notas.map((n) => ({
		id: n.id,
		tipo: normalizeFeTipoDocumento(n.tipo_documento),
		estado: String(n.estado ?? ''),
		aceptada: isNotaCreditoAceptada(n)
	}));
	const ncAceptadaEmbed = notasNc.some((n) => n.aceptada);

	if (!params.feEstado) {
		blockers.push('sin comprobante FE (tipo 01) vinculado a esta factura');
	} else if (!feAceptada) {
		blockers.push(`FE estado="${params.feEstado}" — se requiere "aceptado"`);
	}
	if (!ncAceptadaEmbed) {
		if (params.notas.length === 0) {
			blockers.push('embed fe_comprobantes: 0 notas NC/ND');
		} else {
			blockers.push(
				`embed: ninguna NC aceptada (${notasNc.map((n) => `${n.tipo}/${n.estado}`).join(', ') || 'sin filas'})`
			);
		}
	}
	if (params.ncAceptadaDb === false) {
		blockers.push('consulta DB hasAcceptedNotaCreditoForInvoice=false (NC 03 + aceptado)');
	}

	return {
		invoiceId: params.invoiceId ?? '',
		eligible: blockers.length === 0,
		blockers,
		checks: {
			sourceInvoiceId: parentInvoiceId,
			hasSourceInvoice: Boolean(parentInvoiceId),
			feId: params.feId ?? null,
			feEstado: params.feEstado ?? null,
			feAceptada,
			notasCount: params.notas.length,
			notasNc,
			ncAceptadaEmbed,
			ncAceptadaDb: params.ncAceptadaDb ?? null,
			correctionInvoiceId: params.correctionInvoiceId ?? null
		}
	};
}
