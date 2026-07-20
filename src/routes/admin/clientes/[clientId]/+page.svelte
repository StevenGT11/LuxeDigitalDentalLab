<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { afterNavigate } from '$app/navigation';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { Trash2 } from '@lucide/svelte';
	import { canManageClients, canViewFinancial } from '$lib/auth/roles';
	import AdminClientDoctorsEditor from '$lib/components/admin/AdminClientDoctorsEditor.svelte';
	import CasePreviewModal from '$lib/components/admin/CasePreviewModal.svelte';
	import DoctorProductionSummary from '$lib/components/lab/DoctorProductionSummary.svelte';
	import { getDoctorProductionStats } from '$lib/lab/analytics';
	import { loadClientForAdmin } from '$lib/lab/client-session';
	import {
		getClientById,
		getClientStats,
		getCasesByClient,
		getInvoicesByClient,
		hydrateCasesOnce,
		initializeLabStorage
	} from '$lib/lab/store';
	import {
		getEstadoBadgeClass,
		getEstadoLabel,
		getInvoiceEstadoClass,
		getInvoiceEstadoLabel,
		getMaterialLabel,
		getTipoTrabajoLabel
	} from '$lib/lab/constants';
	import { formatCurrency, formatDate } from '$lib/lab/helpers';
	import type { Invoice, LabCase, LabClient } from '$lib/lab/types';

	let clientId = $derived($page.params.clientId);
	let client = $state<LabClient | null>(null);
	let casos = $state<LabCase[]>([]);
	let facturas = $state<Invoice[]>([]);
	let stats = $state(getClientStats(''));
	let loading = $state(true);
	let deleteOpen = $state(false);
	let deleting = $state(false);
	let deleteError = $state('');
	let createdNotice = $state(false);
	let previewCase = $state<LabCase | null>(null);
	let searchQuery = $state('');

	let showFinancial = $derived(canViewFinancial($page.data.staffRole ?? $page.data.profile?.role));
	let canManage = $derived(canManageClients($page.data.staffRole ?? $page.data.profile?.role));
	let doctorProduction = $derived(getDoctorProductionStats(casos));

	let filteredCasos = $derived.by(() => {
		const q = searchQuery.trim().toLowerCase();
		if (!q) return casos;
		return casos.filter(
			(c) =>
				c.case_number.toLowerCase().includes(q) ||
				c.paciente_name.toLowerCase().includes(q) ||
				getTipoTrabajoLabel(c.tipo_trabajo).toLowerCase().includes(q) ||
				getEstadoLabel(c.estado).toLowerCase().includes(q) ||
				(c.material && getMaterialLabel(c.material, c.tipo_trabajo).toLowerCase().includes(q)) ||
				(c.doctor_name?.toLowerCase().includes(q) ?? false) ||
				(c.color?.toLowerCase().includes(q) ?? false) ||
				c.items.some(
					(i) =>
						getTipoTrabajoLabel(i.tipo_trabajo).toLowerCase().includes(q) ||
						(i.color?.toLowerCase().includes(q) ?? false)
				)
		);
	});

	let deleteModeLabel = $derived(
		stats.totalCasos === 0
			? 'Se eliminará el cliente y su usuario de acceso de forma permanente.'
			: `Tiene ${stats.totalCasos} caso(s): se quitará el acceso al portal y el cliente dejará de aparecer en la lista. Casos y facturas se conservan.`
	);

	onMount(() => refresh());

	afterNavigate(() => refresh());

	async function refresh() {
		if (!browser) return;
		createdNotice = $page.url.searchParams.get('created') === '1';
		initializeLabStorage();
		await hydrateCasesOnce();
		loading = true;
		searchQuery = '';
		try {
			const fromDb = await loadClientForAdmin(clientId);
			client = fromDb ?? getClientById(clientId);
		} catch {
			client = getClientById(clientId);
		}
		load();
		loading = false;
	}

	function load() {
		if (!client) return;
		casos = getCasesByClient(clientId);
		facturas = getInvoicesByClient(clientId);
		stats = getClientStats(clientId);
	}

	function itemsLabel(caso: LabCase): string {
		return caso.items
			.map((i) => `${getTipoTrabajoLabel(i.tipo_trabajo)} ×${i.piezas}`)
			.join(' · ');
	}

	function openCasePreview(caso: LabCase) {
		previewCase = caso;
	}

	function closeCasePreview() {
		previewCase = null;
	}
