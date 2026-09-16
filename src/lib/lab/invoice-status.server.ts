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
	estadoRaw: string
): Promise<InvoiceEstado> {
	const estado = parseInvoiceEstado(estadoRaw);
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
