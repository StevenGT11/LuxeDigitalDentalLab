import PDFDocument from 'pdfkit';
import { FE_TIPO_IDENTIFICACION_OPTIONS, getFeComprobanteEstadoLabel } from '$lib/fe/constants';
import { parseFeXmlLineas, parseFeXmlTotals } from '$lib/fe/parse-fe-xml-lineas';
import { getEmitAmbiente } from '$lib/fe/hacienda-settings.server';
import { getFeEmisorConfigPublicByAmbiente } from '$lib/fe/emisor.server';
import type { FeEmisorConfigPublic } from '$lib/fe/types';
import { formatFeCorreosLabel } from '$lib/fe/fe-correos';
import { clientFeAddressRowToForm, formatClientFeAddressLabel } from '$lib/fe/client-fiscal-address';
import { invoicePdfFilename } from '$lib/lab/invoice-pdf';
import {
	loadInvoiceDetailPage,
	type ClientFiscalSnapshot,
	type FeComprobanteDetail,
	type InvoiceDetail
} from '$lib/lab/invoice-detail.server';
import type { InvoiceLineDetail } from '$lib/lab/types';
import { getInvoiceEstadoLabel } from '$lib/lab/invoice-estado';

const GOLD = '#92772F';
const INK = '#0F172A';
const MUTED = '#64748B';
const RULE = '#CBD5E1';
const HEAD_BG = '#F8FAFC';
const MARGIN_X = 48;
const MARGIN_TOP = 40;
const MARGIN_BOTTOM = 52;
const PAGE_W = 612;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

type PdfDoc = InstanceType<typeof PDFDocument>;

