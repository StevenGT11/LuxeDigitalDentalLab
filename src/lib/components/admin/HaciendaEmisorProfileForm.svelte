<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidate } from '$app/navigation';
	import AddressPicker from '$lib/components/addressPicker/components/addressPicker.svelte';
	import { pickerValuesFromHacienda } from '$lib/components/addressPicker/hacienda-location';
	import ActividadEconomica from '$lib/components/actividadEconomica/components/actividadEconomica.svelte';
	import { FE_TIPO_IDENTIFICACION_OPTIONS } from '$lib/fe/constants';
	import type { FeEmisorConfigPublic } from '$lib/fe/types';

	let {
		profile,
		formMessage = '',
		formSuccess = false,
		showFeedback = false
	}: {
		profile: FeEmisorConfigPublic | null;
		formMessage?: string;
		formSuccess?: boolean;
		showFeedback?: boolean;
	} = $props();

	function emptyProfile() {
		return {
			tipo_identificacion: '02',
			numero_identificacion: '',
			razon_social: '',
			nombre_comercial: '',
			codigo_actividad: '',
			casa_matriz: '001',
			terminal: '00001',
			provincia: 1,
			canton: '01',
			distrito: '01',
			otras_senas: '',
			telefono: '',
			correo_electronico: ''
		};
	}

	let draft = $state(emptyProfile());
	let saving = $state(false);
	let pickProvince = $state(1);
	let pickCanton = $state(1);
	let pickDistrict = $state(1);
	let hydratedKey = $state('');

	function profileSnapshot(p: FeEmisorConfigPublic | null): string {
		if (!p) return '__empty__';
		return [
			p.id,
			p.tipo_identificacion,
			p.numero_identificacion,
			p.razon_social,
			p.nombre_comercial,
			p.codigo_actividad,
			p.casa_matriz,
			p.terminal,
			p.provincia,
			p.canton,
			p.distrito,
			p.otras_senas,
			p.telefono,
			p.correo_electronico,
			p.updated_at ?? ''
		].join('|');
	}

	function hydrateFromProfile(p: FeEmisorConfigPublic | null) {
		if (!p) {
			draft = emptyProfile();
			pickProvince = 1;
			pickCanton = 1;
			pickDistrict = 1;
			return;
		}
		draft = {
			tipo_identificacion: p.tipo_identificacion,
			numero_identificacion: p.numero_identificacion,
			razon_social: p.razon_social,
			nombre_comercial: p.nombre_comercial,
			codigo_actividad: p.codigo_actividad,
			casa_matriz: p.casa_matriz,
			terminal: p.terminal,
			provincia: p.provincia,
			canton: p.canton,
			distrito: p.distrito,
			otras_senas: p.otras_senas,
			telefono: p.telefono,
			correo_electronico: p.correo_electronico
		};
		const pick = pickerValuesFromHacienda(p.provincia, p.canton, p.distrito);
		pickProvince = pick.province;
		pickCanton = pick.canton;
		pickDistrict = pick.district;
	}

	$effect(() => {
		const key = profileSnapshot(profile);
		if (key === hydratedKey) return;
		hydratedKey = key;
		hydrateFromProfile(profile);
	});

	$effect(() => {
		if (pickProvince > 0) draft.provincia = pickProvince;
		if (pickCanton > 0) draft.canton = String(pickCanton).padStart(2, '0');
		if (pickDistrict > 0) draft.distrito = String(pickDistrict).padStart(2, '0');
	});
</script>

