<script lang="ts">
	import {
		Chart,
		type ChartConfiguration,
		type ChartData,
		type ChartOptions,
		type ChartType
	} from 'chart.js';
	import {
		applyBarChartGradients,
		applyLineChartGradients,
		buildDoughnutLegend,
		getDoughnutCenter,
		mergeChartOptions,
		polishChartData
	} from '$lib/charts/chart-theme';

	interface Props {
		type: ChartType;
		data: ChartData;
		options?: ChartOptions;
		ariaLabel?: string;
		/** Etiqueta en el centro de la dona (ej. "casos", "piezas") */
		centerLabel?: string;
		/** Leyenda HTML debajo del gráfico */
		showLegend?: boolean;
	}

	let {
		type,
		data,
		options = {},
		ariaLabel = 'Gráfico estadístico',
		centerLabel,
		showLegend = type === 'doughnut'
	}: Props = $props();

	let canvas = $state<HTMLCanvasElement | null>(null);
	let chart: Chart | null = null;

	const plainData = $derived.by(() => polishChartData(type, $state.snapshot(data) as ChartData));
	const plainOptions = $derived($state.snapshot(options) as ChartOptions);
	const isHorizontalBar = $derived(plainOptions.indexAxis === 'y');

	const doughnutCenter = $derived(
		type === 'doughnut' ? getDoughnutCenter($state.snapshot(data) as ChartData) : null
	);
	const doughnutLegend = $derived(
		type === 'doughnut' && showLegend
			? buildDoughnutLegend($state.snapshot(data) as ChartData)
			: []
	);

	function buildConfig(): ChartConfiguration {
		let chartData = plainData;

		if (canvas) {
			if (type === 'line') chartData = applyLineChartGradients(type, chartData, canvas);
			if (type === 'bar') chartData = applyBarChartGradients(type, chartData, canvas, isHorizontalBar);
		}

		return {
			type,
			data: chartData,
			options: mergeChartOptions(type, plainOptions)
		};
	}

	function destroyChart() {
		chart?.destroy();
		chart = null;
	}

	function renderChart() {
		if (!canvas) return;
		const config = buildConfig();

		if (!chart) {
			chart = new Chart(canvas, config);
			return;
		}

		chart.data = config.data;
		chart.options = config.options;
		chart.update('none');
	}

	$effect(() => {
		type;
		plainData;
		plainOptions;
		renderChart();
		return () => destroyChart();
	});

	$effect(() => {
		if (typeof document === 'undefined') return;
		const root = document.documentElement;
		const observer = new MutationObserver(() => renderChart());
		observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
		return () => observer.disconnect();
	});
</script>

<div
	class="chart-modern"
	class:chart-modern--donut={type === 'doughnut'}
	class:chart-modern--bar={type === 'bar'}
	class:chart-modern--line={type === 'line'}
	class:chart-modern--horizontal={isHorizontalBar}
>
	<div class="chart-modern__plot">
		{#if type === 'doughnut' && doughnutCenter}
			<div class="chart-modern__center" aria-hidden="true">
				<span class="chart-modern__center-value">{doughnutCenter.total}</span>
				<span class="chart-modern__center-label">{centerLabel ?? doughnutCenter.label}</span>
			</div>
		{/if}
		<div class="chart-js-wrap" role="img" aria-label={ariaLabel}>
			<canvas bind:this={canvas}></canvas>
		</div>
	</div>

	{#if doughnutLegend.length > 0}
		<ul class="chart-modern__legend">
			{#each doughnutLegend as item}
				<li class="chart-modern__legend-item">
					<span class="chart-modern__legend-dot" style="background: {item.color}"></span>
					<span class="chart-modern__legend-label">{item.label}</span>
					<span class="chart-modern__legend-value">{item.value}</span>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<script lang="ts" module>
	import {
		ArcElement,
		BarController,
		BarElement,
		CategoryScale,
		Chart as ChartJS,
		DoughnutController,
		Filler,
		Legend,
		LineController,
		LineElement,
		LinearScale,
		PointElement,
		Title,
		Tooltip
	} from 'chart.js';

	ChartJS.register(
		ArcElement,
		BarController,
		BarElement,
		CategoryScale,
		DoughnutController,
		Filler,
		Legend,
		LineController,
		LineElement,
		LinearScale,
		PointElement,
		Title,
		Tooltip
	);
</script>
