<script lang="ts">
	import { enhance } from '$app/forms';
	import ActividadEconomica from '$lib/components/actividadEconomica/components/actividadEconomica.svelte';
	import ClientFeAddressFields from '$lib/components/admin/ClientFeAddressFields.svelte';
	import FeCorreosField from '$lib/components/fe/FeCorreosField.svelte';
	import type { ClientFeAddress } from '$lib/fe/client-fiscal-address';
	import { FE_TIPO_IDENTIFICACION_OPTIONS } from '$lib/fe/constants';
	import {
		feIdentificacionInputHint,
		feIdentificacionMaxLength,
		normalizeFeNumeroIdentificacion,
		validateClientTelefono,
		validateFeNumeroIdentificacion
	} from '$lib/fe/client-fiscal-validation';

	export type ClientFiscalForm = {
		fe_tipo_identificacion: string;
		fe_numero_identificacion: string;
		fe_codigo_actividad: string;
		fe_correo_facturacion: string;
		telefono: string;
	} & ClientFeAddress;

	let {
		fiscal,
		form,
		onSaved
	}: {
		fiscal: ClientFiscalForm;
		form?: { message?: string; success?: boolean };
		onSaved?: (telefono: string) => void;
	} = $props();

	let draft = $state({ ...fiscal });
	let saving = $state(false);
	let fieldError = $state('');

	const identificacionHint = $derived(feIdentificacionInputHint(draft.fe_tipo_identificacion));
	const identificacionMaxLen = $derived(feIdentificacionMaxLength(draft.fe_tipo_identificacion));

	function onIdentificacionInput(raw: string) {
		draft.fe_numero_identificacion = normalizeFeNumeroIdentificacion(raw).slice(
			0,
			identificacionMaxLen
		);
		fieldError = '';
	}

	function validateDraft(): boolean {
		fieldError = '';
		const idCheck = validateFeNumeroIdentificacion(
			draft.fe_tipo_identificacion,
			draft.fe_numero_identificacion
		);
		if (!idCheck.ok) {
			fieldError = idCheck.message;
			return false;
		}
		draft.fe_numero_identificacion = idCheck.normalized;

		const telCheck = validateClientTelefono(draft.telefono);
		if (!telCheck.ok) {
			fieldError = telCheck.message;
			return false;
		}
		draft.telefono = telCheck.normalized;
		return true;
	}

	$effect(() => {
		draft = { ...fiscal };
		fieldError = '';
	});
</script>

<section class="dash-panel dash-panel--section" style="margin-top: var(--spacing-xxl);">
	<h3 class="dash-panel__section-title">Datos fiscales (receptor FE)</h3>
	<p class="type-caption" style="margin-bottom: var(--spacing-md);">
		Cédula, actividad económica y dirección fiscal del receptor para factura electrónica (Hacienda v4.4).
	</p>

	{#if form?.message}
		<p
			class="type-caption"
			style="margin-bottom: var(--spacing-md); color: {form.success ? 'var(--color-success)' : 'var(--color-danger)'};"
			role="alert"
		>
			{form.message}
		</p>
	{/if}

	<form
		method="POST"
		action="?/saveFiscal"
		use:enhance={({ cancel }) => {
			if (!validateDraft()) {
				cancel();
				return;
			}
			saving = true;
			return async ({ result, update }) => {
				saving = false;
				await update();
				if (result.type === 'success') {
					onSaved?.(draft.telefono);
				}
			};
		}}
	>
		<div class="fiscal-grid">
			<label class="field">
				<span class="field-label">Tipo identificación</span>
				<select class="field-select" name="fe_tipo_identificacion" bind:value={draft.fe_tipo_identificacion}>
					<option value="">— Seleccionar —</option>
					{#each FE_TIPO_IDENTIFICACION_OPTIONS as opt}
						<option value={opt.value}>{opt.label}</option>
					{/each}
				</select>
			</label>
			<label class="field">
				<span class="field-label">Número (cédula)</span>
				<input
					class="field-input"
					name="fe_numero_identificacion"
					inputmode="numeric"
					autocomplete="off"
					maxlength={identificacionMaxLen}
					value={draft.fe_numero_identificacion}
					oninput={(e) => onIdentificacionInput(e.currentTarget.value)}
					required
				/>
				<span class="type-caption fiscal-field-hint">{identificacionHint}</span>
			</label>
			<label class="field">
				<span class="field-label">Teléfono</span>
				<input
					class="field-input"
					name="telefono"
					type="tel"
					inputmode="tel"
					autocomplete="tel"
					placeholder="88887777 o +506 8888-7777"
					bind:value={draft.telefono}
				/>
				<span class="type-caption fiscal-field-hint">8 dígitos (Costa Rica)</span>
			</label>
			<div class="field field--full">
				<ActividadEconomica
					bind:codigo={draft.fe_codigo_actividad}
					inputName="fe_codigo_actividad"
					label="Actividad económica (CIIU)"
					helperText="Opcional hoy; Hacienda puede exigirlo en el futuro. Use el código exacto del RUT."
				/>
			</div>
			<div class="field--full">
				<FeCorreosField
					bind:value={draft.fe_correo_facturacion}
					placeholder="Si difiere del correo del portal. Puede agregar varios."
				/>
			</div>
			<div class="field field--full">
				<span class="field-label">Dirección fiscal</span>
				<ClientFeAddressFields bind:address={draft} />
			</div>
		</div>
		{#if fieldError}
			<p class="fiscal-field-error type-caption" role="alert">{fieldError}</p>
		{/if}
		<button type="submit" class="btn-primary" style="margin-top: var(--spacing-md);" disabled={saving}>
			{saving ? 'Guardando…' : 'Guardar datos fiscales'}
		</button>
	</form>
</section>

<style>
	.fiscal-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--spacing-md);
	}
	.field--full {
		grid-column: 1 / -1;
	}
	.fiscal-field-hint {
		display: block;
		margin-top: 0.35rem;
		color: var(--color-muted-foreground, #64748b);
	}

	.fiscal-field-error {
		margin: var(--spacing-md) 0 0;
		color: var(--color-danger, #b91c1c);
	}

	@media (max-width: 640px) {
		.fiscal-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