</script>

<div class="dash-page">
	<button type="button" class="text-link dash-back" onclick={() => goto('/admin/clientes')}>
		← Volver a clientes
	</button>

	{#if createdNotice}
		<div class="alert alert--success">Cliente creado. Comparte el correo y la contraseña para el acceso al portal.</div>
	{/if}

	{#if loading}
		<p class="type-caption">Cargando…</p>
	{:else if !client}
		<div class="store-utility-card empty-state">
			<p>Cliente no encontrado</p>
		</div>
	{:else}
		<header class="client-detail-header">
			<div class="client-detail-header__main">
				<div class="avatar" style="width: 72px; height: 72px; font-size: 28px;">
					{client.nombre.charAt(0)}
				</div>
				<div>
					<h2 class="type-display-md" style="margin: 0;">{client.nombre}</h2>
					<p class="type-lead" style="margin-top: var(--spacing-xs); font-size: 17px;">{client.clinica}</p>
					{#if client.email}<p class="type-caption">{client.email}</p>{/if}
					{#if client.telefono}<p class="type-caption">{client.telefono}</p>{/if}
				</div>
			</div>
			{#if showFinancial}
				<button
					type="button"
					class="btn-danger-outline"
					onclick={() => {
						deleteError = '';
						deleteOpen = true;
					}}
				>
					<Trash2 size={16} />
					Eliminar cliente
				</button>
			{/if}
		</header>

		<section class="dash-stat-grid dash-stat-grid--compact">
			<div class="dash-stat">
				<p class="dash-stat__label">Casos</p>
				<p class="dash-stat__value">{stats.totalCasos}</p>
			</div>
			<div class="dash-stat">
				<p class="dash-stat__label">Piezas totales</p>
				<p class="dash-stat__value">{stats.totalPiezas}</p>
			</div>
			{#if showFinancial}
				<div class="dash-stat">
					<p class="dash-stat__label">Total comprado</p>
					<p class="dash-stat__value dash-stat__value--currency">
						{formatCurrency(stats.totalGastado)}
					</p>
				</div>
			{/if}
			<div class="dash-stat">
				<p class="dash-stat__label">Finalizados</p>
				<p class="dash-stat__value">{stats.finalizados}</p>
			</div>
		</section>

		<section style="margin-top: var(--spacing-xxl);">
			<div class="client-cases-section__head">
				<h3 class="type-tagline" style="margin: 0;">Casos de este cliente</h3>
				{#if casos.length > 0}
					<span class="type-fine-print">
						{#if searchQuery.trim() && filteredCasos.length !== casos.length}
							{filteredCasos.length} de {casos.length} caso(s)
						{:else}
							{casos.length} caso(s)
						{/if}
					</span>
				{/if}
			</div>
			{#if casos.length === 0}
				<p class="type-caption">Sin casos registrados</p>
			{:else}
				<div class="dash-toolbar client-cases-section__toolbar">
					<input
						type="search"
						class="search-input"
						bind:value={searchQuery}
						placeholder="Buscar por número, paciente, doctor, trabajo, tono…"
						aria-label="Buscar casos del cliente"
					/>
				</div>

				{#if filteredCasos.length === 0}
					<div class="dash-panel empty-state client-cases-section__empty">
						<p>Ningún caso coincide con «{searchQuery.trim()}»</p>
						<button type="button" class="btn-secondary-pill" onclick={() => (searchQuery = '')}>
							Limpiar búsqueda
						</button>
					</div>
				{:else}
				<div class="data-table-wrap">
					<table class="data-table">
						<thead>
							<tr>
								<th>Caso</th>
								<th>Paciente</th>
								<th>Ítems</th>
								{#if showFinancial}<th>Costo</th>{/if}
								<th>Estado</th>
								<th></th>
							</tr>
						</thead>
						<tbody>
							{#each filteredCasos as caso}
								<tr>
									<td class="type-body-strong">{caso.case_number}</td>
									<td>{caso.paciente_name}</td>
									<td class="type-caption">{itemsLabel(caso)}</td>
									{#if showFinancial}<td>{formatCurrency(caso.costo)}</td>{/if}
									<td>
										<span class={getEstadoBadgeClass(caso.estado)}>{getEstadoLabel(caso.estado)}</span>
									</td>
									<td>
										<button type="button" class="text-link" onclick={() => openCasePreview(caso)}>
											Ver
										</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				{/if}
			{/if}
		</section>

		{#if canManage}
			<AdminClientDoctorsEditor clientId={client.id} />
		{/if}

		<div class="dash-panel dash-panel--section" style="margin-top: var(--spacing-lg);">
			<DoctorProductionSummary stats={doctorProduction} />
		</div>

		{#if showFinancial}
			<section style="margin-top: var(--spacing-xxl);">
				<h3 class="type-tagline" style="margin: 0 0 var(--spacing-lg);">Facturas</h3>
				{#if facturas.length === 0}
					<p class="type-caption">Sin facturas</p>
				{:else}
					<div class="data-table-wrap">
						<table class="data-table">
							<thead>
								<tr>
									<th>Número</th>
									<th>Caso</th>
									<th>Total</th>
									<th>Estado</th>
									<th>Emisión</th>
								</tr>
							</thead>
							<tbody>
								{#each facturas as fac}
									<tr>
										<td class="type-body-strong">{fac.invoice_number}</td>
										<td>{fac.case_number}</td>
										<td>{formatCurrency(fac.total)}</td>
										<td>
											<span class={getInvoiceEstadoClass(fac.estado)}>
												{getInvoiceEstadoLabel(fac.estado)}
											</span>
										</td>
										<td>{formatDate(fac.fecha_emision)}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</section>
		{/if}
	{/if}
</div>

{#if deleteOpen && client && showFinancial}
	<div class="case-file-modal__backdrop" onclick={() => !deleting && (deleteOpen = false)} role="presentation"></div>
	<div
		class="case-file-modal case-file-modal--form"
		role="dialog"
		aria-modal="true"
		aria-labelledby="delete-client-title"
	>
		<header class="case-file-modal__header">
			<div>
				<p class="case-file-modal__eyebrow">Zona de riesgo</p>
				<h3 class="case-file-modal__title" id="delete-client-title">Eliminar cliente</h3>
			</div>
			<button
				type="button"
				class="case-file-modal__close"
				aria-label="Cerrar"
				disabled={deleting}
				onclick={() => (deleteOpen = false)}
			>
				×
			</button>
		</header>

		<form
			class="case-file-modal__body"
			method="POST"
			action="?/delete"
			use:enhance={() => {
				deleting = true;
				deleteError = '';
				return async ({ result, update }) => {
					deleting = false;
					if (result.type === 'failure') {
						deleteError =
							(typeof result.data === 'object' &&
								result.data &&
								'message' in result.data &&
								String(result.data.message)) ||
							'No se pudo eliminar';
						await update();
						return;
					}
					await update();
				};
			}}
		>
			<input type="hidden" name="confirm" value="yes" />
			<div class="case-file-modal__fields">
				<p class="case-file-modal__lead">{deleteModeLabel}</p>
				<p class="type-caption">
					Cliente: <strong>{client.nombre}</strong>
				</p>
				{#if deleteError}
					<div class="alert alert--error">{deleteError}</div>
				{/if}
			</div>
			<div class="case-file-modal__footer">
				<button
					type="button"
					class="btn-pearl-capsule"
					disabled={deleting}
					onclick={() => (deleteOpen = false)}
				>
					Cancelar
				</button>
				<button type="submit" class="btn-danger" disabled={deleting}>
					{deleting ? 'Eliminando…' : stats.totalCasos === 0 ? 'Eliminar permanentemente' : 'Eliminar acceso'}
				</button>
			</div>
		</form>
	</div>
{/if}

<CasePreviewModal caso={previewCase} detailed onClose={closeCasePreview} />

<style>
	.client-detail-header {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-lg);
		align-items: flex-start;
		justify-content: space-between;
	}

	.client-detail-header__main {
		display: flex;
		gap: var(--spacing-lg);
		align-items: flex-start;
	}

	.client-cases-section__head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.75rem 1rem;
		margin-bottom: var(--spacing-lg);
	}

	.client-cases-section__toolbar {
		margin-bottom: 1rem;
	}

	.client-cases-section__toolbar .search-input {
		flex: 1;
		min-width: min(100%, 220px);
	}

	.client-cases-section__empty {
		margin-top: 0;
	}
</style>
