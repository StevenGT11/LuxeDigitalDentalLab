import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchActiveAdminEmails } from '$lib/email/admin-recipients';
import { notifyCaseReadyForDelivery, notifyNewCaseCreated } from '$lib/email/notifications';
import { requireAdmin } from '$lib/auth/require-admin';
import { createSupabaseAdminClient } from '$lib/supabase/admin';
import type { LabCaseEstado } from '$lib/lab/types';

type CaseNotifyRow = {
	id: string;
	case_number: string;
	client_id: string;
	client_name: string;
	paciente_name: string;
	estado: LabCaseEstado;
};

async function fetchCaseRow(
	supabase: SupabaseClient,
	caseId: string
): Promise<CaseNotifyRow | null> {
	const { data, error } = await supabase
		.from('cases')
		.select('id, case_number, client_id, client_name, paciente_name, estado')
		.eq('id', caseId)
		.maybeSingle();

	if (error) throw error;
	return data as CaseNotifyRow | null;
}

async function fetchClientEmail(clientId: string): Promise<string | null> {
	const admin = createSupabaseAdminClient();
	const { data, error } = await admin
		.from('clients')
		.select('email')
		.eq('id', clientId)
		.eq('activo', true)
		.maybeSingle();

	if (error) throw error;
	const email = data?.email?.trim();
	return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/** Envía alerta al admin cuando se registra un caso (solo si el usuario puede ver el caso). */
export async function sendNewCaseAdminNotification(
	supabase: SupabaseClient,
	userId: string | undefined,
	caseId: string
): Promise<void> {
	if (!userId) {
		throw new Error('Sin sesión');
	}

	const caso = await fetchCaseRow(supabase, caseId);
	if (!caso) {
		throw new Error('Caso no encontrado o sin permiso.');
	}

	const adminEmails = await fetchActiveAdminEmails();
	if (adminEmails.length === 0) {
		throw new Error(
			'No hay administradores activos con correo en profiles (role = admin).'
		);
	}

	await notifyNewCaseCreated({
		to: adminEmails,
		caseId: caso.case_number,
		clientName: caso.client_name || 'Cliente',
		patientName: caso.paciente_name
	});
}

/** Envía aviso al cliente cuando el caso quedó en estado finalizado. */
export async function sendCaseFinalizedClientNotification(
	supabase: SupabaseClient,
	userId: string | undefined,
	caseId: string
): Promise<void> {
	const gate = await requireAdmin(supabase, userId);
	if (!gate.ok) {
		throw new Error(gate.message);
	}

	const caso = await fetchCaseRow(supabase, caseId);
	if (!caso) {
		throw new Error('Caso no encontrado.');
	}

	if (caso.estado !== 'finalizado') {
		throw new Error('El caso debe estar en estado finalizado.');
	}

	const clientEmail = await fetchClientEmail(caso.client_id);
	if (!clientEmail) {
		throw new Error('El cliente no tiene un correo válido configurado.');
	}

	await notifyCaseReadyForDelivery({
		to: clientEmail,
		caseId: caso.case_number,
		clientName: caso.client_name || undefined
	});
}
