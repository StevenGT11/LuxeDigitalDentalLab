import type { SupabaseClient } from '@supabase/supabase-js';
import type { LabClient } from '$lib/lab/types';

const MIN_PASSWORD_LENGTH = 8;

export type CreatePortalUserInput = {
	email: string;
	password: string;
	passwordConfirm: string;
	nombre: string;
	clinica?: string;
	telefono?: string;
};

function mapClientRow(row: {
	id: string;
	nombre: string;
	clinica: string;
	email: string;
	telefono: string;
	fecha_registro: string;
}): LabClient {
	return {
		id: row.id,
		nombre: row.nombre,
		clinica: row.clinica,
		email: row.email,
		telefono: row.telefono,
		fecha_registro: row.fecha_registro
	};
}

export function validateCreatePortalUserInput(input: CreatePortalUserInput): string | null {
	const email = input.email.trim().toLowerCase();
	if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		return 'Ingresa un correo válido (será el usuario de acceso).';
	}
	if (!input.nombre.trim()) {
		return 'El nombre de la clínica es requerido.';
	}
	if (input.password.length < MIN_PASSWORD_LENGTH) {
		return `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
	}
	if (input.password !== input.passwordConfirm) {
		return 'Las contraseñas no coinciden.';
	}
	return null;
}

/** Crea usuario en Auth; triggers crean profiles + clients. */
export async function createPortalClientUser(
	admin: SupabaseClient,
	input: CreatePortalUserInput
): Promise<LabClient> {
	const validation = validateCreatePortalUserInput(input);
	if (validation) throw new Error(validation);

	const email = input.email.trim().toLowerCase();
	const nombre = input.nombre.trim();
	const clinica = input.clinica?.trim() ?? '';
	const telefono = input.telefono?.trim() ?? '';

	const { data: authData, error: authError } = await admin.auth.admin.createUser({
		email,
		password: input.password,
		email_confirm: true,
		user_metadata: { nombre, clinica, telefono }
	});

	if (authError) {
		const msg = authError.message.toLowerCase();
		if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
			throw new Error('Ya existe un usuario con ese correo.');
		}
		throw new Error(authError.message);
	}

	const userId = authData.user?.id;
	if (!userId) throw new Error('No se pudo crear el usuario de acceso.');

	let { data: clientRow, error: clientError } = await admin
		.from('clients')
		.select('id, nombre, clinica, email, telefono, fecha_registro')
		.eq('profile_id', userId)
		.maybeSingle();

	if (clientError) throw clientError;

	if (!clientRow) {
		const { data: inserted, error: insertError } = await admin
			.from('clients')
			.insert({
				profile_id: userId,
				nombre,
				email,
				clinica,
				telefono
			})
			.select('id, nombre, clinica, email, telefono, fecha_registro')
			.single();

		if (insertError) {
			await admin.auth.admin.deleteUser(userId).catch(() => undefined);
			throw new Error(
				insertError.message.includes('duplicate')
					? 'Ya existe un cliente vinculado a este correo.'
					: `No se pudo crear la ficha del cliente: ${insertError.message}`
			);
		}
		clientRow = inserted;
	}

	return mapClientRow(clientRow);
}
