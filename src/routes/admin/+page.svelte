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
		getDeliveriesNextDays,
		getDeliveriesToday,
		getOpenInvoicesDueSoon,
		getOverdueDeliveries,
		getPendingStartCases
	} from '$lib/lab/analytics';
	import { ESTADOS_EN_PROCESO, getEstadoBadgeClass, getEstadoLabel } from '$lib/lab/constants';
	import { getInvoiceEstadoClass, getInvoiceEstadoLabel } from '$lib/lab/invoice-estado';
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
		revalidateLabDataFromDb
	} from '$lib/lab/store';
	import type { Invoice, LabCase } from '$lib/lab/types';

	let stats = $state({
		totalCasos: 0,
		pendientes: 0,
		enProceso: 0,
		ingresosTotales: 0,
		totalClientes: 0,
		facturasPendientes: 0
	});
	let activeCases = $state<LabCase[]>([]);
	let overdueDeliveries = $state<LabCase[]>([]);
	let todayDeliveries = $state<LabCase[]>([]);
	let pendingStart = $state<LabCase[]>([]);
	let upcomingDeliveries = $state<LabCase[]>([]);
	let openInvoices = $state<Invoice[]>([]);

	let showFinancial = $derived(canViewFinancial($page.data.staffRole ?? $page.data.profile?.role));

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
		overdueDeliveries = getOverdueDeliveries(casos);
		todayDeliveries = getDeliveriesToday(casos);
		pendingStart = getPendingStartCases(casos, 8);
		upcomingDeliveries = getDeliveriesNextDays(casos, 8);
		openInvoices = getOpenInvoicesDueSoon(invoices, 6);
	}
</script>

{#snippet casePreviewList(casos: LabCase[], empty: string)}
	{#if casos.length === 0}
		<p class="type-caption">{empty}</p>
	{:else}
		<ul class="dash-delivery-preview">
			{#each casos as caso (caso.id)}
				<li>
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
				</li>
			{/each}
		</ul>
	{/if}
{/snippet}

<div class="dash-page dash-page--home">
	<p class="dash-lead">
		Lo que hay que atender hoy: atrasos, entregas del día y casos que aún no arrancan.
	</p>

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
			<p class="dash-stat__label">Entrega hoy</p>
			<p class="dash-stat__value">{todayDeliveries.length}</p>
			<p class="dash-stat__hint">compromisos de este día</p>
		</div>
		<div class="dash-stat">
			<p class="dash-stat__label">Atrasadas</p>
			<p class="dash-stat__value">{overdueDeliveries.length}</p>
			<p class="dash-stat__hint">ya pasó la fecha de entrega</p>
		</div>
		{#if showFinancial}
			<div class="dash-stat">
				<p class="dash-stat__label">Por cobrar</p>
				<p class="dash-stat__value">{stats.facturasPendientes}</p>
				<p class="dash-stat__hint">
					<a href="/admin/facturas" class="text-link">Ver facturas →</a>
				</p>
			</div>
		{/if}
	</section>

	<section class="dash-insights" aria-labelledby="dash-today-title">
		<header class="dash-insights__head">
			<div>
				<h2 id="dash-today-title" class="dash-insights__title">Hoy en el taller</h2>
				<p class="dash-insights__lead">Atrasos, entregas de hoy y casos que faltan por iniciar</p>
			</div>
			<a href="/admin/calendario" class="btn-secondary-pill">Ver calendario</a>
		</header>

		<div class="dash-chart-grid dash-chart-grid--home">
			<div class="dash-panel">
				<h3 class="dash-panel__title">Atrasadas</h3>
				<p class="dash-panel__subtitle">Ya pasó la fecha de entrega</p>
				{@render casePreviewList(overdueDeliveries, 'No hay entregas atrasadas.')}
			</div>
			<div class="dash-panel">
				<h3 class="dash-panel__title">Entrega hoy</h3>
				<p class="dash-panel__subtitle">Hay que salir hoy</p>
				{@render casePreviewList(todayDeliveries, 'No hay entregas para hoy.')}
			</div>
			<div class="dash-panel">
				<h3 class="dash-panel__title">Por iniciar</h3>
				<p class="dash-panel__subtitle">Siguen en pendiente</p>
				{@render casePreviewList(pendingStart, 'No hay casos pendientes de iniciar.')}
			</div>
		</div>

		{#if showFinancial}
			<div class="dash-panel">
				<div class="dash-panel__header-row">
					<div>
						<h3 class="dash-panel__title">Cobros abiertos</h3>
						<p class="dash-panel__subtitle">Pendiente o facturado, por vencimiento</p>
					</div>
					<a href="/admin/facturas" class="btn-secondary-pill">Ver facturas</a>
				</div>
				{#if openInvoices.length === 0}
					<p class="type-caption">No hay facturas por cobrar.</p>
				{:else}
					<ul class="dash-delivery-preview">
						{#each openInvoices as inv (inv.id)}
							<li>
								<button
									type="button"
									class="dash-delivery-preview__item"
									onclick={() => goto(`/admin/facturas/${inv.id}`)}
								>
									<div class="dash-delivery-preview__main">
										<span class="dash-delivery-preview__case">{inv.invoice_number}</span>
										<span class="dash-delivery-preview__patient">{inv.paciente_name}</span>
										<span class="type-fine-print">{inv.client_name}</span>
									</div>
									<div class="dash-delivery-preview__aside">
										<span class={getInvoiceEstadoClass(inv.estado)}>
											{getInvoiceEstadoLabel(inv.estado)}
										</span>
										<span class="type-caption">{formatDateTime(inv.fecha_vencimiento)}</span>
										<span class="type-body-strong">{formatCurrency(inv.total)}</span>
									</div>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/if}
	</section>

	<section class="dash-panel dash-panel--cases">
		<div class="dash-panel__header-row">
			<div>
				<h3 class="dash-panel__title">Casos activos</h3>
				<p class="dash-panel__subtitle">
					Material, tono y fecha de entrega — ordenados por urgencia
				</p>
			</div>
			<a href="/admin/casos" class="btn-secondary-pill">Ver todos los casos</a>
		</div>

		{#if activeCases.length === 0}
			<p class="type-caption">No hay casos en producción. Los finalizados están en el listado completo.</p>
		{:else}
			<div class="case-card-grid">
				{#each activeCases as caso (caso.id)}
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
				<h3 class="dash-panel__title">Esta semana</h3>
				<p class="dash-panel__subtitle">Entregas de mañana a 7 días</p>
			</div>
			<a href="/admin/calendario" class="btn-secondary-pill">Ver calendario</a>
		</div>
		{@render casePreviewList(upcomingDeliveries, 'No hay más entregas en los próximos 7 días.')}
	</section>
</div>
