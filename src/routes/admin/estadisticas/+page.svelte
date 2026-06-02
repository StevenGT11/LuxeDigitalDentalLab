<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import type { ChartData, ChartOptions } from 'chart.js';
	import ChartJs from '$lib/components/admin/ChartJs.svelte';
	import VitaShadesPanel from '$lib/components/admin/VitaShadesPanel.svelte';
	import { horizontalBarOptions } from '$lib/charts/chart-theme';
	import {
		anatomyToChartSegments,
		buildAdminDashboard,
		clientRankingsToChartSegments,
		getAnatomyStats,
		getClientRankings,
		getDeliveryHealth,
		getDoctorStats,
		getInvoiceSummary,
		getMaterialDistribution,
		getMonthlyStats,
		getPipelineByEstado,
		getProductionStats,
		getServiceBreakdown,
		getShadeDistribution,
		getTotalsOverview,
		materialToChartSegments,
		pipelineToChartSegments,
		productionToChartSegments,
		type ShadeStat
	} from '$lib/lab/analytics';
	import { ESTADOS_EN_PROCESO } from '$lib/lab/constants';
	import { formatCurrency } from '$lib/lab/helpers';
	import {
		getAllCases,
		getAllClients,
		getAllInvoices,
		hydrateLabDataOnce,
		initializeLabStorage
	} from '$lib/lab/store';
	import type { ClientRanking } from '$lib/lab/types';

	let dashboard = $state({
		totalCasos: 0,
		pendientes: 0,
		enProceso: 0,
		ingresosTotales: 0,
		totalClientes: 0,
		coronasPiezas: 0,
		puentesPiezas: 0,
		facturasPendientes: 0
	});
	let overview = $state({ piezas: 0, ingresos: 0, finalizados: 0, ticketPromedio: 0, piezasPorCaso: 0 });
	let deliveryHealth = $state({ aTiempo: 0, atrasados: 0, entregados: 0 });
	let invoiceSummary = $state({
		pendiente: 0,
		pagada: 0,
		cancelada: 0,
		montoPendiente: 0,
		montoPagado: 0,
		montoTotal: 0
	});
	let rankings = $state<ClientRanking[]>([]);
	let doctors = $state<ReturnType<typeof getDoctorStats>>([]);

	let revenueLineData = $state<ChartData<'line'>>({ labels: [], datasets: [] });
	let casesBarData = $state<ChartData<'bar'>>({ labels: [], datasets: [] });
	let piezasBarData = $state<ChartData<'bar'>>({ labels: [], datasets: [] });
	let pipelineDoughnut = $state<ChartData<'doughnut'>>({ labels: [], datasets: [] });
	let productionBar = $state<ChartData<'bar'>>({ labels: [], datasets: [] });
	let materialDoughnut = $state<ChartData<'doughnut'>>({ labels: [], datasets: [] });
	let anatomyBar = $state<ChartData<'bar'>>({ labels: [], datasets: [] });
	let shadeStats = $state<ShadeStat[]>([]);
	let servicesDoughnut = $state<ChartData<'doughnut'>>({ labels: [], datasets: [] });
	let clientsBar = $state<ChartData<'bar'>>({ labels: [], datasets: [] });
	let doctorsBar = $state<ChartData<'bar'>>({ labels: [], datasets: [] });
	let deliveryDoughnut = $state<ChartData<'doughnut'>>({ labels: [], datasets: [] });
	let invoicesDoughnut = $state<ChartData<'doughnut'>>({ labels: [], datasets: [] });

	const currencyBarOptions: ChartOptions<'bar'> = {
		...horizontalBarOptions,
		scales: {
			...horizontalBarOptions.scales,
			x: {
				...(horizontalBarOptions.scales?.x as object),
				ticks: {
					callback: (v) =>
						new Intl.NumberFormat('es-CR', {
							style: 'currency',
							currency: 'USD',
							maximumFractionDigits: 0
						}).format(Number(v))
				}
			}
		}
	};

	async function refresh() {
		if (!browser) return;
		initializeLabStorage();
		await hydrateLabDataOnce();

		const casos = getAllCases();
		const clients = getAllClients();
		const invoices = getAllInvoices();

		dashboard = buildAdminDashboard(casos, clients, invoices, ESTADOS_EN_PROCESO);
		overview = getTotalsOverview(casos);
		deliveryHealth = getDeliveryHealth(casos);
		invoiceSummary = getInvoiceSummary(invoices);
		rankings = getClientRankings(casos, clients, 10);
		doctors = getDoctorStats(casos, 8);

		const monthly = getMonthlyStats(casos, 6);
		const monthLabels = monthly.map((m) => m.label);

		revenueLineData = {
			labels: monthLabels,
			datasets: [
				{
					label: 'Ingresos',
					data: monthly.map((m) => m.ingresos),
					borderColor: '#6366f1'
				}
			]
		};

		casesBarData = {
			labels: monthLabels,
			datasets: [{ label: 'Casos', data: monthly.map((m) => m.casos), backgroundColor: '#818cf8' }]
		};

		piezasBarData = {
			labels: monthLabels,
			datasets: [{ label: 'Piezas', data: monthly.map((m) => m.piezas), backgroundColor: '#22d3ee' }]
		};

		const pipeline = pipelineToChartSegments(getPipelineByEstado(casos));
		pipelineDoughnut = {
			labels: pipeline.map((s) => s.label),
			datasets: [
				{
					data: pipeline.map((s) => s.value),
					backgroundColor: pipeline.map((s) => s.color)
				}
			]
		};

		const production = productionToChartSegments(getProductionStats(casos));
		productionBar = {
			labels: production.map((s) => s.label),
			datasets: [
				{
					label: 'Piezas',
					data: production.map((s) => s.value),
					backgroundColor: production.map((s) => s.color)
				}
			]
		};

		const materials = materialToChartSegments(getMaterialDistribution(casos));
		materialDoughnut = {
			labels: materials.map((s) => s.label),
			datasets: [
				{
					data: materials.map((s) => s.value),
					backgroundColor: materials.map((s) => s.color)
				}
			]
		};

		const anatomy = anatomyToChartSegments(getAnatomyStats(casos));
		anatomyBar = {
			labels: anatomy.map((s) => s.label),
			datasets: [
				{
					label: 'Piezas',
					data: anatomy.map((s) => s.value),
					backgroundColor: anatomy.map((s) => s.color)
				}
			]
		};

		shadeStats = getShadeDistribution(casos);

		const services = getServiceBreakdown(casos);
		servicesDoughnut = {
			labels: services.map((s) => s.label),
			datasets: [
				{
					data: services.map((s) => s.piezas),
					backgroundColor: services.map((s) => s.color)
				}
			]
		};

		const clientSegs = clientRankingsToChartSegments(rankings, 8);
		clientsBar = {
			labels: clientSegs.map((s) => s.label),
			datasets: [
				{
					label: 'Total gastado',
					data: clientSegs.map((s) => s.value),
					backgroundColor: clientSegs.map((s) => s.color)
				}
			]
		};

		doctorsBar = {
			labels: doctors.map((d) =>
				d.doctor_name.length > 20 ? d.doctor_name.slice(0, 18) + '…' : d.doctor_name
			),
			datasets: [{ label: 'Ingresos', data: doctors.map((d) => d.ingresos), backgroundColor: '#a78bfa' }]
		};

		deliveryDoughnut = {
			labels: ['En plazo', 'Atrasados', 'Finalizados'],
			datasets: [
				{
					data: [deliveryHealth.aTiempo, deliveryHealth.atrasados, deliveryHealth.entregados],
					backgroundColor: ['#34d399', '#f87171', '#94a3b8']
				}
			]
		};

		invoicesDoughnut = {
			labels: ['Pendientes', 'Pagadas', 'Canceladas'],
			datasets: [
				{
					data: [invoiceSummary.pendiente, invoiceSummary.pagada, invoiceSummary.cancelada],
					backgroundColor: ['#fbbf24', '#34d399', '#cbd5e1']
				}
			]
		};
	}

	onMount(() => void refresh());

	afterNavigate(() => void refresh());