function moneyUsd(amount: number): string {
	return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function moneyCrc(amount: number): string {
	return `CRC ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`;
}

function roundMoney(amount: number): number {
	return Math.round(amount * 100) / 100;
}

function formatMoneyFor(moneda: string): (amount: number) => string {
	return moneda.toUpperCase() === 'CRC' ? moneyCrc : moneyUsd;
}

/** Líneas y totales en la moneda del comprobante. El libro interno sigue en USD. */
function amountsInComprobanteCurrency(
	invoice: InvoiceDetail,
	fe: { subtotal: number; impuesto: number; total: number; xml_firmado: string | null } | null,
	moneda: string
): { lines: InvoiceLineDetail[]; totals: { subtotal: number; impuesto: number; total: number } } {
	const ledgerTotals = {
		subtotal: invoice.subtotal,
		impuesto: invoice.impuesto,
		total: invoice.total
	};
	if (moneda.toUpperCase() !== 'CRC' || !fe) {
		return { lines: invoice.lineas, totals: ledgerTotals };
	}

	const xmlLines = parseFeXmlLineas(fe.xml_firmado);
	const xmlTotals = parseFeXmlTotals(fe.xml_firmado);
	const totals = xmlTotals ?? {
		subtotal: fe.subtotal,
		impuesto: fe.impuesto,
		total: fe.total
	};

	if (xmlLines.length > 0) {
		return {
			lines: xmlLines.map((line) => ({
				id: String(line.numero_linea),
				sort_order: line.numero_linea,
				descripcion: line.descripcion,
				cantidad: line.cantidad,
				precio_unitario: line.precio_unitario,
				subtotal: line.subtotal,
				fe_cabys: line.fe_cabys,
				fe_unidad_medida: line.fe_unidad_medida,
				impuesto_tarifa: line.impuesto_tarifa
			})),
			totals
		};
	}

	const rate = invoice.subtotal > 0 ? fe.subtotal / invoice.subtotal : 1;
	return {
		lines: invoice.lineas.map((line) => ({
			...line,
			precio_unitario: roundMoney(line.precio_unitario * rate),
			subtotal: roundMoney(line.subtotal * rate)
		})),
		totals
	};
}

function formatCrDate(iso: string | null | undefined): string {
	if (!iso) return '—';
	return new Date(iso).toLocaleDateString('es-CR', {
		timeZone: 'America/Costa_Rica',
		day: '2-digit',
		month: '2-digit',
		year: 'numeric'
	});
}

function tipoIdLabel(code: string | null | undefined): string {
	if (!code) return '';
	return FE_TIPO_IDENTIFICACION_OPTIONS.find((o) => o.value === code)?.label ?? code;
}

function contentBottom(doc: PdfDoc): number {
	return doc.page.height - MARGIN_BOTTOM;
}

function ensureSpace(doc: PdfDoc, needed: number): boolean {
	if (doc.y + needed <= contentBottom(doc)) return false;
	doc.addPage();
	return true;
}

function rule(doc: PdfDoc, y: number, color = GOLD, width = 1.5) {
	doc.save();
	doc.strokeColor(color).lineWidth(width);
	doc.moveTo(MARGIN_X, y).lineTo(MARGIN_X + CONTENT_W, y).stroke();
	doc.restore();
}

function columnXs() {
	const amtW = 88;
	const ivaW = 36;
	const unitW = 84;
	const qtyW = 40;
	const gap = 8;
	const descW = CONTENT_W - amtW - ivaW - unitW - qtyW - gap * 4;
	const desc = MARGIN_X;
	const qty = desc + descW + gap;
	const unit = qty + qtyW + gap;
	const iva = unit + unitW + gap;
	const amt = iva + ivaW + gap;
	return { desc, descW, qty, qtyW, unit, unitW, iva, ivaW, amt, amtW };
}

function drawEmisor(doc: PdfDoc, emisor: FeEmisorConfigPublic | null, documentTitle = 'FACTURA') {
	const brand = emisor?.nombre_comercial?.trim() || emisor?.razon_social?.trim() || 'Luxe Digital Dental Lab';
	const leftW = CONTENT_W * 0.58;
	const rightX = MARGIN_X + leftW;
	const rightW = CONTENT_W - leftW;

	doc.fillColor(INK).font('Helvetica-Bold').fontSize(15).text(brand, MARGIN_X, MARGIN_TOP, {
		width: leftW - 12,
		lineGap: 1
	});
	doc.fillColor(GOLD).font('Helvetica').fontSize(8).text('LABORATORIO DENTAL DIGITAL', MARGIN_X, doc.y + 2, {
		width: leftW - 12,
		lineBreak: false
	});
	const leftBottom = doc.y;

	let y = MARGIN_TOP;
	doc.fillColor(INK).font('Helvetica-Bold').fontSize(11).text(documentTitle, rightX, y, {
		width: rightW,
		align: 'right',
		lineBreak: false
	});
	y = doc.y + 2;
	if (emisor?.razon_social && emisor.razon_social !== brand) {
		doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(emisor.razon_social, rightX, y, {
			width: rightW,
			align: 'right',
			height: 22,
			ellipsis: true
		});
		y = doc.y;
	}
	const emisorLines = [
		emisor?.numero_identificacion
			? `${tipoIdLabel(emisor.tipo_identificacion)} ${emisor.numero_identificacion}`
			: '',
		emisor?.telefono ? `Tel. ${emisor.telefono}` : '',
		emisor?.correo_electronico ?? '',
		emisor?.otras_senas ?? ''
	].filter(Boolean);
	doc.fillColor(MUTED).font('Helvetica').fontSize(8);
	for (const line of emisorLines) {
		doc.text(line, rightX, y, { width: rightW, align: 'right', height: 12, ellipsis: true });
		y = doc.y;
	}
	doc.y = Math.max(leftBottom, y);
}

function drawMetaRow(doc: PdfDoc, items: [string, string][]) {
	const y = doc.y + 12;
	rule(doc, y);
	const labelY = y + 8;
	const col = CONTENT_W / items.length;
	items.forEach(([label, value], i) => {
		const x = MARGIN_X + col * i;
		doc.fillColor(MUTED).font('Helvetica').fontSize(7).text(label.toUpperCase(), x, labelY, {
			width: col - 8,
			lineBreak: false
		});
		doc.fillColor(INK).font('Helvetica-Bold').fontSize(10).text(value, x, labelY + 11, {
			width: col - 8,
			lineBreak: false
		});
	});
	doc.y = labelY + 28;
}

function drawMeta(doc: PdfDoc, invoice: InvoiceDetail) {
	drawMetaRow(doc, [
		['Número', invoice.invoice_number],
		['Emisión', formatCrDate(invoice.fecha_emision)],
		['Vencimiento', formatCrDate(invoice.fecha_vencimiento)],
		['Cobro', getInvoiceEstadoLabel(invoice.estado)]
	]);
}

function drawParties(doc: PdfDoc, invoice: InvoiceDetail, client: ClientFiscalSnapshot) {
	const top = doc.y + 6;
	const colW = (CONTENT_W - 16) / 2;
	const rightX = MARGIN_X + colW + 16;

	doc.fillColor(GOLD).font('Helvetica-Bold').fontSize(8).text('CLIENTE / RECEPTOR', MARGIN_X, top, {
		lineBreak: false
	});
	let leftY = top + 12;
	doc.fillColor(INK).font('Helvetica-Bold').fontSize(10).text(invoice.client_name, MARGIN_X, leftY, {
		width: colW,
		height: 14,
		ellipsis: true
	});
	leftY = doc.y;
	doc.fillColor(MUTED).font('Helvetica').fontSize(8);
	doc.text(invoice.client_clinica, MARGIN_X, leftY, { width: colW, height: 12, ellipsis: true });
	leftY = doc.y;
	if (client.fe_numero_identificacion) {
		doc.text(
			`${tipoIdLabel(client.fe_tipo_identificacion)} ${client.fe_numero_identificacion}`,
			MARGIN_X,
			leftY,
			{ width: colW, lineBreak: false }
		);
		leftY = doc.y;
	}
	const mail = formatFeCorreosLabel(client.fe_correo_facturacion, client.email);
	if (mail !== '—') {
		doc.text(mail, MARGIN_X, leftY, { width: colW, height: 12, ellipsis: true });
		leftY = doc.y;
	}
	const direccion = formatClientFeAddressLabel(clientFeAddressRowToForm(client));
	if (direccion !== '—') {
		doc.text(direccion, MARGIN_X, leftY, { width: colW, height: 24 });
		leftY = doc.y;
	}

	doc.fillColor(GOLD).font('Helvetica-Bold').fontSize(8).text('CASO', rightX, top, { lineBreak: false });
	doc.fillColor(INK).font('Helvetica-Bold').fontSize(10).text(invoice.case_number, rightX, top + 12, {
		width: colW,
		lineBreak: false
	});
	let rightY = doc.y;
	doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(`Paciente: ${invoice.paciente_name}`, rightX, rightY, {
		width: colW,
		height: 12,
		ellipsis: true
	});
	rightY = doc.y;
	doc.y = Math.max(leftY, rightY) + 8;
}

function drawTableHeader(doc: PdfDoc, y: number) {
	doc.save();
	doc.rect(MARGIN_X, y, CONTENT_W, 16).fill(HEAD_BG);
	doc.restore();
	doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(7);
	const cols = columnXs();
	const ty = y + 4;
	doc.text('DESCRIPCIÓN', cols.desc, ty, { width: cols.descW, lineBreak: false });
	doc.text('CANT.', cols.qty, ty, { width: cols.qtyW, align: 'right', lineBreak: false });
	doc.text('P. UNITARIO', cols.unit, ty, { width: cols.unitW, align: 'right', lineBreak: false });
	doc.text('IVA', cols.iva, ty, { width: cols.ivaW, align: 'right', lineBreak: false });
	doc.text('IMPORTE', cols.amt, ty, { width: cols.amtW, align: 'right', lineBreak: false });
	return y + 16;
}

function drawLines(
	doc: PdfDoc,
	lines: InvoiceLineDetail[],
	formatMoney: (amount: number) => string
) {
	let y = drawTableHeader(doc, doc.y);
	const cols = columnXs();

	for (const line of lines) {
		doc.font('Helvetica').fontSize(8);
		const descH = Math.min(36, doc.heightOfString(line.descripcion, { width: cols.descW }));
		const rowH = Math.max(18, descH + 8);
		if (ensureSpace(doc, rowH + 4)) {
			y = drawTableHeader(doc, MARGIN_TOP);
		}
		const textY = y + 4;
		doc.fillColor(INK).font('Helvetica').fontSize(8);
		doc.text(line.descripcion, cols.desc, textY, { width: cols.descW, height: rowH - 6, ellipsis: true });
		doc.text(String(line.cantidad), cols.qty, textY, { width: cols.qtyW, align: 'right', lineBreak: false });
		doc.text(formatMoney(line.precio_unitario), cols.unit, textY, {
			width: cols.unitW,
			align: 'right',
			lineBreak: false
		});
		doc.text(`${line.impuesto_tarifa}%`, cols.iva, textY, {
			width: cols.ivaW,
			align: 'right',
			lineBreak: false
		});
		doc.text(formatMoney(line.subtotal), cols.amt, textY, {
			width: cols.amtW,
			align: 'right',
			lineBreak: false
		});
		y += rowH;
		doc.save();
		doc.strokeColor(RULE).lineWidth(0.4);
		doc.moveTo(MARGIN_X, y).lineTo(MARGIN_X + CONTENT_W, y).stroke();
		doc.restore();
		doc.y = y;
	}
}

function drawTotals(
	doc: PdfDoc,
	totals: { subtotal: number; impuesto: number; total: number },
	formatMoney: (amount: number) => string = moneyUsd
) {
	ensureSpace(doc, 58);
	const boxW = 200;
	const x = MARGIN_X + CONTENT_W - boxW;
	let y = doc.y + 10;
	const rows: [string, string, boolean][] = [
		['Subtotal', formatMoney(totals.subtotal), false],
		['IVA', formatMoney(totals.impuesto), false],
		['Total', formatMoney(totals.total), true]
	];
	for (const [label, value, strong] of rows) {
		doc.fillColor(MUTED).font(strong ? 'Helvetica-Bold' : 'Helvetica').fontSize(strong ? 11 : 9);
		doc.text(label, x, y, { width: 80, lineBreak: false });
		doc.fillColor(INK).text(value, x + 80, y, { width: boxW - 80, align: 'right', lineBreak: false });
		y += strong ? 16 : 14;
	}
	doc.y = y;
}

function drawNotes(doc: PdfDoc, notas: string) {
	const text = notas.trim();
	if (!text) return;
	ensureSpace(doc, 36);
	let y = doc.y + 12;
	doc.fillColor(GOLD).font('Helvetica-Bold').fontSize(8).text('NOTAS', MARGIN_X, y, { lineBreak: false });
	y = doc.y + 4;
	doc.fillColor(INK).font('Helvetica').fontSize(8);
	doc.text(text, MARGIN_X, y, { width: CONTENT_W });
	doc.y = doc.y + 4;
}

function drawFeBox(doc: PdfDoc, fe: FeComprobanteDetail | null, heading = 'FACTURA ELECTRÓNICA — HACIENDA') {
	if (!fe) return;
	ensureSpace(doc, 52);
	const y = doc.y + 8;
	doc.save();
	doc.roundedRect(MARGIN_X, y, CONTENT_W, 46, 4).strokeColor(GOLD).lineWidth(0.8).stroke();
	doc.restore();
	doc.fillColor(GOLD).font('Helvetica-Bold').fontSize(8).text(heading, MARGIN_X + 10, y + 7, {
		width: CONTENT_W - 20,
		lineBreak: false
	});
	const estado = getFeComprobanteEstadoLabel(fe.estado);
	const moneda = (fe.moneda ?? 'USD').toUpperCase();
	const feTotal = moneda === 'CRC' ? moneyCrc(fe.total) : moneyUsd(fe.total);
	doc.fillColor(INK).font('Helvetica').fontSize(8).text(
		`Estado: ${estado}    Consecutivo: ${fe.consecutivo ?? '—'}    Total FE: ${feTotal}`,
		MARGIN_X + 10,
		y + 20,
		{ width: CONTENT_W - 20, lineBreak: false }
	);
	doc.fillColor(MUTED).fontSize(7).text(`Clave: ${fe.clave ?? 'Pendiente de envío'}`, MARGIN_X + 10, y + 32, {
		width: CONTENT_W - 20,
		height: 10,
		ellipsis: true
	});
	doc.y = y + 50;
}

function drawFooters(doc: PdfDoc, caption = 'Luxe Digital Dental Lab  ·  Representación gráfica de la factura') {
	const range = doc.bufferedPageRange();
	for (let i = 0; i < range.count; i++) {
		doc.switchToPage(range.start + i);
		const previousBottom = doc.page.margins.bottom;
		doc.page.margins.bottom = 0;
		const y = doc.page.height - 32;
		rule(doc, y - 8, GOLD, 0.8);
		doc.fillColor(MUTED).font('Helvetica').fontSize(7);
		doc.text(caption, MARGIN_X, y, {
			width: CONTENT_W * 0.68,
			lineBreak: false
		});
		doc.text(`Página ${i + 1} de ${range.count}`, MARGIN_X, y, {
			width: CONTENT_W,
			align: 'right',
			lineBreak: false
		});
		doc.page.margins.bottom = previousBottom;
	}
}

export async function buildInvoicePdfBuffer(invoiceId: string): Promise<{
	buffer: Buffer;
	filename: string;
}> {
	const ambiente = await getEmitAmbiente();
	const detail = await loadInvoiceDetailPage(invoiceId, ambiente);
	if (!detail) {
		throw new Error('Factura no encontrada');
	}
	const emisor = await getFeEmisorConfigPublicByAmbiente(ambiente);

	const buffer = await new Promise<Buffer>((resolve, reject) => {
		const doc = new PDFDocument({
			size: 'LETTER',
			bufferPages: true,
			autoFirstPage: true,
			margins: { top: MARGIN_TOP, left: MARGIN_X, right: MARGIN_X, bottom: MARGIN_BOTTOM },
			info: {
				Title: `Factura ${detail.invoice.invoice_number}`,
				Author: emisor?.razon_social || 'Luxe Digital Dental Lab',
				Creator: 'Luxe Digital Dental Lab'
			}
		});
		const chunks: Buffer[] = [];
		doc.on('data', (chunk: Buffer) => chunks.push(chunk));
		doc.on('end', () => resolve(Buffer.concat(chunks)));
		doc.on('error', reject);

		const moneda = (detail.fe?.moneda ?? 'USD').toUpperCase();
		const formatMoney = formatMoneyFor(moneda);
		const amounts = amountsInComprobanteCurrency(detail.invoice, detail.fe, moneda);
		drawEmisor(doc, emisor);
		drawMeta(doc, detail.invoice);
		drawParties(doc, detail.invoice, detail.client);
		drawLines(doc, amounts.lines, formatMoney);
		drawTotals(doc, amounts.totals, formatMoney);
		drawNotes(doc, detail.invoice.notas);
		drawFeBox(doc, detail.fe);
		drawFooters(doc);
		doc.end();
	});

	return { buffer, filename: invoicePdfFilename(detail.invoice.invoice_number) };
}

export type NotaPdfSource = {
	tipo_documento: string;
	consecutivo: string | null;
	clave: string | null;
	estado: FeComprobanteDetail['estado'];
	subtotal: number;
	impuesto: number;
	total: number;
	moneda: string;
	fecha_emision: string | null;
	referencia_razon: string | null;
	xml_firmado?: string | null;
};

/** Representación gráfica de una NC/ND aceptada, con los montos del comprobante. */
export async function buildNotaPdfBuffer(
	invoiceId: string,
	nota: NotaPdfSource
): Promise<{ buffer: Buffer; filename: string }> {
	const ambiente = await getEmitAmbiente();
	const detail = await loadInvoiceDetailPage(invoiceId, ambiente);
	if (!detail) throw new Error('Factura no encontrada');
	const emisor = await getFeEmisorConfigPublicByAmbiente(ambiente);
	const isCredito = nota.tipo_documento === '03';
	const title = isCredito ? 'NOTA DE CRÉDITO' : 'NOTA DE DÉBITO';
	const prefix = isCredito ? 'NC' : 'ND';
	const moneda = (nota.moneda || 'USD').toUpperCase();
	const formatMoney = formatMoneyFor(moneda);
	const amounts = amountsInComprobanteCurrency(
		detail.invoice,
		{
			subtotal: nota.subtotal,
			impuesto: nota.impuesto,
			total: nota.total,
			xml_firmado: nota.xml_firmado ?? null
		},
		moneda
	);
	const fileKey = nota.consecutivo?.trim() || detail.invoice.invoice_number;

	const buffer = await new Promise<Buffer>((resolve, reject) => {
		const doc = new PDFDocument({
			size: 'LETTER',
			bufferPages: true,
			autoFirstPage: true,
			margins: { top: MARGIN_TOP, left: MARGIN_X, right: MARGIN_X, bottom: MARGIN_BOTTOM },
			info: {
				Title: `${title} ${fileKey}`,
				Author: emisor?.razon_social || 'Luxe Digital Dental Lab',
				Creator: 'Luxe Digital Dental Lab'
			}
		});
		const chunks: Buffer[] = [];
		doc.on('data', (chunk: Buffer) => chunks.push(chunk));
		doc.on('end', () => resolve(Buffer.concat(chunks)));
		doc.on('error', reject);

		drawEmisor(doc, emisor, title);
		drawMetaRow(doc, [
			['Consecutivo', nota.consecutivo?.trim() || '—'],
			['Emisión', formatCrDate(nota.fecha_emision)],
			['Factura', detail.invoice.invoice_number],
			['Estado', getFeComprobanteEstadoLabel(nota.estado)]
		]);
		drawParties(doc, detail.invoice, detail.client);
		drawLines(doc, amounts.lines, formatMoney);
		drawTotals(doc, amounts.totals, formatMoney);
		const referencia = [
			`Referencia factura ${detail.invoice.invoice_number}.`,
			nota.referencia_razon?.trim() ?? ''
		]
			.filter(Boolean)
			.join(' ');
		drawNotes(doc, referencia);
		drawFeBox(
			doc,
			{
				id: '',
				tipo_documento: nota.tipo_documento,
				consecutivo_num: 0,
				clave: nota.clave,
				consecutivo: nota.consecutivo,
				estado: nota.estado,
				hacienda_status: null,
				subtotal: nota.subtotal,
				impuesto: nota.impuesto,
				total: nota.total,
				fecha_emision: nota.fecha_emision,
				moneda,
				ultimo_error: null,
				enviado_at: null,
				resuelto_at: null,
				xml_firmado: null,
				respuesta_xml: null,
				rechazo: null,
				referencia_codigo: null,
				referencia_razon: nota.referencia_razon
			},
			`${title} — HACIENDA`
		);
		drawFooters(doc, `Luxe Digital Dental Lab  ·  Representación gráfica de la ${title.toLowerCase()}`);
		doc.end();
	});

	const safe = fileKey.replace(/[^\w.-]+/g, '_');
	return { buffer, filename: `${prefix}-${safe}.pdf` };
}
