<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import { validateClientTelefono } from '$lib/fe/client-fiscal-validation';

	let {
		nombre,
		clinica,
		telefono,
		form,
		onSaved
	}: {
		nombre: string;
		clinica: string;
		telefono: string;
		form?: { message?: string; success?: boolean };
		onSaved?: (next: { nombre: string; clinica: string; telefono: string }) => void;
	} = $props();

	let draftNombre = $state(untrack(() => nombre));
	let draftClinica = $state(untrack(() => clinica));
	let draftTelefono = $state(untrack(() => telefono));
	let saving = $state(false);
	let fieldError = $state('');

	function validateDraft(): boolean {
		fieldError = '';
		if (draftNombre.trim().length < 2) {
			fieldError = 'El nombre debe tener al menos 2 caracteres.';
			return false;
		}
		const telCheck = validateClientTelefono(draftTelefono);
		if (!telCheck.ok) {
			fieldError = telCheck.message;
			return false;
		}
		draftTelefono = telCheck.normalized;
		return true;
	}
</script>

<section class="dash-panel dash-panel--section" style="margin-top: var(--spacing-xxl);">
	<h3 class="dash-panel__section-title">Datos del cliente</h3>
	<p class="type-caption" style="margin-bottom: var(--spacing-md);">
		Nombre, sucursal y teléfono. El cambio se refleja en la ficha, en los casos y en las facturas.
	</p>

	{#if fieldError || form?.message}
		<p
			class="type-caption"
			style="margin-bottom: var(--spacing-md); color: {fieldError || !form?.success
				? 'var(--color-danger)'
				: 'var(--color-success)'};"
			role="alert"
		>
			{fieldError || form?.message}
		</p>
	{/if}

	<form
		method="POST"
		action="?/updateProfile"
		use:enhance={() => {
			if (!validateDraft()) return () => {};
			saving = true;
			return async ({ result, update }) => {
				saving = false;
				await update({ reset: false });
				if (result.type === 'success') {
					onSaved?.({
						nombre: draftNombre.trim(),
						clinica: draftClinica.trim(),
						telefono: draftTelefono.trim()
					});
				}
			};
		}}
	>
		<div class="profile-grid">
			<label class="field">
				<span class="field-label">Nombre o clínica</span>
				<input class="field-input" name="nombre" bind:value={draftNombre} required maxlength="160" />
			</label>
			<label class="field">
				<span class="field-label">Sucursal / razón social</span>
				<input class="field-input" name="clinica" bind:value={draftClinica} maxlength="160" />
			</label>
			<label class="field field--full">
				<span class="field-label">Teléfono</span>
				<input
					class="field-input"
					name="telefono"
					bind:value={draftTelefono}
					inputmode="tel"
					maxlength="20"
					placeholder="Opcional"
				/>
			</label>
		</div>
		<button type="submit" class="btn-primary" style="margin-top: var(--spacing-md);" disabled={saving}>
			{saving ? 'Guardando…' : 'Guardar datos'}
		</button>
	</form>
</section>

<style>
	.profile-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--spacing-md);
	}

	.field--full {
		grid-column: 1 / -1;
	}

	@media (max-width: 640px) {
		.profile-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
