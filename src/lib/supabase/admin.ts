import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

let adminClient: SupabaseClient | null = null;

/** Cliente con service role — solo en servidor (crear usuarios Auth, etc.). */
export function createSupabaseAdminClient(): SupabaseClient {
	const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
	if (!serviceKey) {
		throw new Error(
			'Falta SUPABASE_SERVICE_ROLE_KEY en el servidor. Añádela a .env (ver .env.example).'
		);
	}
	if (!adminClient) {
		adminClient = createClient(PUBLIC_SUPABASE_URL, serviceKey, {
			auth: { autoRefreshToken: false, persistSession: false }
		});
	}
	return adminClient;
}