</script>

<div class="dash-page dash-page--stats">
	<p class="dash-lead">
		Panel analítico del laboratorio con Chart.js — ingresos, producción, materiales, tonos VITA,
		servicios y clientes.
	</p>

	<section class="stats-kpi-grid">
		<div class="dash-stat dash-stat--accent">
			<p class="dash-stat__label">Ingresos totales</p>
			<p class="dash-stat__value dash-stat__value--currency">{formatCurrency(overview.ingresos)}</p>
		</div>
		<div class="dash-stat">
			<p class="dash-stat__label">Casos</p>
			<p class="dash-stat__value">{dashboard.totalCasos}</p>
		</div>
		<div class="dash-stat">
			<p class="dash-stat__label">Piezas totales</p>
			<p class="dash-stat__value">{overview.piezas}</p>
		</div>
		<div class="dash-stat">
			<p class="dash-stat__label">Ticket promedio</p>
			<p class="dash-stat__value dash-stat__value--currency">{formatCurrency(overview.ticketPromedio)}</p>
		</div>
		<div class="dash-stat">
			<p class="dash-stat__label">Piezas / caso</p>
			<p class="dash-stat__value">{overview.piezasPorCaso.toFixed(1)}</p>
		</div>
		<div class="dash-stat">
			<p class="dash-stat__label">En producción</p>
			<p class="dash-stat__value">{dashboard.enProceso}</p>
		</div>
		<div class="dash-stat">
			<p class="dash-stat__label">Coronas · Puentes</p>
			<p class="dash-stat__value">{dashboard.coronasPiezas} · {dashboard.puentesPiezas}</p>
		</div>
		<div class="dash-stat">
			<p class="dash-stat__label">Clientes activos</p>
			<p class="dash-stat__value">{dashboard.totalClientes}</p>
		</div>
	</section>

	<section class="stats-chart-grid">
		<article class="stats-chart-card stats-chart-card--wide dash-panel">
			<h3 class="stats-chart-card__title">Ingresos — últimos 6 meses</h3>
			<div class="stats-chart-card__canvas">
				<ChartJs type="line" data={revenueLineData} showLegend={false} ariaLabel="Ingresos mensuales" />
			</div>
		</article>

		<article class="stats-chart-card dash-panel">
			<h3 class="stats-chart-card__title">Pipeline de estados</h3>
			<div class="stats-chart-card__canvas stats-chart-card__canvas--donut">
				<ChartJs
					type="doughnut"
					data={pipelineDoughnut}
					centerLabel="casos"
					ariaLabel="Casos por estado"
				/>
			</div>
		</article>

		<article class="stats-chart-card dash-panel">
			<h3 class="stats-chart-card__title">Salud de entregas</h3>
			<div class="stats-chart-card__canvas stats-chart-card__canvas--donut">
				<ChartJs
					type="doughnut"
					data={deliveryDoughnut}
					centerLabel="casos"
					ariaLabel="Entregas en plazo vs atrasadas"
				/>
			</div>
		</article>

		<article class="stats-chart-card dash-panel">
			<h3 class="stats-chart-card__title">Casos recibidos por mes</h3>
			<div class="stats-chart-card__canvas">
				<ChartJs type="bar" data={casesBarData} showLegend={false} ariaLabel="Casos por mes" />
			</div>
		</article>

		<article class="stats-chart-card dash-panel">
			<h3 class="stats-chart-card__title">Piezas producidas por mes</h3>
			<div class="stats-chart-card__canvas">
				<ChartJs type="bar" data={piezasBarData} showLegend={false} ariaLabel="Piezas por mes" />
			</div>
		</article>

		<article class="stats-chart-card dash-panel">
			<h3 class="stats-chart-card__title">Producción por tipo de trabajo</h3>
			<div class="stats-chart-card__canvas">
				<ChartJs type="bar" data={productionBar} showLegend={false} ariaLabel="Producción por tipo" />
			</div>
		</article>

		<article class="stats-chart-card dash-panel">
			<h3 class="stats-chart-card__title">Materiales</h3>
			<div class="stats-chart-card__canvas stats-chart-card__canvas--donut">
				<ChartJs
					type="doughnut"
					data={materialDoughnut}
					centerLabel="piezas"
					ariaLabel="Distribución de materiales"
				/>
			</div>
		</article>

		<article class="stats-chart-card dash-panel">
			<h3 class="stats-chart-card__title">Servicios (diseño / fresado)</h3>
			<div class="stats-chart-card__canvas stats-chart-card__canvas--donut">
				<ChartJs
					type="doughnut"
					data={servicesDoughnut}
					centerLabel="piezas"
					ariaLabel="Servicios por ítem"
				/>
			</div>
		</article>

		<article class="stats-chart-card dash-panel">
			<h3 class="stats-chart-card__title">Grupos dentales (FDI)</h3>
			<div class="stats-chart-card__canvas">
				<ChartJs type="bar" data={anatomyBar} showLegend={false} ariaLabel="Piezas por anatomía" />
			</div>
		</article>

		<article class="stats-chart-card stats-chart-card--wide dash-panel stats-chart-card--vita">
			<h3 class="stats-chart-card__title">Tonos VITA más pedidos</h3>
			<p class="stats-chart-card__subtitle">Muestras reales de escala clásica y bleach (BL)</p>
			<VitaShadesPanel shades={shadeStats} limit={8} />
		</article>

		<article class="stats-chart-card stats-chart-card--wide dash-panel">
			<h3 class="stats-chart-card__title">Top clientes por ingresos</h3>
			<div class="stats-chart-card__canvas stats-chart-card__canvas--horizontal">
				<ChartJs
					type="bar"
					data={clientsBar}
					options={currencyBarOptions}
					showLegend={false}
					ariaLabel="Ingresos por cliente"
				/>
			</div>
		</article>

		<article class="stats-chart-card dash-panel">
			<h3 class="stats-chart-card__title">Ingresos por doctor</h3>
			<div class="stats-chart-card__canvas stats-chart-card__canvas--horizontal">
				<ChartJs
					type="bar"
					data={doctorsBar}
					options={currencyBarOptions}
					showLegend={false}
					ariaLabel="Ingresos por doctor"
				/>
			</div>
		</article>

		<article class="stats-chart-card dash-panel">
			<h3 class="stats-chart-card__title">Estado de facturas</h3>
			<div class="stats-chart-card__canvas stats-chart-card__canvas--donut">
				<ChartJs
					type="doughnut"
					data={invoicesDoughnut}
					centerLabel="facturas"
					ariaLabel="Facturas por estado"
				/>
			</div>
			<p class="stats-chart-card__footnote">
				Pendiente: {formatCurrency(invoiceSummary.montoPendiente)} · Cobrado: {formatCurrency(invoiceSummary.montoPagado)}
			</p>
		</article>
	</section>

	<section class="dash-panel dash-panel--section">
		<h3 class="dash-panel__section-title">Ranking detallado de clientes</h3>
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
								{row.client.clinica} · {row.totalCasos} casos · {row.totalPiezas} piezas
							</p>
						</div>
						<span class="type-body-strong">{formatCurrency(row.totalGastado)}</span>
					</li>
				{/each}
			</ol>
		{/if}
	</section>
</div>
