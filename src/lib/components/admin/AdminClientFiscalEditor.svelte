<script lang="ts">
	import { enhance } from '$app/forms';
	import ActividadEconomica from '$lib/components/actividadEconomica/components/actividadEconomica.svelte';
	import { FE_TIPO_IDENTIFICACION_OPTIONS } from '$lib/fe/constants';

	export type ClientFiscalForm = {
		fe_tipo_identificacion: string;
		fe_numero_identificacion: string;
		fe_codigo_actividad: string;
		fe_correo_facturacion: string;
	};

	let {
		fiscal,
		form
	}: {
		fiscal: ClientFiscalForm;
		form?: { message?: string; success?: boolean };
	} = $props();

	let draft = $state({ ...fiscal });
	let saving = $state(false);

	$effect(() => {
		draft = { ...fiscal };
	});
</script>

<section class="dash-panel dash-panel--section" style="margin-top: var(--spacing-xxl);">
	<h3 class="dash-panel__section-title">Datos fiscales (receptor FE)</h3>
	<p class="type-caption" style="margin-bottom: var(--spacing-md);">
		Cédula y actividad económica del receptor para factura electrónica (Hacienda v4.4).
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
		use:enhance={() => {
			saving = true;
			return async ({ update }) => {
				saving = false;
				await update();
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
					bind:value={draft.fe_numero_identificacion}
					required
				/>
			</label>
			<div class="field field--full">
				<ActividadEconomica
					bind:codigo={draft.fe_codigo_actividad}
					inputName="fe_codigo_actividad"
					label="Actividad económica (CIIU)"
					helperText="Opcional hoy; Hacienda puede exigirlo en el futuro. Use el código exacto del RUT."
				/>
			</div>
			<label class="field">
				<span class="field-label">Correo facturación</span>
				<input
					class="field-input"
					type="email"
					name="fe_correo_facturacion"
					bind:value={draft.fe_correo_facturacion}
					placeholder="Si difiere del correo del portal"
				/>
			</label>
		</div>
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
	@media (max-width: 640px) {
		.fiscal-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
