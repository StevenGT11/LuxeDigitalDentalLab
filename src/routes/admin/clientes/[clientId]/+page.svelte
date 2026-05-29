<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { afterNavigate } from '$app/navigation';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import {
		getClientById,
		getClientStats,
		getCasesByClient,
		getInvoicesByClient,
		initializeLabStorage
	} from '$lib/lab/store';
	import {
		getEstadoBadgeClass,
		getEstadoLabel,
		getInvoiceEstadoClass,
		getInvoiceEstadoLabel,
		getTipoTrabajoLabel
	} from '$lib/lab/constants';
	import { formatCurrency, formatDate } from '$lib/lab/helpers';
	import type { Invoice, LabCase, LabClient } from '$lib/lab/types';

	let clientId = $derived($page.params.clientId);
	let client = $state<LabClient | null>(null);
	let casos = $state<LabCase[]>([]);
	let facturas = $state<Invoice[]>([]);
	let stats = $state(getClientStats(''));

	onMount(() => refresh());

	afterNavigate(() => refresh());

	function refresh() {
		if (!browser) return;
		initializeLabStorage();
		load();
	}

	function load() {
		client = getClientById(clientId);
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
</script>

<div class="dash-page">
	<button type="button" class="text-link dash-back" onclick={() => goto('/admin/clientes')}>
		← Volver a clientes
	</button>

	{#if !client}
		<div class="store-utility-card empty-state">
			<p>Cliente no encontrado</p>
		</div>
	{:else}
		<header class="admin-page__header" style="display: flex; gap: var(--spacing-lg); align-items: flex-start;">
			<div class="avatar" style="width: 72px; height: 72px; font-size: 28px;">{client.nombre.charAt(0)}</div>
			<div>
				<h2 class="type-display-md" style="margin: 0;">{client.nombre}</h2>
				<p class="type-lead" style="margin-top: var(--spacing-xs); font-size: 17px;">{client.clinica}</p>
				{#if client.email}<p class="type-caption">{client.email}</p>{/if}
				{#if client.telefono}<p class="type-caption">{client.telefono}</p>{/if}
			</div>
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
			<div class="dash-stat">
				<p class="dash-stat__label">Total comprado</p>
				<p class="dash-stat__value dash-stat__value--currency">
					{formatCurrency(stats.totalGastado)}
				</p>
			</div>
			<div class="dash-stat">
				<p class="dash-stat__label">Finalizados</p>
				<p class="dash-stat__value">{stats.finalizados}</p>
			</div>
		</section>

		<section style="margin-top: var(--spacing-xxl);">
			<h3 class="type-tagline" style="margin: 0 0 var(--spacing-lg);">Casos de este cliente</h3>
			{#if casos.length === 0}
				<p class="type-caption">Sin casos registrados</p>
			{:else}
				<div class="data-table-wrap">
					<table class="data-table">
						<thead>
							<tr>
								<th>Caso</th>
								<th>Paciente</th>
								<th>Ítems</th>
								<th>Costo</th>
								<th>Estado</th>
								<th></th>
							</tr>
						</thead>
						<tbody>
							{#each casos as caso}
								<tr>
									<td class="type-body-strong">{caso.case_number}</td>
									<td>{caso.paciente_name}</td>
									<td class="type-caption">{itemsLabel(caso)}</td>
									<td>{formatCurrency(caso.costo)}</td>
									<td>
										<span class={getEstadoBadgeClass(caso.estado)}>
											{getEstadoLabel(caso.estado)}
										</span>
									</td>
									<td>
										<button
											type="button"
											class="text-link"
											onclick={() => goto(`/admin/casos/${caso.id}`)}
										>
											Ver
										</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>

		<section style="margin-top: var(--spacing-xxl);">
			<h3 class="type-tagline" style="margin: 0 0 var(--spacing-lg);">Facturas</h3>
			{#if facturas.length === 0}
				<p class="type-caption">Sin facturas</p>
			{:else}
				<div class="data-table-wrap">
					<table class="data-table">
						<thead>
							<tr>
								<th>Nº factura</th>
								<th>Caso</th>
								<th>Paciente</th>
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
									<td>{fac.paciente_name}</td>
									<td>{formatCurrency(fac.total)}</td>
									<td>
										<span class={getInvoiceEstadoClass(fac.estado)}>
											{getInvoiceEstadoLabel(fac.estado)}
										</span>
									</td>
									<td class="type-caption">{formatDate(fac.fecha_emision)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>
	{/if}
</div>
