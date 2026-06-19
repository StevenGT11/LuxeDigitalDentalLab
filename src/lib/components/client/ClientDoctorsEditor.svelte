<script lang="ts">
	import { Plus, Trash2 } from '@lucide/svelte';
	import TreatmentProductionTags from '$lib/components/lab/TreatmentProductionTags.svelte';
	import { getTreatmentProductionStatsForDoctor } from '$lib/lab/analytics';
	import { addDoctor, getCachedDoctors, reloadDoctors, removeDoctor } from '$lib/lab/client-session';
	import type { DbDoctor } from '$lib/lab/clients-db';
	import {
		getCasesByClient,
		getClientId,
		hydrateCasesOnce,
		initializeLabStorage
	} from '$lib/lab/store';
	import type { LabCase } from '$lib/lab/types';
	import { onMount } from 'svelte';

	let doctors = $state<DbDoctor[]>(getCachedDoctors());
	let casos = $state<LabCase[]>([]);
	let newName = $state('');
	let loading = $state(false);
	let error = $state('');

	function doctorStats(doc: DbDoctor) {
		return getTreatmentProductionStatsForDoctor(casos, { id: doc.id, nombre: doc.nombre });
	}

	onMount(async () => {
		initializeLabStorage({ linkClientPortal: true });
		await hydrateCasesOnce();
		casos = getCasesByClient(getClientId());
		await refresh();
	});

	async function refresh() {
		doctors = await reloadDoctors();
	}

	async function handleAdd(e: Event) {
		e.preventDefault();
		if (!newName.trim()) {
			error = 'Escribe el nombre del doctor';
			return;
		}
		loading = true;
		error = '';
		try {
			await addDoctor(newName.trim());
			newName = '';
			await refresh();
		} catch (err) {
			error = err instanceof Error ? err.message : 'No se pudo agregar el doctor';
		} finally {
			loading = false;
		}
	}

	async function handleRemove(id: string) {
		if (doctors.length <= 1) {
			error = 'Debe quedar al menos un doctor en la lista';
			return;
		}
		loading = true;
		error = '';
		try {
			await removeDoctor(id);
			await refresh();
		} catch (err) {
			error = err instanceof Error ? err.message : 'No se pudo eliminar';
		} finally {
			loading = false;
		}
	}
</script>

<section class="dash-panel dash-panel--section" style="margin-top: var(--spacing-xl);">
	<h2 class="dash-panel__section-title">Doctores de la clínica</h2>
	<p class="type-fine-print" style="margin: 0 0 var(--spacing-md);">
		Cada doctor muestra cuántas piezas ha enviado por tratamiento (coronas, carillas, férulas, etc.).
	</p>

	{#if error}
		<div class="alert alert--error">{error}</div>
	{/if}

	<ul class="client-doctors-list">
		{#each doctors as doc (doc.id)}
			{@const stats = doctorStats(doc)}
			<li class="client-doctors-list__item">
				<div class="client-doctors-list__main">
					<div class="client-doctors-list__head">
						<span class="client-doctors-list__name">{doc.nombre}</span>
						{#if stats.length > 0}
							<span class="client-doctors-list__total">
								{stats.reduce((sum, row) => sum + row.piezas, 0)} piezas
							</span>
						{/if}
					</div>
					{#if stats.length > 0}
						<TreatmentProductionTags treatments={stats} />
					{:else}
						<p class="type-caption client-doctors-list__empty">Sin casos registrados aún</p>
					{/if}
				</div>
				<button
					type="button"
					class="text-link client-doctors-list__remove"
					disabled={loading || doctors.length <= 1}
					aria-label="Eliminar {doc.nombre}"
					onclick={() => handleRemove(doc.id)}
				>
					<Trash2 size={16} />
				</button>
			</li>
		{:else}
			<li class="type-caption">Sin doctores — agrega al menos uno.</li>
		{/each}
	</ul>

	<form class="client-doctors-add" onsubmit={handleAdd}>
		<input
			class="field-input"
			type="text"
			placeholder="Ej. Dr. García"
			bind:value={newName}
			disabled={loading}
		/>
		<button type="submit" class="btn-pearl-capsule" disabled={loading}>
			<Plus size={16} />
			Agregar
		</button>
	</form>
</section>

<style>
	.client-doctors-list {
		list-style: none;
		margin: 0 0 var(--spacing-md);
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.client-doctors-list__item {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--spacing-md);
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		background: var(--color-surface-elevated, rgba(255, 255, 255, 0.04));
	}

	.client-doctors-list__main {
		flex: 1;
		min-width: 0;
	}

	.client-doctors-list__head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--spacing-sm);
		margin-bottom: 0.5rem;
	}

	.client-doctors-list__name {
		font-weight: 600;
	}

	.client-doctors-list__total {
		font-size: 0.8125rem;
		color: var(--dash-text-secondary, #94a3b8);
		white-space: nowrap;
	}

	.client-doctors-list__empty {
		margin: 0;
	}

	.client-doctors-list__remove {
		display: inline-flex;
		padding: 4px;
		opacity: 0.7;
		flex-shrink: 0;
	}

	.client-doctors-list__remove:disabled {
		opacity: 0.25;
		cursor: not-allowed;
	}

	.client-doctors-add {
		display: flex;
		gap: var(--spacing-sm);
		flex-wrap: wrap;
	}

	.client-doctors-add .field-input {
		flex: 1;
		min-width: 12rem;
	}
</style>
