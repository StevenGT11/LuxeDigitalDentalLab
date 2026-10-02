<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { isAdminRole } from '$lib/auth/roles';
	import ClientCaseForm from '$lib/components/lab/ClientCaseForm.svelte';
	import { CASE_ISSUED_INVOICE_MESSAGE, fetchCaseHasIssuedInvoice } from '$lib/lab/case-issued';
	import { getCaseByIdAsync, hydrateCasesOnce, initializeLabStorage } from '$lib/lab/store';
	import type { LabCase } from '$lib/lab/types';

	let caseId = $derived($page.params.caseId);
	let caso = $state<LabCase | null>(null);
	let loading = $state(true);
	let forbidden = $state(false);
	let issued = $state(false);

	const fromCliente = $derived($page.url.searchParams.get('from') === 'cliente');
	const returnTo = $derived.by(() => {
		if (!caso) return '/admin/casos';
		if (fromCliente) return `/admin/clientes/${caso.client_id}#facturas`;
		return `/admin/casos/${caso.id}`;
	});

	onMount(async () => {
		if (!isAdminRole($page.data.staffRole ?? $page.data.profile?.role)) {
			forbidden = true;
			loading = false;
			await goto(`/admin/casos/${caseId}`);
			return;
		}
		initializeLabStorage({ treatments: true });
		await hydrateCasesOnce();
		caso = await getCaseByIdAsync(caseId);
		issued = caso ? await fetchCaseHasIssuedInvoice(caso.id) : false;
		loading = false;
	});
</script>

{#if loading}
	<div class="dash-page">
		<p class="type-fine-print">Cargando caso…</p>
	</div>
{:else if forbidden}
	<div class="dash-page">
		<p class="type-caption">Solo el administrador puede editar casos.</p>
	</div>
{:else if !caso}
	<div class="dash-page">
		<p class="type-caption">Caso no encontrado</p>
	</div>
{:else if issued}
	<div class="dash-page">
		<p class="type-caption">{CASE_ISSUED_INVOICE_MESSAGE}</p>
		<button type="button" class="text-link dash-back" onclick={() => goto(returnTo)}>← Volver</button>
	</div>
{:else}
	<ClientCaseForm mode="edit" editCase={caso} audience="admin" {returnTo} />
{/if}
