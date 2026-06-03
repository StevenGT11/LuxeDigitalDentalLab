import { createSupabaseAdminClient } from '$lib/supabase/admin';
import { isValidEmailAddress } from '$lib/email';

/** Correos de perfiles con rol admin y cuenta activa. */
export async function fetchActiveAdminEmails(): Promise<string[]> {
	const supabase = createSupabaseAdminClient();
	const { data, error } = await supabase
		.from('profiles')
		.select('email')
		.eq('role', 'admin')
		.eq('activo', true);

	if (error) throw error;

	const seen = new Set<string>();
	const emails: string[] = [];

	for (const row of data ?? []) {
		const email = row.email?.trim();
		if (!email || !isValidEmailAddress(email)) continue;
		const key = email.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		emails.push(email);
	}

	return emails;
}
