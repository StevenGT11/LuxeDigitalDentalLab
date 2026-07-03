<script lang="ts">
	import { afterNavigate, goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import ColoredBarChart from '$lib/components/admin/ColoredBarChart.svelte';
	import CaseWorkTags from '$lib/components/admin/CaseWorkTags.svelte';
	import DonutChart from '$lib/components/admin/DonutChart.svelte';
	import EstadoProgress from '$lib/components/admin/EstadoProgress.svelte';
	import { canViewFinancial } from '$lib/auth/roles';
	import {
		buildAdminDashboard,
		getActiveCases,
		getClientRankings,
		getDeliveriesThisWeek,
		getMaterialDistribution,
		getPipelineByEstado,
		getShadeDistribution,
		getUpcomingDeliveries,
		pipelineToChartSegments,
		shadesToChartSegments
	} from '$lib/lab/analytics';
	import { ESTADOS_EN_PROCESO, getEstadoBadgeClass, getEstadoLabel } from '$lib/lab/constants';
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
		hydrateLabDataOnce,
		initializeLabStorage
	} from '$lib/lab/store';
	import type { LabCase } from '$lib/lab/types';

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
	let pipelineSegments = $state<ReturnType<typeof pipelineToChartSegments>>([]);
	let shadeSegments = $state<ReturnType<typeof shadesToChartSegments>>([]);
	let materialBars = $state<ReturnType<typeof getMaterialDistribution>>([]);
	let upcomingDeliveries = $state<LabCase[]>([]);
	let rankings = $state<ReturnType<typeof getClientRankings>>([]);

	let showFinancial = $derived(canViewFinancial($page.data.staffRole ?? $page.data.profile?.role));

	onMount(() => void refresh());

	afterNavigate(() => void refresh());

	async function refresh() {
		if (!browser) return;
		initializeLabStorage();
		await hydrateLabDataOnce();

		const casos = getAllCases();
		const clients = getAllClients();
		const invoices = getAllInvoices();

		stats = buildAdminDashboard(casos, clients, invoices, ESTADOS_EN_PROCESO);
		activeCases = getActiveCases(casos, 10);
		deliveriesWeek = getDeliveriesThisWeek(casos);

		const pipeline = getPipelineByEstado(casos);
		pipelineSegments = pipelineToChartSegments(pipeline);

		const shades = getShadeDistribution(casos);
		shadeSegments = shadesToChartSegments(shades);

		materialBars = getMaterialDistribution(casos);
		upcomingDeliveries = getUpcomingDeliveries(casos, 6);
		rankings = getClientRankings(casos, clients, 5);
	}
</script>

<div class="dash-page dash-page--home">
	<p class="dash-lead">
		Pipeline del taller, tonos VITA y casos en curso. Los colores BL, A y B reflejan los tonos pedidos
		en cada caso.
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
					Material, tono y fecha de entrega — ordenados por urgencia
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
				<p class="dash-panel__subtitle">Compromisos más urgentes</p>
			</div>
			<a href="/admin/calendario" class="btn-secondary-pill">Ver calendario</a>
		</div>
		{#if upcomingDeliveries.length === 0}
			<p class="type-caption">No hay entregas pendientes.</p>
		{:else}
			<ul class="dash-delivery-preview">
				{#each upcomingDeliveries as caso}
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
	</section>

	<section class="dash-insights" aria-labelledby="dash-insights-title">
		<header class="dash-insights__head">
			<div>
				<h2 id="dash-insights-title" class="dash-insights__title">Resumen del taller</h2>
				<p class="dash-insights__lead">
					{deliveriesWeek} entrega{deliveriesWeek === 1 ? '' : 's'} en los próximos 7 días
				</p>
			</div>
		</header>

		<div class="dash-chart-grid dash-chart-grid--home">
			<div class="dash-panel dash-panel--chart">
				<h3 class="dash-panel__title">Pipeline de casos</h3>
				<p class="dash-panel__subtitle">Casos en cada etapa del flujo</p>
				<div class="dash-panel__chart dash-panel__chart--centered">
					<DonutChart segments={pipelineSegments} size={168} unit=" casos" />
				</div>
			</div>

			<div class="dash-panel dash-panel--chart dash-panel--chart-wide">
				<h3 class="dash-panel__title">Tonos VITA pedidos</h3>
				<p class="dash-panel__subtitle">Bleach (BL), serie A y B</p>
				<div class="dash-panel__chart dash-panel__chart--split">
					<DonutChart segments={shadeSegments} size={156} unit=" pzs" />
					{#if shadeSegments.length > 0}
						<ul class="shade-legend shade-legend--compact">
							{#each shadeSegments as shade}
								<li class="shade-legend__item">
									<span
										class="shade-legend__swatch"
										style="background: {shade.color}"
										class:shade-legend__swatch--bleach={shade.label.startsWith('BL')}
									></span>
									<span class="shade-legend__name">{shade.label}</span>
									<span class="shade-legend__count">{shade.value} pzs</span>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="type-caption">Sin tonos registrados aún.</p>
					{/if}
				</div>
			</div>

			<div class="dash-panel dash-panel--chart">
				<h3 class="dash-panel__title">Materiales en producción</h3>
				<p class="dash-panel__subtitle">Zirconio, Emax, PMMA…</p>
				{#if materialBars.length === 0}
					<p class="type-caption">Sin materiales en casos activos.</p>
				{:else}
					<ColoredBarChart
						segments={materialBars.map((m) => ({
							label: m.label,
							value: m.piezas,
							color: m.color
						}))}
						suffix=" pzs"
					/>
				{/if}
			</div>
		</div>

		<div class="dash-panel">
			<h3 class="dash-panel__title">
				{showFinancial ? 'Clientes con más volumen' : 'Clientes con más casos'}
			</h3>
			<p class="dash-panel__subtitle">
				{showFinancial ? 'Por facturación acumulada' : 'Por cantidad de casos enviados'}
			</p>
			{#if rankings.length === 0}
				<p class="type-caption">Sin datos</p>
			{:else}
				<ol class="admin-ranking">
					{#each rankings as row, i}
						<li class="admin-ranking__item">
							<span class="admin-ranking__pos">{i + 1}</span>
							<div class="admin-ranking__body">
								<a href="/admin/clientes/{row.client.id}" class="text-link type-body-strong">
									{row.client.nombre}
								</a>
								<p class="type-fine-print">
									{row.totalCasos} casos · {row.totalPiezas} piezas
								</p>
							</div>
							{#if showFinancial}
								<span class="type-body-strong">{formatCurrency(row.totalGastado)}</span>
							{/if}
						</li>
					{/each}
				</ol>
			{/if}
		</div>
	</section>
</div>
