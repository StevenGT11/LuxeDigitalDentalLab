<script lang="ts">
	import type { TreatmentProductionStat } from '$lib/lab/analytics';
	import TreatmentProductionTags from '$lib/components/lab/TreatmentProductionTags.svelte';

	interface Props {
		stats: TreatmentProductionStat[];
		title?: string;
		lead?: string;
		emptyMessage?: string;
	}

	let {
		stats,
		title = 'Piezas por tratamiento',
		lead = 'Coronas, carillas, férulas y demás — según tus casos enviados al laboratorio.',
		emptyMessage = 'Aún no hay piezas registradas.'
	}: Props = $props();

	let totalPiezas = $derived(stats.reduce((sum, row) => sum + row.piezas, 0));
</script>

<section class="treatment-production">
	<div class="treatment-production__head">
		<div>
			<h3 class="treatment-production__title">{title}</h3>
			<p class="treatment-production__lead type-fine-print">{lead}</p>
		</div>
		{#if totalPiezas > 0}
			<span class="treatment-production__total">{totalPiezas} piezas</span>
		{/if}
	</div>

	{#if stats.length === 0}
		<p class="type-caption">{emptyMessage}</p>
	{:else}
		<TreatmentProductionTags treatments={stats} />
	{/if}
</section>

<style>
	.treatment-production__head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.treatment-production__title {
		margin: 0 0 0.35rem;
		font-size: 1rem;
		font-weight: 600;
	}

	.treatment-production__lead {
		margin: 0;
	}

	.treatment-production__total {
		font-size: 0.8125rem;
		color: var(--dash-text-secondary, #94a3b8);
		white-space: nowrap;
	}
</style>
