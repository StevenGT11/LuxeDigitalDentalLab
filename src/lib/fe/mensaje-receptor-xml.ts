const MENSAJE_NS = 'https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/mensajeReceptor';

function escapeXml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function formatHaciendaAmount(value: number): string {
	return value.toFixed(5);
}

export function buildMensajeReceptorXml(input: {
	claveOriginal: string;
	emisorTipoIdentificacion: string;
	emisorNumeroIdentificacion: string;
	fechaEmisionDoc: string;
	mensaje: 1 | 2 | 3;
	detalleMensaje: string;
	montoTotalImpuesto: number;
	totalFactura: number;
	receptorTipoIdentificacion: string;
	receptorNumeroIdentificacion: string;
	consecutivoReceptor: string;
}): string {
	const detalle =
		input.detalleMensaje.trim() ||
		(input.mensaje === 1
			? 'Aceptado'
			: input.mensaje === 2
				? 'Aceptado parcialmente'
				: 'Rechazado');

	return `<MensajeReceptor xmlns="${MENSAJE_NS}" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<Clave>${escapeXml(input.claveOriginal)}</Clave>
<NumeroCedulaEmisor>${escapeXml(input.emisorNumeroIdentificacion)}</NumeroCedulaEmisor>
<FechaEmisionDoc>${escapeXml(input.fechaEmisionDoc)}</FechaEmisionDoc>
<Mensaje>${input.mensaje}</Mensaje>
<DetalleMensaje>${escapeXml(detalle)}</DetalleMensaje>
<MontoTotalImpuesto>${formatHaciendaAmount(input.montoTotalImpuesto)}</MontoTotalImpuesto>
<TotalFactura>${formatHaciendaAmount(input.totalFactura)}</TotalFactura>
<NumeroCedulaReceptor>${escapeXml(input.receptorNumeroIdentificacion)}</NumeroCedulaReceptor>
<NumeroConsecutivoReceptor>${escapeXml(input.consecutivoReceptor)}</NumeroConsecutivoReceptor>
</MensajeReceptor>`;
}
