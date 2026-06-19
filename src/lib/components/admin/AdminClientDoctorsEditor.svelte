<script lang="ts">
	import { Plus, Trash2 } from '@lucide/svelte';
	import {
		createDoctorForClient,
		deactivateDoctor,
		fetchDoctorsForClient,
		type DbDoctor
	} from '$lib/lab/clients-db';
	import { onMount } from 'svelte';

	interface Props {
		clientId: string;
	}

	let { clientId }: Props = $props();

	let doctors = $state<DbDoctor[]>([]);
	let newName = $state('');
	let loading = $state(false);
	let error = $state('');

	async function refresh() {
		doctors = await fetchDoctorsForClient(clientId);
	}

	onMount(() => {
		void refresh();
	});

	async function handleAdd(e: Event) {
		e.preventDefault();
		if (!newName.trim()) {
			error = 'Escribe el nombre del doctor';
			return;
		}
		loading = true;
		error = '';
		try {
			await createDoctorForClient(clientId, newName.trim());
			newName = '';
			await refresh();
		} catch (err) {
			error = err instanceof Error ? err.message : 'No se pudo agregar el doctor';
		} finally {
			loading = false;
		}
	}

	async function handleRemove(id: string) {
		loading = true;
		error = '';
		try {
			await deactivateDoctor(id);
			await refresh();
		} catch (err) {
			error = err instanceof Error ? err.message : 'No se pudo eliminar';
		} finally {
			loading = false;
		}
	}
</script>

<section class="dash-panel dash-panel--section" style="margin-top: var(--spacing-xxl);">
	<h3 class="type-tagline" style="margin: 0 0 var(--spacing-md);">Doctores de la clínica</h3>
	<p class="type-fine-print" style="margin: 0 0 var(--spacing-md);">
		Lista de doctores disponibles al enviar casos desde el portal de esta clínica.
	</p>

	{#if error}
		<div class="alert alert--error">{error}</div>
	{/if}

	<ul class="client-doctors-list">
		{#each doctors as doc (doc.id)}
			<li class="client-doctors-list__item">
				<span>{doc.nombre}</span>
				<button
					type="button"
					class="text-link client-doctors-list__remove"
					disabled={loading}
					aria-label="Eliminar {doc.nombre}"
					onclick={() => handleRemove(doc.id)}
				>
					<Trash2 size={16} />
				</button>
			</li>
		{:else}
			<li class="type-caption">Sin doctores registrados.</li>
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
			Agregar doctor
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
		gap: var(--spacing-xs);
	}

	.client-doctors-list__item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		background: var(--dash-table-head, rgba(255, 255, 255, 0.04));
		border: 1px solid var(--dash-border, rgba(255, 255, 255, 0.08));
	}

	.client-doctors-list__remove {
		display: inline-flex;
		padding: 4px;
		opacity: 0.7;
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
