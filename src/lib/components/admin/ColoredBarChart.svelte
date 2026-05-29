<script lang="ts">
	import type { ChartSegment } from '$lib/lab/analytics';

	interface Props {
		segments: ChartSegment[];
		/** Sufijo en leyenda (ej. " pzs", " casos") */
		suffix?: string;
	}

	let { segments, suffix = '' }: Props = $props();

	const max = $derived(Math.max(...segments.map((s) => s.value), 1));
</script>

{#if segments.length === 0}
	<p class="type-caption">Sin datos</p>
{:else}
	<ul class="colored-bar-chart">
		{#each segments as row}
			<li class="colored-bar-chart__row">
				<div class="colored-bar-chart__head">
					<span class="colored-bar-chart__dot" style="background: {row.color}"></span>
					<span class="colored-bar-chart__label">{row.label}</span>
					<span class="colored-bar-chart__value">{row.value}{suffix}</span>
				</div>
				<div class="colored-bar-chart__track">
					<div
						class="colored-bar-chart__fill"
						style="width: {(row.value / max) * 100}%; background: {row.color}"
					></div>
				</div>
			</li>
		{/each}
	</ul>
{/if}
