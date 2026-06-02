import { createBrowserClient } from '@supabase/ssr';
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
import type { SupabaseClient } from '@supabase/supabase-js';

let browserClient: SupabaseClient | undefined;

/** Cliente Supabase para el navegador (portal cliente / admin en CSR). */
export function createSupabaseBrowserClient(): SupabaseClient {
	if (!browserClient) {
		browserClient = createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
	}
	return browserClient;
}
