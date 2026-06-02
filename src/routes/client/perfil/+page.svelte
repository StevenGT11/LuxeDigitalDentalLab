<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import ClientDoctorsEditor from '$lib/components/client/ClientDoctorsEditor.svelte';
	import { hydrateClientSession, saveClientProfileRemote } from '$lib/lab/client-session';
	import { getClientProfile } from '$lib/lab/store';
	import type { ClientProfile } from '$lib/lab/types';

	let form = $state<ClientProfile>({
		id: '',
		nombre: '',
		clinica: '',
		email: '',
		telefono: ''
	});
	let saved = $state(false);
	let error = $state('');
	let loading = $state(true);
	let saving = $state(false);

	onMount(async () => {
		loading = true;
		error = '';
		try {
			await hydrateClientSession();
			form = { ...getClientProfile() };
		} catch (err) {
			error = err instanceof Error ? err.message : 'No se pudo cargar el perfil';
		} finally {
			loading = false;
		}
	});

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (!form.nombre.trim()) {
			error = 'El nombre es requerido';
			return;
		}
		error = '';
		saving = true;
		try {
			const updated = await saveClientProfileRemote({
				nombre: form.nombre.trim(),
				clinica: form.clinica.trim(),
				email: form.email.trim(),
				telefono: form.telefono.trim()
			});
			form = { ...updated };
			saved = true;
			setTimeout(() => goto('/client'), 800);
		} catch (err) {
			error = err instanceof Error ? err.message : 'No se pudo guardar el perfil';
		} finally {
			saving = false;
		}
	}
</script>

<div class="dash-page">
	<p class="dash-lead">Esta información aparecerá en tus casos enviados al laboratorio.</p>

	{#if loading}
		<p class="type-caption">Cargando perfil…</p>
	{:else}
		{#if saved}
			<div class="alert alert--success">Perfil guardado correctamente</div>
		{/if}

		{#if error}
			<div class="alert alert--error">{error}</div>
		{/if}

		<form onsubmit={handleSubmit} class="dash-panel">
			<div style="display: flex; flex-direction: column; gap: var(--spacing-lg);">
				<div>
					<label class="field-label" for="nombre">Nombre o clínica *</label>
					<input
						id="nombre"
						class="field-input"
						type="text"
						bind:value={form.nombre}
						placeholder="Ej. Clínica Dental Sonrisa"
						required
						disabled={saving}
					/>
				</div>
				<div>
					<label class="field-label" for="clinica">Razón social / sucursal</label>
					<input
						id="clinica"
						class="field-input"
						type="text"
						bind:value={form.clinica}
						placeholder="Ej. Sucursal Escazú"
						disabled={saving}
					/>
				</div>
				<div>
					<label class="field-label" for="email">Correo</label>
					<input
						id="email"
						class="field-input"
						type="email"
						bind:value={form.email}
						placeholder="contacto@clinica.com"
						disabled={saving}
					/>
				</div>
				<div>
					<label class="field-label" for="telefono">Teléfono</label>
					<input
						id="telefono"
						class="field-input"
						type="tel"
						bind:value={form.telefono}
						placeholder="+506 0000-0000"
						disabled={saving}
					/>
				</div>
				<div style="display: flex; gap: var(--spacing-sm); padding-top: var(--spacing-sm);">
					<button
						type="button"
						class="btn-pearl-capsule"
						disabled={saving}
						onclick={() => goto('/client')}
					>
						Cancelar
					</button>
					<button type="submit" class="btn-primary" disabled={saving}>
						{saving ? 'Guardando…' : 'Guardar perfil'}
					</button>
				</div>
			</div>
		</form>

		<ClientDoctorsEditor />
	{/if}
</div>
