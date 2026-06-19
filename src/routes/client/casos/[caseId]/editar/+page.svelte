<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import ClientCaseForm from '$lib/components/lab/ClientCaseForm.svelte';
	import { canClientEditCase } from '$lib/lab/client-case-draft';
	import {
		getCaseByIdAsync,
		getClientId,
		hydrateCasesOnce,
		initializeLabStorage
	} from '$lib/lab/store';
	import type { LabCase } from '$lib/lab/types';

	let caseId = $derived($page.params.caseId);
	let caso = $state<LabCase | null>(null);
	let loading = $state(true);

	onMount(async () => {
		initializeLabStorage({ linkClientPortal: true });
		await hydrateCasesOnce();
		const loaded = await getCaseByIdAsync(caseId);
		if (!loaded || !canClientEditCase(loaded, getClientId())) {
			goto('/client');
			return;
		}
		caso = loaded;
		loading = false;
	});
</script>

{#if loading}
	<div class="dash-page">
		<p class="type-fine-print">Cargando caso…</p>
	</div>
{:else if caso}
	<ClientCaseForm mode="edit" editCase={caso} />
{/if}
