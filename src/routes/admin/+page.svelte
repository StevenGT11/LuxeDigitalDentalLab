<script lang="ts">
	import { afterNavigate, goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import CaseWorkTags from '$lib/components/admin/CaseWorkTags.svelte';
	import EstadoProgress from '$lib/components/admin/EstadoProgress.svelte';
	import { canViewFinancial } from '$lib/auth/roles';
	import {
		buildAdminDashboard,
		getActiveCases,
		getDeliveriesThisWeek,
		getUpcomingDeliveries
	} from '$lib/lab/analytics';
	import { ESTADOS, ESTADOS_EN_PROCESO, getEstadoBadgeClass, getEstadoLabel } from '$lib/lab/constants';
	import {
		deliveryUrgencyClass,
		formatCurrency,
		formatDateTime,
		formatDeliveryCountdown
	} from '$lib/lab/helpers';
	import {
		getAllCases,
		getAllClients,
		getAllInvoices,
		initializeLabStorage,
		revalidateLabDataFromDb,
		updateCaseStatus
	} from '$lib/lab/store';
	import type { LabCase, LabCaseEstado } from '$lib/lab/types';
	import { requestCaseFinalizedClientNotification } from '$lib/lab/notify-client';

	let stats = $state({
		totalCasos: 0,
		pendientes: 0,
		enProceso: 0,
		ingresosTotales: 0,
		totalClientes: 0,
		facturasPendientes: 0
	});
	let activeCases = $state<LabCase[]>([]);
	let deliveriesWeek = $state(0);
	let upcomingDeliveries = $state<LabCase[]>([]);

	let showFinancial = $derived(canViewFinancial($page.data.staffRole ?? $page.data.profile?.role));
	const estadosAdmin = ESTADOS.filter((e) => e.value !== 'todos');

	async function handleStatusChange(caso: LabCase, estado: string) {
		const prevEstado = caso.estado;
		const updated = await updateCaseStatus(caso.id, estado as LabCaseEstado);
		if (!updated) return;
		if (prevEstado !== 'finalizado' && updated.estado === 'finalizado') {
			requestCaseFinalizedClientNotification(updated.id);
		}
		await refresh();
	}

	onMount(() => void refresh());

	afterNavigate(() => void refresh());

	async function refresh() {
		if (!browser) return;
		initializeLabStorage();
		await revalidateLabDataFromDb();

		const casos = getAllCases();
		const clients = getAllClients();
		const invoices = getAllInvoices();

		stats = buildAdminDashboard(casos, clients, invoices, ESTADOS_EN_PROCESO);
		activeCases = getActiveCases(casos, 10);
		deliveriesWeek = getDeliveriesThisWeek(casos);
		upcomingDeliveries = getUpcomingDeliveries(casos, 6);
	}
</script>

<div class="dash-page dash-page--home">
	<p class="dash-lead">Casos en curso y entregas próximas.</p>

	<section class="dash-stat-grid dash-stat-grid--kpi">
		<div class="dash-stat dash-stat--accent">
			<p class="dash-stat__label">En producción</p>
			<p class="dash-stat__value">{stats.enProceso}</p>
			<p class="dash-stat__hint">casos activos en el taller</p>
		</div>
		<div class="dash-stat">
			<p class="dash-stat__label">Pendientes de iniciar</p>
			<p class="dash-stat__value">{stats.pendientes}</p>
			<p class="dash-stat__hint">sin diseño asignado</p>
		</div>
		<div class="dash-stat">
			<p class="dash-stat__label">Entregas (7 días)</p>
			<p class="dash-stat__value">{deliveriesWeek}</p>
			<p class="dash-stat__hint">compromisos próximos</p>
		</div>
		{#if showFinancial}
			<div class="dash-stat">
				<p class="dash-stat__label">Ingresos (casos)</p>
				<p class="dash-stat__value dash-stat__value--currency">
					{formatCurrency(stats.ingresosTotales)}
				</p>
				<p class="dash-stat__hint">{stats.totalCasos} casos · {stats.totalClientes} clientes</p>
			</div>
			<div class="dash-stat">
				<p class="dash-stat__label">Facturas por cobrar</p>
				<p class="dash-stat__value">{stats.facturasPendientes}</p>
				<p class="dash-stat__hint">
					<a href="/admin/facturas" class="text-link">Ver facturas →</a>
				</p>
			</div>
		{:else}
			<div class="dash-stat">
				<p class="dash-stat__label">Casos totales</p>
				<p class="dash-stat__value">{stats.totalCasos}</p>
				<p class="dash-stat__hint">{stats.totalClientes} clientes activos</p>
			</div>
		{/if}
	</section>

	<section class="dash-panel dash-panel--cases">
		<div class="dash-panel__header-row">
			<div>
				<h3 class="dash-panel__title">Casos activos</h3>
				<p class="dash-panel__subtitle">
					Los últimos casos que entraron al taller
				</p>
			</div>
			<a href="/admin/casos" class="btn-secondary-pill">Ver todos los casos</a>
		</div>

		{#if activeCases.length === 0}
			<p class="type-caption">No hay casos en producción. Los finalizados están en el listado completo.</p>
		{:else}
			<div class="case-card-grid">
				{#each activeCases as caso}
					<article class="case-card">
						<header class="case-card__header">
							<div>
								<span class="case-card__number">{caso.case_number}</span>
								<h4 class="case-card__patient">{caso.paciente_name}</h4>
								<p class="case-card__meta">
									<a href="/admin/clientes/{caso.client_id}" class="text-link">
										{caso.client_name}
									</a>
									{#if caso.client_clinica}
										· <span>{caso.client_clinica}</span>
									{/if}
								</p>
								<p class="case-card__doctor">{caso.doctor_name}</p>
							</div>
							<div class="case-card__aside">
								<span class={getEstadoBadgeClass(caso.estado)}>
									{getEstadoLabel(caso.estado)}
								</span>
								<span class={deliveryUrgencyClass(caso.fecha_entrega, caso.estado)}>
									{formatDeliveryCountdown(caso.fecha_entrega, caso.estado)}
								</span>
								<span class="type-caption">{formatDateTime(caso.fecha_entrega)}</span>
							</div>
						</header>

						<EstadoProgress estado={caso.estado} compact />

						<div class="case-card__work">
							<p class="case-card__work-label">Material y tono</p>
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
						</div>

						<footer class="case-card__footer">
							{#if showFinancial}
								<span class="case-card__cost">{formatCurrency(caso.costo)}</span>
							{/if}
							<select
								class="field-select dash-case-status"
								aria-label="Estado de {caso.case_number}"
								value={caso.estado}
								onchange={(e) => handleStatusChange(caso, e.currentTarget.value)}
							>
								{#each estadosAdmin as e (e.value)}
									<option value={e.value}>{e.label}</option>
								{/each}
							</select>
							<button
								type="button"
								class="text-link"
								onclick={() => goto(`/admin/casos/${caso.id}`)}
							>
								Abrir caso →
							</button>
						</footer>
					</article>
				{/each}
			</div>
		{/if}
	</section>

	<section class="dash-panel dash-panel--deliveries">
		<div class="dash-panel__header-row">
			<div>
				<h3 class="dash-panel__title">Próximas entregas</h3>
				<p class="dash-panel__subtitle">Las más próximas a entregar, incluidas las atrasadas</p>
			</div>
			<a href="/admin/calendario" class="btn-secondary-pill">Ver calendario</a>
		</div>
		{#if upcomingDeliveries.length === 0}
			<p class="type-caption">No hay entregas pendientes.</p>
		{:else}
			<ul class="dash-delivery-preview">
				{#each upcomingDeliveries as caso (caso.id)}
					<li class="dash-delivery-row">
						<button
							type="button"
							class="dash-delivery-preview__item"
							onclick={() => goto(`/admin/casos/${caso.id}`)}
						>
							<div class="dash-delivery-preview__main">
								<span class="dash-delivery-preview__case">{caso.case_number}</span>
								<span class="dash-delivery-preview__patient">{caso.paciente_name}</span>
								<span class="type-fine-print">{caso.client_name}</span>
							</div>
							<div class="dash-delivery-preview__aside">
								<span class={deliveryUrgencyClass(caso.fecha_entrega, caso.estado)}>
									{formatDeliveryCountdown(caso.fecha_entrega, caso.estado)}
								</span>
								<span class="type-caption">{formatDateTime(caso.fecha_entrega)}</span>
								<span class={getEstadoBadgeClass(caso.estado)}>
									{getEstadoLabel(caso.estado)}
								</span>
							</div>
						</button>
						<select
							class="field-select dash-case-status"
							aria-label="Estado de {caso.case_number}"
							value={caso.estado}
							onchange={(e) => handleStatusChange(caso, e.currentTarget.value)}
						>
							{#each estadosAdmin as e (e.value)}
								<option value={e.value}>{e.label}</option>
							{/each}
						</select>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>

<style>
	.dash-case-status {
		width: auto;
		min-width: 9.5rem;
		flex: 0 0 auto;
	}

	.dash-delivery-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}

	.dash-delivery-row :global(.dash-delivery-preview__item) {
		flex: 1 1 16rem;
	}
</style>