<section class="dash-panel dash-panel--section hacienda-profile">
	<h3 class="dash-panel__section-title">Datos del emisor (compartidos)</h3>

	{#if formMessage && (showFeedback || !formSuccess)}
		<p
			class="hacienda-profile__alert type-caption"
			class:hacienda-profile__alert--ok={formSuccess}
			role="alert"
		>
			{formMessage}
		</p>
	{/if}

	<form
		method="POST"
		action="?/saveProfile"
		use:enhance={() => {
			saving = true;
			return async ({ update }) => {
				saving = false;
				await invalidate('app:fe-emisor');
				await update({ reset: false });
			};
		}}
	>
		<div class="form-grid">
			<label class="field">
				<span class="field-label">Tipo identificación</span>
				<select class="field-select" name="tipo_identificacion" bind:value={draft.tipo_identificacion}>
					{#each FE_TIPO_IDENTIFICACION_OPTIONS as opt (opt.value)}
						<option value={opt.value}>{opt.label}</option>
					{/each}
				</select>
			</label>
			<label class="field">
				<span class="field-label">Número identificación</span>
				<input class="field-input" name="numero_identificacion" required bind:value={draft.numero_identificacion} />
			</label>
			<label class="field field--full">
				<span class="field-label">Razón social</span>
				<input class="field-input" name="razon_social" required bind:value={draft.razon_social} />
			</label>
			<label class="field field--full">
				<span class="field-label">Nombre comercial</span>
				<input class="field-input" name="nombre_comercial" bind:value={draft.nombre_comercial} />
			</label>
			<div class="field field--full">
				<ActividadEconomica
					bind:codigo={draft.codigo_actividad}
					inputName="codigo_actividad"
					label="Código actividad (CIIU)"
					helperText="Debe coincidir exactamente con el código registrado en su RUT ante Hacienda (ej. 3250.0)."
					required
				/>
			</div>
			<label class="field">
				<span class="field-label">Casa matriz / Terminal</span>
				<div class="hacienda-profile__inline">
					<input class="field-input" name="casa_matriz" bind:value={draft.casa_matriz} aria-label="Casa matriz" />
					<input class="field-input" name="terminal" bind:value={draft.terminal} aria-label="Terminal" />
				</div>
			</label>
			<label class="field field--full">
				<span class="field-label">Ubicación (Hacienda)</span>
				<p class="type-caption hacienda-profile__hint">
					Provincia, cantón y distrito deben coincidir con su dirección fiscal en el RUT (error Hacienda -37).
				</p>
				<AddressPicker
					bind:address={draft.otras_senas}
					bind:province={pickProvince}
					bind:canton={pickCanton}
					bind:district={pickDistrict}
					required
				/>
				<input type="hidden" name="provincia" bind:value={draft.provincia} />
				<input type="hidden" name="canton" bind:value={draft.canton} />
				<input type="hidden" name="distrito" bind:value={draft.distrito} />
				<input type="hidden" name="otras_senas" bind:value={draft.otras_senas} />
			</label>
			<label class="field">
				<span class="field-label">Teléfono</span>
				<input
					class="field-input"
					name="telefono"
					bind:value={draft.telefono}
					inputmode="numeric"
					placeholder="88888888"
					maxlength="20"
				/>
				<span class="type-caption" style="margin-top: 0.25rem; opacity: 0.75;">8 dígitos (sin +506)</span>
			</label>
			<label class="field">
				<span class="field-label">Correo electrónico</span>
				<input class="field-input" type="email" name="correo_electronico" bind:value={draft.correo_electronico} />
			</label>
		</div>
		<button type="submit" class="btn-primary" style="margin-top: var(--spacing-lg);" disabled={saving}>
			{saving ? 'Guardando…' : 'Guardar datos del emisor'}
		</button>
	</form>
</section>

<style>
	.form-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--spacing-md) var(--spacing-lg);
		margin-top: var(--spacing-md);
	}
	.field--full {
		grid-column: 1 / -1;
	}
	.hacienda-profile__hint {
		margin: 0 0 0.5rem;
		opacity: 0.75;
	}
	.hacienda-profile__inline {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}
	.hacienda-profile__alert {
		margin: var(--spacing-md) 0 0;
		padding: 0.5rem 0.75rem;
		border-radius: 6px;
		background: color-mix(in srgb, var(--color-danger) 12%, transparent);
		color: var(--color-danger);
	}
	.hacienda-profile__alert--ok {
		background: color-mix(in srgb, var(--color-success) 12%, transparent);
		color: var(--color-success);
	}
	@media (max-width: 640px) {
		.form-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
