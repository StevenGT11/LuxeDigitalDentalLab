import { createSupabaseServerClient } from '$lib/supabase/server';
import { installFacturadorExemptDesglosePatch } from '$lib/fe/facturador-patch.server';
import type { Handle } from '@sveltejs/kit';

installFacturadorExemptDesglosePatch();

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.supabase = createSupabaseServerClient(event.cookies);

	event.locals.safeGetSession = async () => {
		const {
			data: { user },
			error
		} = await event.locals.supabase.auth.getUser();

		if (error || !user) {
			return { user: null };
		}

		return { user };
	};

	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			return name === 'content-range' || name === 'x-supabase-api-version';
		}
	});
};
