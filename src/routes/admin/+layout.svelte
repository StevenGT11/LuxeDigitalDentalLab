<script lang="ts">
	import AdminShell from '$lib/components/admin/AdminShell.svelte';

	let { children } = $props();
</script>

<AdminShell>
	{@render children()}
</AdminShell>
