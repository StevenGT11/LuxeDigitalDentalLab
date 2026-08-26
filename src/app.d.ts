import type { SupabaseClient, User } from '@supabase/supabase-js';

declare global {
	namespace App {
		interface Locals {
			supabase: SupabaseClient;
			/** Validates the JWT with Supabase Auth (getUser), not cookie-only getSession. */
			safeGetSession: () => Promise<{
				user: User | null;
			}>;
		}
	}
}

export {};
