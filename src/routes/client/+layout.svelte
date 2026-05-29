<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import ClientShell from '$lib/components/client/ClientShell.svelte';
	import { onMount } from 'svelte';
	import { initializeLabStorage } from '$lib/lab/store';

	let { children } = $props();

	onMount(() => {
		initializeLabStorage({ linkClientPortal: true });
	});

	afterNavigate(() => {
		initializeLabStorage({ linkClientPortal: true });
	});
</script>

<ClientShell>
	{@render children()}
</ClientShell>
