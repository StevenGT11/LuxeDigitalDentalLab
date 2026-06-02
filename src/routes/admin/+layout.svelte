<script lang="ts">
	import { browser } from '$app/environment';
	import AdminShell from '$lib/components/admin/AdminShell.svelte';
	import { initializeLabStorage } from '$lib/lab/store';

	let { children } = $props();

	$effect(() => {
		if (browser) initializeLabStorage();
	});
</script>

<AdminShell>
	{@render children()}
</AdminShell>
