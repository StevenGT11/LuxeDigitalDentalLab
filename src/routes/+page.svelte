<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import {
		getAuthRole,
		getHomePathForRole,
		isAuthHydrated,
		isAuthenticated
	} from '$lib/auth/session.svelte';

	$effect(() => {
		if (!browser || !isAuthHydrated() || !isAuthenticated()) return;
		const role = getAuthRole();
		if (role) goto(getHomePathForRole(role), { replaceState: true });
	});
</script>

<!-- Sin sesión: el layout raíz muestra el login. Con sesión: redirige al portal correspondiente. -->
