import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';

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

async function findAuthUserByEmail(admin: SupabaseClient, email: string): Promise<User | null> {
	const target = email.trim().toLowerCase();
	let page = 1;
	const perPage = 200;
	while (page <= 20) {
		const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
		if (error) throw new Error(error.message);
		const found = data.users.find((u) => u.email?.toLowerCase() === target);
		if (found) return found;
		if (data.users.length < perPage) break;
		page += 1;
	}
	return null;
}

/** El login usa el correo del formulario; hay que actualizar ese usuario de Auth. */
async function resolveAuthUser(
	admin: SupabaseClient,
	profileId: string,
	loginEmail: string
): Promise<User> {
	const byEmail = await findAuthUserByEmail(admin, loginEmail);
	if (byEmail) return byEmail;

	const { data: byId, error: byIdError } = await admin.auth.admin.getUserById(profileId);
	if (byIdError && !byIdError.message.toLowerCase().includes('not found')) {
		throw new Error(byIdError.message);
	}
	if (byId.user) return byId.user;

	throw new Error('No hay usuario de Auth para este correo. Vuelva a crear el acceso al portal.');
}

async function verifyPortalPassword(email: string, password: string): Promise<void> {
	const probe = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
		auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
	});

	let lastMessage = '';
	for (let attempt = 0; attempt < 4; attempt++) {
		if (attempt > 0) await new Promise((r) => setTimeout(r, 500));
		const { error } = await probe.auth.signInWithPassword({ email, password });
		await probe.auth.signOut({ scope: 'local' }).catch(() => undefined);
		if (!error) return;
		lastMessage = error.message;
	}

	throw new Error(
		`La contraseña no quedó activa en Auth (${lastMessage}). El correo de prueba fue ${email}.`
	);
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
	const password = input.password;
	const changedEmail = email !== client.email.trim().toLowerCase();
	const changedPassword = Boolean(password);

	const authUser = await resolveAuthUser(admin, client.profile_id, email);

	const { data: updated, error: authError } = await admin.auth.admin.updateUserById(authUser.id, {
		email,
		email_confirm: true,
		...(changedPassword ? { password } : {})
	});

	if (authError) {
		const msg = authError.message.toLowerCase();
		if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
			throw new Error('Ya existe un usuario con ese correo.');
		}
		throw new Error(authError.message);
	}
	if (!updated.user) {
		throw new Error('Auth no confirmó el cambio de acceso.');
	}

	if (authUser.id !== client.profile_id) {
		const { error: linkError } = await admin
			.from('clients')
			.update({ profile_id: authUser.id })
			.eq('id', clientId);
		if (linkError) throw new Error(linkError.message);
	}

	if (changedEmail || email !== client.email.trim().toLowerCase()) {
		const { error: clientUpdateError } = await admin
			.from('clients')
			.update({ email })
			.eq('id', clientId);
		if (clientUpdateError) throw new Error(clientUpdateError.message);

		const { error: profileError } = await admin
			.from('profiles')
			.update({ email })
			.eq('id', authUser.id);
		if (profileError) throw new Error(profileError.message);
	}

	if (changedPassword) {
		await verifyPortalPassword(email, password);
	}

	return { email, changedEmail, changedPassword };
}
