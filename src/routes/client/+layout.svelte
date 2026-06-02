<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import ClientShell from '$lib/components/client/ClientShell.svelte';
	import { hydrateClientSession } from '$lib/lab/client-session';
	import { onMount } from 'svelte';
	import { initializeLabStorage } from '$lib/lab/store';

	let { children } = $props();

	async function boot() {
		initializeLabStorage({ linkClientPortal: true });
		try {
			await hydrateClientSession();
		} catch {
			/* perfil/casos siguen con localStorage si falla la red */
		}
	}

	onMount(() => {
		void boot();
	});

	afterNavigate(() => {
		initializeLabStorage({ linkClientPortal: true });
	});
</script>

<ClientShell>
	{@render children()}
</ClientShell>
