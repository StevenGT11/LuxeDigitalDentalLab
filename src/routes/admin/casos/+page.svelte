<script lang="ts">
	import { afterNavigate, goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import CaseWorkTags from '$lib/components/admin/CaseWorkTags.svelte';
	import EstadoProgress from '$lib/components/admin/EstadoProgress.svelte';
	import { canViewFinancial } from '$lib/auth/roles';
	import { getAdminStats, getAllCases, hydrateCasesOnce, initializeLabStorage } from '$lib/lab/store';
	import {
		ESTADOS,
		getEstadoBadgeClass,
		getEstadoLabel
	} from '$lib/lab/constants';
	import {
		deliveryUrgencyClass,
		formatCurrency,
		formatDate,
		formatDateTime,
		formatDeliveryCountdown
	} from '$lib/lab/helpers';
	import type { LabCase } from '$lib/lab/types';

	let casos = $state<LabCase[]>([]);
	let filteredCasos = $state<LabCase[]>([]);
	let selectedEstado = $state('todos');
	let searchQuery = $state('');
	let stats = $state({ totalCasos: 0, pendientes: 0, enProceso: 0, ingresosTotales: 0 });

	let showFinancial = $derived(canViewFinancial($page.data.staffRole ?? $page.data.profile?.role));

	onMount(() => void refresh());

	afterNavigate(() => void refresh());

	async function refresh() {
		if (!browser) return;
		initializeLabStorage();
		await hydrateCasesOnce();
		casos = getAllCases();
		stats = getAdminStats();
		applyFilters();
	}

	function applyFilters() {
		let filtered = [...casos];
		if (selectedEstado !== 'todos') {
			filtered = filtered.filter((c) => c.estado === selectedEstado);
		}
		if (searchQuery.trim()) {
			const q = searchQuery.toLowerCase().trim();
			filtered = filtered.filter(
				(c) =>
					c.case_number.toLowerCase().includes(q) ||
					c.paciente_name.toLowerCase().includes(q) ||
					c.client_name.toLowerCase().includes(q) ||
					c.client_clinica.toLowerCase().includes(q) ||
					c.doctor_name.toLowerCase().includes(q) ||
					c.items.some(
						(i) =>
							(i.color?.toLowerCase().includes(q) ?? false) ||
							(i.tipo_trabajo?.toLowerCase().includes(q) ?? false)
					) ||
					(c.color?.toLowerCase().includes(q) ?? false)
			);
		}
		filtered.sort(
			(a, b) => new Date(a.fecha_entrega).getTime() - new Date(b.fecha_entrega).getTime()
		);
		filteredCasos = filtered;
	}

	$effect(() => {
		selectedEstado;
		searchQuery;
		casos;
		applyFilters();
	});
</script>

<div class="dash-page">
	<p class="dash-lead">
		Cada fila muestra paciente, clínica, material, tono VITA y progreso en el taller.
	</p>

	<section class="dash-stat-grid dash-stat-grid--compact">
		<div class="dash-stat">
			<p class="dash-stat__label">Total</p>
			<p class="dash-stat__value">{stats.totalCasos}</p>
		</div>
		<div class="dash-stat">
			<p class="dash-stat__label">Pendientes</p>
			<p class="dash-stat__value">{stats.pendientes}</p>
		</div>
		<div class="dash-stat">
			<p class="dash-stat__label">En proceso</p>
			<p class="dash-stat__value">{stats.enProceso}</p>
		</div>
		{#if showFinancial}
			<div class="dash-stat">
				<p class="dash-stat__label">Ingresos</p>
				<p class="dash-stat__value dash-stat__value--currency">
					{formatCurrency(stats.ingresosTotales)}
				</p>
			</div>
		{/if}
	</section>

	<div class="dash-toolbar">
		<input
			type="search"
			class="search-input"
			style="flex: 1; min-width: 200px;"
			bind:value={searchQuery}
			placeholder="Buscar caso, paciente, tono BL/A/B…"
		/>
		<select class="field-select" style="width: auto; min-width: 180px;" bind:value={selectedEstado}>
			{#each ESTADOS as estado}
				<option value={estado.value}>{estado.label}</option>
			{/each}
		</select>
	</div>

	{#if filteredCasos.length === 0}
		<div class="store-utility-card empty-state">
			<p>No se encontraron casos</p>
		</div>
	{:else}
		<div class="case-list">
			{#each filteredCasos as caso}
				<article class="case-list__row">
					<div class="case-list__main">
						<div class="case-list__ids">
							<span class="case-list__number">{caso.case_number}</span>
							<span class={getEstadoBadgeClass(caso.estado)}>{getEstadoLabel(caso.estado)}</span>
						</div>
						<h3 class="case-list__patient">{caso.paciente_name}</h3>
						<p class="case-list__client">
							<a href="/admin/clientes/{caso.client_id}" class="text-link type-body-strong">
								{caso.client_name}
							</a>
							{#if caso.client_clinica}
								· {caso.client_clinica}
							{/if}
							· {caso.doctor_name}
						</p>
						<CaseWorkTags
							variant="minimal"
							items={caso.items}
							fallback={{
								tipo_trabajo: caso.tipo_trabajo,
								material: caso.material,
								color: caso.color,
								piezas: caso.piezas
							}}
						/>
						<EstadoProgress estado={caso.estado} compact />
					</div>
					<div class="case-list__side">
						{#if showFinancial}
							<p class="case-list__cost">{formatCurrency(caso.costo)}</p>
						{/if}
						<span class={deliveryUrgencyClass(caso.fecha_entrega, caso.estado)}>
							{formatDeliveryCountdown(caso.fecha_entrega, caso.estado)}
						</span>
						<span class="type-caption">{formatDateTime(caso.fecha_entrega)}</span>
						<button
							type="button"
							class="btn-primary case-list__btn"
							onclick={() => goto(`/admin/casos/${caso.id}`)}
						>
							Ver detalle
						</button>
					</div>
				</article>
			{/each}
		</div>
	{/if}
</div>
