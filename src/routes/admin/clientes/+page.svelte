<script lang="ts">
	import { afterNavigate, goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { Plus, X } from '@lucide/svelte';
	import { canManageClients, canViewFinancial } from '$lib/auth/roles';
	import { fetchAllClients } from '$lib/lab/clients-db';
	import { getClientStats, initializeLabStorage } from '$lib/lab/store';
	import { formatCurrency } from '$lib/lab/helpers';
	import type { LabClient } from '$lib/lab/types';

	let clients = $state<(LabClient & { stats: ReturnType<typeof getClientStats> })[]>([]);
	let searchQuery = $state('');
	let modalOpen = $state(false);
	let saving = $state(false);
	let loading = $state(true);
	let error = $state('');
	let successMessage = $state('');

	let showFinancial = $derived(canViewFinancial($page.data.staffRole ?? $page.data.profile?.role));
	let canManage = $derived(canManageClients($page.data.staffRole ?? $page.data.profile?.role));

	function readQueryBanner() {
		const params = $page.url.searchParams;
		if (params.get('created') === '1') {
			successMessage = 'Cliente creado. Ya puede iniciar sesión en el portal.';
			return;
		}
		const d = params.get('deleted');
		if (d === 'full') {
			successMessage = 'Cliente y acceso eliminados correctamente.';
		} else if (d === 'access') {
			successMessage =
				'Acceso al portal eliminado. Los casos y facturas del cliente se conservan en el sistema.';
		} else if (d === 'deactivated') {
			successMessage = 'Cliente desactivado.';
		} else {
			successMessage = '';
		}
	}

	let form = $state({
		nombre: '',
		clinica: '',
		email: '',
		telefono: '',
		password: '',
		passwordConfirm: ''
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

	onMount(() => {
		readQueryBanner();
		void refresh();
	});

	afterNavigate(() => {
		readQueryBanner();
		void refresh();
	});

	async function refresh() {
		if (!browser) return;
		initializeLabStorage();
		loading = true;
		error = '';
		try {
			const rows = await fetchAllClients();
			clients = rows.map((c) => ({
				...c,
				stats: getClientStats(c.id)
			}));
		} catch (err) {
			error = err instanceof Error ? err.message : 'No se pudieron cargar los clientes';
			clients = [];
		} finally {
			loading = false;
		}
	}

	function openModal() {
		error = '';
		form = {
			nombre: '',
			clinica: '',
			email: '',
			telefono: '',
			password: '',
			passwordConfirm: ''
		};
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


</script>

<svelte:window onkeydown={modalOpen ? onModalKeydown : undefined} />

<div class="dash-page">
	<p class="dash-lead">
		{showFinancial
			? 'Clínicas y consultorios registrados — casos y facturas vinculados.'
			: 'Clínicas y consultorios registrados — contacto y casos vinculados.'}
	</p>

	{#if successMessage}
		<div class="alert alert--success">{successMessage}</div>
	{/if}

	{#if error && !modalOpen}
		<div class="alert alert--error">{error}</div>
	{/if}

	<div class="dash-toolbar">
		<input
			type="search"
			class="search-input"
			style="flex: 1;"
			bind:value={searchQuery}
			placeholder="Buscar cliente o clínica..."
		/>
		{#if canManage}
			<button type="button" class="btn-primary" onclick={openModal}>
				<Plus size={16} strokeWidth={2} />
				Agregar cliente
			</button>
		{/if}
	</div>

	{#if loading}
		<p class="type-caption">Cargando clientes…</p>
	{:else if filtered.length === 0}
		<div class="store-utility-card empty-state">
			<p>{clients.length === 0 ? 'No hay clientes registrados' : 'Ningún cliente coincide con la búsqueda'}</p>
			{#if canManage && clients.length === 0}
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
						{#if showFinancial}
							<div>
								<p class="detail-item__label">Total comprado</p>
								<p class="detail-item__value" style="font-size: 16px;">
									{formatCurrency(client.stats.totalGastado)}
								</p>
							</div>
						{/if}
					</div>
					{#if client.email}
						<p class="type-fine-print" style="margin-top: var(--spacing-md);">{client.email}</p>
					{/if}
				</a>
			{/each}
		</div>
	{/if}
</div>

{#if modalOpen && canManage}
	<div class="case-file-modal__backdrop" onclick={closeModal} role="presentation"></div>
	<div
		class="case-file-modal case-file-modal--form"
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

		<form
			class="case-file-modal__body admin-client-form"
			method="POST"
			action="?/create"
			use:enhance={() => {
				saving = true;
				error = '';
				return async ({ result, update }) => {
					try {
						if (result.type === 'redirect') {
							modalOpen = false;
							await goto(result.location);
							return;
						}
						if (result.type === 'failure') {
							const data = result.data as { message?: string } | undefined;
							error = data?.message ?? 'No se pudo crear el cliente.';
							await update({ reset: false });
							return;
						}
						if (result.type === 'error') {
							error = 'Error al enviar el formulario. Revisa tu conexión e intenta de nuevo.';
							return;
						}
						await update();
					} finally {
						saving = false;
					}
				};
			}}
		>
			<div class="case-file-modal__fields">
				<p class="case-file-modal__lead">
					Se creará un usuario de acceso al portal. Comparte el correo y la contraseña con la clínica;
					podrán iniciar sesión de inmediato.
				</p>

				{#if error}
					<div class="alert alert--error">{error}</div>
				{/if}

			<div>
				<label class="field-label" for="client-nombre">Nombre o clínica *</label>
				<input
					id="client-nombre"
					name="nombre"
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
					name="clinica"
					class="field-input"
					type="text"
					bind:value={form.clinica}
					placeholder="Ej. Escazú, Centro"
				/>
			</div>
			<div>
				<label class="field-label" for="client-email">Correo (usuario de acceso) *</label>
				<input
					id="client-email"
					name="email"
					class="field-input"
					type="email"
					bind:value={form.email}
					placeholder="contacto@clinica.com"
					autocomplete="email"
					required
				/>
			</div>
			<div>
				<label class="field-label" for="client-password">Contraseña inicial *</label>
				<input
					id="client-password"
					name="password"
					class="field-input"
					type="password"
					bind:value={form.password}
					placeholder="Mínimo 8 caracteres"
					autocomplete="new-password"
					minlength="8"
					required
				/>
			</div>
			<div>
				<label class="field-label" for="client-password-confirm">Confirmar contraseña *</label>
				<input
					id="client-password-confirm"
					name="passwordConfirm"
					class="field-input"
					type="password"
					bind:value={form.passwordConfirm}
					autocomplete="new-password"
					minlength="8"
					required
				/>
			</div>
			<div>
				<label class="field-label" for="client-telefono">Teléfono</label>
				<input
					id="client-telefono"
					name="telefono"
					class="field-input"
					type="tel"
					bind:value={form.telefono}
					placeholder="+506 0000-0000"
					autocomplete="tel"
				/>
			</div>
			</div>

			<div class="case-file-modal__footer admin-client-form__actions">
				<button type="button" class="btn-pearl-capsule" onclick={closeModal} disabled={saving}>
					Cancelar
				</button>
				<button type="submit" class="btn-primary" disabled={saving}>
					{saving ? 'Creando acceso…' : 'Crear cliente y acceso'}
				</button>
			</div>
		</form>
	</div>
{/if}
