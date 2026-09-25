import { createSupabaseAdminClient } from '$lib/supabase/admin';
import { parseInvoiceEstado } from './invoice-estado';
import type { InvoiceEstado } from './types';

function isEnumMismatch(error: { code?: string; message?: string } | null): boolean {
	if (!error) return false;
	return error.code === '22P02' || (error.message ?? '').includes('invalid input value for enum');
}

function dbEstadoCandidates(estado: InvoiceEstado): string[] {
	if (estado === 'pagado') return ['pagado', 'pagada'];
	return [estado];
}

/** Actualiza cobro en servidor. La BD puede tener `pagada` (enum original) o `pagado`. */
export async function updateInvoiceStatusServer(
	invoiceId: string,
	estadoRaw: string,
	options?: { fromFeAceptada?: boolean }
): Promise<InvoiceEstado> {
	const estado = parseInvoiceEstado(estadoRaw);
	if (estado === 'facturado' && !options?.fromFeAceptada) {
		throw new Error(
			'El estado Facturado se asigna solo cuando Hacienda acepta la factura electrónica.'
		);
	}
	const admin = createSupabaseAdminClient();

	let lastError: { message?: string; code?: string } | null = null;
	for (const dbEstado of dbEstadoCandidates(estado)) {
		const { data, error } = await admin
			.from('invoices')
			.update({ estado: dbEstado })
			.eq('id', invoiceId)
			.select('id, estado')
			.maybeSingle();

		if (error) {
			lastError = error;
			if (isEnumMismatch(error)) continue;
			throw new Error(error.message);
		}
		if (data?.id) {
			return data.estado === 'pagada' ? 'pagado' : parseInvoiceEstado(String(data.estado));
		}
		lastError = { message: 'No se encontró la factura.' };
	}

	throw new Error(lastError?.message ?? 'No se pudo actualizar el cobro.');
}

/** Pasa a Facturado al aceptar la FE, sin tocar pagado ni cancelada. */
export async function markInvoiceFacturadoOnFeAceptada(invoiceId: string): Promise<void> {
	const admin = createSupabaseAdminClient();
	const { data, error } = await admin
		.from('invoices')
		.select('estado')
		.eq('id', invoiceId)
		.maybeSingle();
	if (error) throw error;
	const current = String(data?.estado ?? '');
	if (
		current === 'pagado' ||
		current === 'pagada' ||
		current === 'cancelada' ||
		current === 'facturado'
	) {
		return;
	}
	await updateInvoiceStatusServer(invoiceId, 'facturado', { fromFeAceptada: true });
}
