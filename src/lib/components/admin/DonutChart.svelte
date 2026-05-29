<script lang="ts">
	import type { ChartSegment } from '$lib/lab/analytics';

	interface Props {
		segments: ChartSegment[];
		size?: number;
		unit?: string;
	}

	let { segments, size = 160, unit = '' }: Props = $props();

	const total = $derived(segments.reduce((s, seg) => s + seg.value, 0));

	const arcs = $derived.by(() => {
		if (total <= 0) return [] as { d: string; color: string; label: string; value: number }[];
		const r = size / 2 - 12;
		const cx = size / 2;
		const cy = size / 2;
		let angle = -Math.PI / 2;
		return segments.map((seg) => {
			const slice = (seg.value / total) * Math.PI * 2;
			const x1 = cx + r * Math.cos(angle);
			const y1 = cy + r * Math.sin(angle);
			angle += slice;
			const x2 = cx + r * Math.cos(angle);
			const y2 = cy + r * Math.sin(angle);
			const large = slice > Math.PI ? 1 : 0;
			const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
			return { d, color: seg.color, label: seg.label, value: seg.value };
		});
	});
</script>

<div class="donut-chart" style="--donut-size: {size}px">
	<svg
		width={size}
		height={size}
		viewBox="0 0 {size} {size}"
		role="img"
		aria-label="Gráfico circular"
	>
		{#if total <= 0}
			<circle
				cx={size / 2}
				cy={size / 2}
				r={size / 2 - 12}
				fill="none"
				stroke="var(--dash-border)"
				stroke-width="20"
			/>
		{:else}
			{#each arcs as arc}
				<path d={arc.d} fill={arc.color} stroke="var(--dash-card)" stroke-width="1" />
			{/each}
		{/if}
		<circle
			cx={size / 2}
			cy={size / 2}
			r={size / 2 - 28}
			fill="var(--dash-card)"
		/>
		<text x={size / 2} y={size / 2 - 4} text-anchor="middle" class="donut-chart__total">
			{total}
		</text>
		<text x={size / 2} y={size / 2 + 14} text-anchor="middle" class="donut-chart__unit">
			{unit || 'total'}
		</text>
	</svg>
	{#if segments.length > 0}
		<ul class="donut-chart__legend">
			{#each segments as seg}
				<li>
					<span class="donut-chart__dot" style="background: {seg.color}"></span>
					<span class="donut-chart__legend-label">{seg.label}</span>
					<span class="donut-chart__legend-value">{seg.value}{unit}</span>
				</li>
			{/each}
		</ul>
	{/if}
</div>
