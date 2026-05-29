<script lang="ts">
	import { afterNavigate, goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { Plus, X } from '@lucide/svelte';
	import { createLabClient, getClientStats, getAllClients, initializeLabStorage } from '$lib/lab/store';
	import { formatCurrency } from '$lib/lab/helpers';
	import type { LabClient } from '$lib/lab/types';

	let clients = $state<(LabClient & { stats: ReturnType<typeof getClientStats> })[]>([]);
	let searchQuery = $state('');
	let modalOpen = $state(false);
	let saving = $state(false);
	let error = $state('');

	let form = $state({
		nombre: '',
		clinica: '',
		email: '',
		telefono: ''
	});

	let filtered = $derived(
		clients.filter((c) => {
			if (!searchQuery.trim()) return true;
			const q = searchQuery.toLowerCase();
			return (
				c.nombre.toLowerCase().includes(q) ||
				c.clinica.toLowerCase().includes(q) ||
				c.email.toLowerCase().includes(q)
			);
		})
	);

	onMount(() => refresh());

	afterNavigate(() => refresh());

	function refresh() {
		if (!browser) return;
		initializeLabStorage();
		clients = getAllClients().map((c) => ({
			...c,
			stats: getClientStats(c.id)
		}));
	}

	function openModal() {
		error = '';
		form = { nombre: '', clinica: '', email: '', telefono: '' };
		modalOpen = true;
	}

	function closeModal() {
		if (saving) return;
		modalOpen = false;
		error = '';
	}

	function onModalKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') closeModal();
	}

	function handleSubmit(e: Event) {
		e.preventDefault();
		if (!form.nombre.trim()) {
			error = 'El nombre es requerido';
			return;
		}

		saving = true;
		error = '';

		try {
			const created = createLabClient({
				nombre: form.nombre,
				clinica: form.clinica,
				email: form.email,
				telefono: form.telefono
			});
			modalOpen = false;
			refresh();
			goto(`/admin/clientes/${created.id}`);
		} catch (err) {
			error = err instanceof Error ? err.message : 'No se pudo crear el cliente';
		} finally {
			saving = false;
		}
	}
</script>

<svelte:window onkeydown={modalOpen ? onModalKeydown : undefined} />

<div class="dash-page">
	<p class="dash-lead">Clínicas y consultorios registrados — casos y facturas vinculados.</p>

	<div class="dash-toolbar">
		<input
			type="search"
			class="search-input"
			style="flex: 1;"
			bind:value={searchQuery}
			placeholder="Buscar cliente o clínica..."
		/>
		<button type="button" class="btn-primary" onclick={openModal}>
			<Plus size={16} strokeWidth={2} />
			Agregar cliente
		</button>
	</div>

	{#if filtered.length === 0}
		<div class="store-utility-card empty-state">
			<p>{clients.length === 0 ? 'No hay clientes registrados' : 'Ningún cliente coincide con la búsqueda'}</p>
			{#if clients.length === 0}
				<button type="button" class="btn-primary" style="margin-top: 1rem;" onclick={openModal}>
					Agregar primer cliente
				</button>
			{/if}
		</div>
	{:else}
		<div class="dash-client-grid">
			{#each filtered as client}
				<a href="/admin/clientes/{client.id}" class="store-utility-card admin-client-card">
					<div class="admin-client-card__header">
						<div class="avatar">{client.nombre.charAt(0)}</div>
						<div>
							<p class="type-body-strong" style="margin: 0;">{client.nombre}</p>
							<p class="type-fine-print" style="margin: 4px 0 0;">{client.clinica}</p>
						</div>
					</div>
					<div class="admin-client-card__stats">
						<div>
							<p class="detail-item__label">Casos</p>
							<p class="detail-item__value">{client.stats.totalCasos}</p>
						</div>
						<div>
							<p class="detail-item__label">Piezas</p>
							<p class="detail-item__value">{client.stats.totalPiezas}</p>
						</div>
						<div>
							<p class="detail-item__label">Total comprado</p>
							<p class="detail-item__value" style="font-size: 16px;">
								{formatCurrency(client.stats.totalGastado)}
							</p>
						</div>
					</div>
					{#if client.email}
						<p class="type-fine-print" style="margin-top: var(--spacing-md);">{client.email}</p>
					{/if}
				</a>
			{/each}
		</div>
	{/if}
</div>

{#if modalOpen}
	<div class="case-file-modal__backdrop" onclick={closeModal} role="presentation"></div>
	<div
		class="case-file-modal admin-client-modal"
		role="dialog"
		aria-modal="true"
		aria-labelledby="add-client-title"
	>
		<header class="case-file-modal__header">
			<div>
				<p class="case-file-modal__eyebrow">Nuevo registro</p>
				<h3 class="case-file-modal__title" id="add-client-title">Agregar cliente</h3>
			</div>
			<button type="button" class="case-file-modal__close" aria-label="Cerrar" onclick={closeModal}>
				<X size={18} />
			</button>
		</header>

		<p class="case-file-modal__lead">
			La clínica o consultorio quedará disponible para vincular casos y facturas.
		</p>

		{#if error}
			<div class="alert alert--error" style="margin-bottom: 1rem;">{error}</div>
		{/if}

		<form class="admin-client-form" onsubmit={handleSubmit}>
			<div>
				<label class="field-label" for="client-nombre">Nombre o clínica *</label>
				<input
					id="client-nombre"
					class="field-input"
					type="text"
					bind:value={form.nombre}
					placeholder="Ej. Clínica Dental Sonrisa"
					required
					autocomplete="organization"
				/>
			</div>
			<div>
				<label class="field-label" for="client-clinica">Sucursal / razón social</label>
				<input
					id="client-clinica"
					class="field-input"
					type="text"
					bind:value={form.clinica}
					placeholder="Ej. Escazú, Centro"
				/>
			</div>
			<div>
				<label class="field-label" for="client-email">Correo</label>
				<input
					id="client-email"
					class="field-input"
					type="email"
					bind:value={form.email}
					placeholder="contacto@clinica.com"
					autocomplete="email"
				/>
			</div>
			<div>
				<label class="field-label" for="client-telefono">Teléfono</label>
				<input
					id="client-telefono"
					class="field-input"
					type="tel"
					bind:value={form.telefono}
					placeholder="+506 0000-0000"
					autocomplete="tel"
				/>
			</div>

			<div class="admin-client-form__actions">
				<button type="button" class="btn-pearl-capsule" onclick={closeModal} disabled={saving}>
					Cancelar
				</button>
				<button type="submit" class="btn-primary" disabled={saving}>
					{saving ? 'Guardando…' : 'Crear cliente'}
				</button>
			</div>
		</form>
	</div>
{/if}
