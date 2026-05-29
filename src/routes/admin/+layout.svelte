<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { getAuthRole, isAuthHydrated } from '$lib/auth/session.svelte';
	import AdminShell from '$lib/components/admin/AdminShell.svelte';
	import { initializeLabStorage } from '$lib/lab/store';

	let { children } = $props();

	$effect(() => {
		if (browser) initializeLabStorage();
	});

	$effect(() => {
		if (!browser || !isAuthHydrated()) return;
		if (getAuthRole() === 'client') goto('/client');
	});
</script>

<AdminShell>
	{@render children()}
</AdminShell>
