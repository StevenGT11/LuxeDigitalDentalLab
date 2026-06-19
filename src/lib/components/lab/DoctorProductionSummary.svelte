<script lang="ts">
	import type { DoctorTreatmentStat } from '$lib/lab/analytics';
	import TreatmentProductionTags from '$lib/components/lab/TreatmentProductionTags.svelte';

	interface Props {
		stats: DoctorTreatmentStat[];
		emptyMessage?: string;
	}

	let { stats, emptyMessage = 'Aún no hay piezas registradas por doctor.' }: Props = $props();
</script>

<section class="doctor-production">
	<h3 class="doctor-production__title">Piezas por doctor y tratamiento</h3>
	<p class="doctor-production__lead type-fine-print">
		Coronas, carillas, férulas y demás — desglosado por cada doctor de la clínica.
	</p>

	{#if stats.length === 0}
		<p class="type-caption">{emptyMessage}</p>
	{:else}
		<ul class="doctor-production__list">
			{#each stats as row (row.doctor_id ?? row.doctor_name)}
				<li class="doctor-production__card">
					<div class="doctor-production__head">
						<span class="doctor-production__name">{row.doctor_name}</span>
						<span class="doctor-production__total">{row.totalPiezas} pzs</span>
					</div>
					<TreatmentProductionTags treatments={row.treatments} />
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.doctor-production__title {
		margin: 0 0 0.35rem;
		font-size: 1rem;
		font-weight: 600;
	}

	.doctor-production__lead {
		margin: 0 0 1rem;
	}

	.doctor-production__list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.doctor-production__card {
		padding: 0.85rem 1rem;
		border: 1px solid var(--dash-border, rgba(255, 255, 255, 0.08));
		border-radius: var(--dash-radius, 10px);
		background: var(--dash-table-head, rgba(255, 255, 255, 0.03));
	}

	.doctor-production__head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.75rem;
		margin-bottom: 0.65rem;
	}

	.doctor-production__name {
		font-weight: 600;
	}

	.doctor-production__total {
		font-size: 0.8125rem;
		color: var(--dash-text-secondary, #94a3b8);
		white-space: nowrap;
	}
</style>
