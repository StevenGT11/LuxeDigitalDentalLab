import { createSupabaseAdminClient } from '$lib/supabase/admin';
import { computeInvoiceTaxTotals } from '$lib/lab/invoice-tax';
import { normalizeImpuestoTarifaForFe } from './impuesto-tarifa';

/**
 * Copia fe_cabys, unidad e IVA desde tratamientos actuales a invoice_lines (mismo orden que case_items).
 * Se ejecuta antes de emitir para reflejar correcciones en Admin → Tratamientos.
 */
export async function syncInvoiceLinesFeFromCase(invoiceId: string): Promise<number> {
	const admin = createSupabaseAdminClient();

	const { data: inv, error: invErr } = await admin
		.from('invoices')
		.select('case_id')
		.eq('id', invoiceId)
		.maybeSingle();
	if (invErr) throw invErr;
	if (!inv?.case_id) return 0;

	const [{ data: lines, error: linesErr }, { data: items, error: itemsErr }] = await Promise.all([
		admin
			.from('invoice_lines')
			.select('id, sort_order')
			.eq('invoice_id', invoiceId)
			.order('sort_order', { ascending: true }),
		admin
			.from('case_items')
			.select('tipo_trabajo, sort_order')
			.eq('case_id', inv.case_id)
			.order('sort_order', { ascending: true })
	]);
	if (linesErr) throw linesErr;
	if (itemsErr) throw itemsErr;
	if (!lines?.length || !items?.length) return 0;

	const slugs = [...new Set(items.map((i) => i.tipo_trabajo).filter(Boolean))];
	const { data: treatments, error: trErr } = await admin
		.from('treatments')
		.select('slug, fe_cabys, fe_unidad_medida, impuesto_tarifa')
		.in('slug', slugs);
	if (trErr) throw trErr;

	const bySlug = new Map((treatments ?? []).map((t) => [t.slug, t]));
	let updated = 0;

	for (let i = 0; i < lines.length; i++) {
		const item = items[i];
		const line = lines[i];
		if (!item || !line) continue;
		const t = bySlug.get(item.tipo_trabajo);
		if (!t) continue;

		const impuesto_tarifa = normalizeImpuestoTarifaForFe(t.impuesto_tarifa);
		const { error } = await admin
			.from('invoice_lines')
			.update({
				fe_cabys: t.fe_cabys?.trim() || null,
				fe_unidad_medida: t.fe_unidad_medida?.trim() || 'Sp',
				impuesto_tarifa
			})
			.eq('id', line.id);
		if (error) throw error;
		updated++;
	}

	return updated;
}

/** Corrige tarifas mal guardadas (0.13, 8, etc.) en invoice_lines de una factura. */
export async function normalizeInvoiceLinesImpuestoTarifa(invoiceId: string): Promise<number> {
	const admin = createSupabaseAdminClient();
	const { data: lines, error } = await admin
		.from('invoice_lines')
		.select('id, impuesto_tarifa')
		.eq('invoice_id', invoiceId);
	if (error) throw error;

	let updated = 0;
	for (const line of lines ?? []) {
		const fixed = normalizeImpuestoTarifaForFe(line.impuesto_tarifa);
		if (Math.abs(Number(line.impuesto_tarifa) - fixed) < 0.001) continue;
		const { error: upErr } = await admin
			.from('invoice_lines')
			.update({ impuesto_tarifa: fixed })
			.eq('id', line.id);
		if (upErr) throw upErr;
		updated++;
	}
	return updated;
}

/** Ajusta subtotal / impuesto / total del encabezado según impuesto_tarifa de cada línea. */
export async function recalculateAndPersistInvoiceTotals(invoiceId: string): Promise<{
	subtotal: number;
	impuesto: number;
	total: number;
}> {
	const admin = createSupabaseAdminClient();
	const { data: lines, error } = await admin
		.from('invoice_lines')
		.select('subtotal, impuesto_tarifa')
		.eq('invoice_id', invoiceId)
		.order('sort_order', { ascending: true });
	if (error) throw error;

	const totals = computeInvoiceTaxTotals(
		(lines ?? []).map((l) => ({
			subtotal: Number(l.subtotal),
			impuesto_tarifa: normalizeImpuestoTarifaForFe(l.impuesto_tarifa)
		}))
	);

	const { error: upErr } = await admin
		.from('invoices')
		.update({
			subtotal: totals.subtotal,
			impuesto: totals.impuesto,
			total: totals.total
		})
		.eq('id', invoiceId);
	if (upErr) throw upErr;

	return totals;
}
