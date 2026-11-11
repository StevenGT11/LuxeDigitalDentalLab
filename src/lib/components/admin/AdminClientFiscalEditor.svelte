<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import ActividadEconomica from '$lib/components/actividadEconomica/components/actividadEconomica.svelte';
	import ClientFeAddressFields from '$lib/components/admin/ClientFeAddressFields.svelte';
	import FeCorreosField from '$lib/components/fe/FeCorreosField.svelte';
	import type { ClientFeAddress } from '$lib/fe/client-fiscal-address';
	import { FE_TIPO_IDENTIFICACION_OPTIONS } from '$lib/fe/constants';
	import {
		feIdentificacionAllowsLetters,
		feIdentificacionFieldMaxLength,
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

	function fiscalSnapshot(value: ClientFiscalForm): string {
		return [
			value.fe_tipo_identificacion,
			value.fe_numero_identificacion,
			value.fe_codigo_actividad,
			value.fe_correo_facturacion,
			value.telefono,
			value.fe_provincia ?? '',
			value.fe_canton,
			value.fe_distrito,
			value.fe_otras_senas
		].join('\u001f');
	}

	let draft = $state(untrack(() => ({ ...fiscal })));
	let saving = $state(false);
	let fieldError = $state('');
	let appliedFiscalKey = $state(untrack(() => fiscalSnapshot(fiscal)));

	const identificacionHint = $derived(feIdentificacionInputHint(draft.fe_tipo_identificacion));
	const identificacionAllowsLetters = $derived(
		feIdentificacionAllowsLetters(draft.fe_tipo_identificacion)
	);

	function applyIdentificacion(raw: string, tipo = draft.fe_tipo_identificacion) {
		draft.fe_numero_identificacion = normalizeFeNumeroIdentificacion(raw, tipo).slice(
			0,
			feIdentificacionMaxLength(tipo)
		);
		fieldError = '';
	}

	function draftHasBillingInfo(): boolean {
		return Boolean(
			draft.fe_numero_identificacion.trim() ||
				draft.fe_correo_facturacion.trim() ||
				draft.fe_otras_senas.trim() ||
				draft.fe_provincia
		);
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
		const key = fiscalSnapshot(fiscal);
		if (key === appliedFiscalKey) return;
		const incomingEmpty =
			!fiscal.fe_numero_identificacion.trim() &&
			!fiscal.fe_correo_facturacion.trim() &&
			!fiscal.fe_otras_senas.trim() &&
			!fiscal.fe_provincia;
		// A reload that comes back empty must not wipe the address the user just saved.
		if (incomingEmpty && draftHasBillingInfo()) return;
		appliedFiscalKey = key;
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
		use:enhance={({ formData, cancel }) => {
			if (!validateDraft()) {
				cancel();
				return;
			}
			formData.set('fe_tipo_identificacion', draft.fe_tipo_identificacion);
			formData.set('fe_numero_identificacion', draft.fe_numero_identificacion);
			formData.set('telefono', draft.telefono);
			formData.set('fe_codigo_actividad', draft.fe_codigo_actividad ?? '');
			formData.set('fe_correo_facturacion', draft.fe_correo_facturacion ?? '');
			formData.set('fe_provincia', draft.fe_provincia ? String(draft.fe_provincia) : '');
			formData.set('fe_canton', draft.fe_canton ?? '');
			formData.set('fe_distrito', draft.fe_distrito ?? '');
			formData.set('fe_otras_senas', draft.fe_otras_senas ?? '');
			saving = true;
			return async ({ result, update }) => {
				saving = false;
				// Default reset restores the inputs to their initial empty values.
				await update({ reset: false });
				if (result.type === 'success') {
					onSaved?.(draft.telefono);
				}
			};
		}}
	>
		<div class="fiscal-grid">
			<label class="field">
				<span class="field-label">Tipo identificación</span>
				<select
					class="field-select"
					name="fe_tipo_identificacion"
					bind:value={draft.fe_tipo_identificacion}
					onchange={(e) => applyIdentificacion(draft.fe_numero_identificacion, e.currentTarget.value)}
				>
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
					inputmode={identificacionAllowsLetters ? 'text' : 'numeric'}
					autocapitalize={identificacionAllowsLetters ? 'characters' : 'off'}
					spellcheck="false"
					autocomplete="off"
					maxlength={feIdentificacionFieldMaxLength(draft.fe_tipo_identificacion)}
					value={draft.fe_numero_identificacion}
					oninput={(e) => applyIdentificacion(e.currentTarget.value)}
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
