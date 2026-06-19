<script lang="ts">
	import type { DoctorTreatmentStat } from '$lib/lab/analytics';

	interface Props {
		stats: DoctorTreatmentStat[];
		emptyMessage?: string;
	}

	let { stats, emptyMessage = 'Aún no hay piezas registradas por doctor.' }: Props = $props();
</script>

<section class="doctor-production">
	<h3 class="doctor-production__title">Piezas por doctor y tratamiento</h3>
	<p class="doctor-production__lead type-fine-print">
		Coronas, carillas, puentes y demás — según los casos enviados al laboratorio.
	</p>

	{#if stats.length === 0}
		<p class="type-caption">{emptyMessage}</p>
	{:else}
		<ul class="doctor-production__list">
			{#each stats as row (row.doctor_name)}
				<li class="doctor-production__card">
					<div class="doctor-production__head">
						<span class="doctor-production__name">{row.doctor_name}</span>
						<span class="doctor-production__total">{row.totalPiezas} pzs</span>
					</div>
					<div class="doctor-production__tags">
						{#each row.treatments as treatment (treatment.tipo)}
							<span
								class="work-tag work-tag--tipo"
								style="--tag-color: {treatment.color}"
							>
								{treatment.label}
								<span class="work-tag__qty">×{treatment.piezas}</span>
							</span>
						{/each}
					</div>
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

	.doctor-production__tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
</style>
