<script lang="ts">
	import { Plus, Trash2 } from '@lucide/svelte';
	import { addDoctor, getCachedDoctors, reloadDoctors, removeDoctor } from '$lib/lab/client-session';
	import type { DbDoctor } from '$lib/lab/clients-db';
	import { onMount } from 'svelte';

	let doctors = $state<DbDoctor[]>(getCachedDoctors());
	let newName = $state('');
	let loading = $state(false);
	let error = $state('');

	onMount(() => {
		void refresh();
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
		Aparecerán al enviar un caso. El doctor que elijas quedará registrado en el expediente.
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
		gap: var(--spacing-xs);
	}

	.client-doctors-list__item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		background: var(--color-surface-elevated, rgba(255, 255, 255, 0.04));
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
