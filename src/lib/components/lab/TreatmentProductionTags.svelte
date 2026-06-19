<script lang="ts">
	import type { TreatmentProductionStat } from '$lib/lab/analytics';

	interface Props {
		treatments: TreatmentProductionStat[];
	}

	let { treatments }: Props = $props();
</script>

{#if treatments.length > 0}
	<div class="treatment-tags">
		{#each treatments as treatment (treatment.tipo)}
			<span class="work-tag work-tag--tipo" style="--tag-color: {treatment.color}">
				{treatment.label}
				<span class="work-tag__qty">×{treatment.piezas}</span>
			</span>
		{/each}
	</div>
{/if}

<style>
	.treatment-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
</style>
