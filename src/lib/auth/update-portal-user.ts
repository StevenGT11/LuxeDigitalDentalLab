import type { SupabaseClient } from '@supabase/supabase-js';

const MIN_PASSWORD_LENGTH = 8;

export type UpdatePortalCredentialsInput = {
	email: string;
	password: string;
	passwordConfirm: string;
};

export function validatePortalCredentialsUpdate(
	input: UpdatePortalCredentialsInput,
	currentEmail: string
): string | null {
	const email = input.email.trim().toLowerCase();
	if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		return 'Ingresa un correo válido (será el usuario de acceso).';
	}

	const changingEmail = email !== currentEmail.trim().toLowerCase();
	const changingPassword = Boolean(input.password || input.passwordConfirm);
	if (!changingEmail && !changingPassword) {
		return 'Indica un correo nuevo o una contraseña nueva.';
	}

	if (changingPassword) {
		if (input.password.length < MIN_PASSWORD_LENGTH) {
			return `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
		}
		if (input.password !== input.passwordConfirm) {
			return 'Las contraseñas no coinciden.';
		}
	}

	return null;
}

/** Actualiza email y/o contraseña de Auth y los refleja en clients + profiles. */
export async function updatePortalClientCredentials(
	admin: SupabaseClient,
	clientId: string,
	input: UpdatePortalCredentialsInput
): Promise<{ email: string; changedEmail: boolean; changedPassword: boolean }> {
	const { data: client, error: clientError } = await admin
		.from('clients')
		.select('id, email, profile_id')
		.eq('id', clientId)
		.maybeSingle();

	if (clientError) throw clientError;
	if (!client) throw new Error('Cliente no encontrado.');
	if (!client.profile_id) {
		throw new Error('Este cliente no tiene usuario de acceso al portal.');
	}

	const validation = validatePortalCredentialsUpdate(input, client.email);
	if (validation) throw new Error(validation);

	const email = input.email.trim().toLowerCase();
	const changedEmail = email !== client.email.trim().toLowerCase();
	const changedPassword = Boolean(input.password);

	const { error: authError } = await admin.auth.admin.updateUserById(client.profile_id, {
		...(changedEmail ? { email, email_confirm: true } : {}),
		...(changedPassword ? { password: input.password } : {})
	});

	if (authError) {
		const msg = authError.message.toLowerCase();
		if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
			throw new Error('Ya existe un usuario con ese correo.');
		}
		throw new Error(authError.message);
	}

	if (changedEmail) {
		const { error: clientUpdateError } = await admin
			.from('clients')
			.update({ email })
			.eq('id', clientId);
		if (clientUpdateError) throw new Error(clientUpdateError.message);

		const { error: profileError } = await admin
			.from('profiles')
			.update({ email })
			.eq('id', client.profile_id);
		if (profileError) throw new Error(profileError.message);
	}

	return { email, changedEmail, changedPassword };
}
