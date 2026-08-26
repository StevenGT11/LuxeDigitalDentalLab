<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidate } from '$app/navigation';
	import HaciendaEmisorCredentialsPanel from '$lib/components/admin/HaciendaEmisorCredentialsPanel.svelte';
	import HaciendaEmisorProfileForm from '$lib/components/admin/HaciendaEmisorProfileForm.svelte';
	import type { FeAmbiente } from '$lib/fe/types';

	let { data, form } = $props();

	const savedScope = $derived((form?.savedScope as string | undefined) ?? null);
	const savedAmbiente = $derived((form?.savedAmbiente as FeAmbiente | undefined) ?? null);

	let toggling = $state(false);
</script>

<div class="dash-page">
	{#if !data.feServerReady}
		<p class="hacienda-page-alert hacienda-page-alert--error" role="alert">
			Falta <code>SUPABASE_SERVICE_ROLE_KEY</code> en el servidor (.env). Los datos no se pueden guardar
			hasta configurarla y reiniciar <code>npm run dev</code>.
		</p>
	{:else if !data.canConfigureEmisor}
		<p class="hacienda-page-alert hacienda-page-alert--error" role="alert">
			Solo usuarios con rol <strong>admin</strong> pueden guardar la configuración de Hacienda. Puede ver
			esta página, pero al guardar verá un error de permisos.
		</p>
	{/if}

	{#if form?.message && form.success !== true}
		<p class="hacienda-page-alert hacienda-page-alert--error" role="alert">{form.message}</p>
	{/if}

	<p class="dash-lead">
		Los <strong>datos del emisor</strong> (cédula, razón social, dirección) son únicos. Solo las
		<strong>credenciales Hacienda y el certificado</strong> cambian entre pruebas y producción.
	</p>

	<div class="hacienda-env-banner dash-panel">
		<div class="hacienda-env-banner__row">
			<p class="type-body-strong hacienda-env-banner__label">Ambiente de envío al emitir FE</p>
			<form
				method="POST"
				action="?/setEmitAmbiente"
				class="hacienda-env-toggle"
				use:enhance={() => {
					toggling = true;
					return async ({ update }) => {
						toggling = false;
						await update({ reset: false });
						await invalidate('app:fe-emisor');
					};
				}}
			>
				<button
					type="submit"
					name="emit_ambiente"
					value="staging"
					class="hacienda-env-toggle__btn"
					class:hacienda-env-toggle__btn--active={data.emitAmbiente === 'staging'}
					disabled={toggling}
				>
					Pruebas
				</button>
				<button
					type="submit"
					name="emit_ambiente"
					value="production"
					class="hacienda-env-toggle__btn"
					class:hacienda-env-toggle__btn--active={data.emitAmbiente === 'production'}
					disabled={toggling}
				>
					Producción
				</button>
			</form>
		</div>

		{#if savedScope === 'emitAmbiente' && form?.message && form.success === true}
			<p class="type-caption hacienda-env-banner__ok" role="status">{form.message}</p>
		{/if}

		{#if !data.emitConfigReady}
			<p class="type-caption hacienda-env-banner__warn">
				Complete los datos del emisor y las credenciales del ambiente seleccionado.
			</p>
		{/if}
	</div>

	<p class="type-caption" style="margin: var(--spacing-lg) 0;">
		<a href="/admin/facturas" class="text-link">← Volver a facturas</a>
	</p>

	<HaciendaEmisorProfileForm
		profile={data.sharedProfile}
		formMessage={form?.message ?? ''}
		formSuccess={form?.success === true}
		showFeedback={savedScope === 'profile'}
	/>

	<h3 class="type-tagline" style="margin: var(--spacing-xxl) 0 var(--spacing-lg);">
		Credenciales Hacienda y firma digital
	</h3>

	<div class="hacienda-env-grid">
		<HaciendaEmisorCredentialsPanel
			ambiente="staging"
			title="Pruebas (staging)"
			config={data.staging}
			isEmitTarget={data.emitAmbiente === 'staging'}
			isComplete={data.stagingComplete}
			formMessage={form?.message ?? ''}
			formSuccess={form?.success === true}
			showFeedback={savedScope === 'credentials' && savedAmbiente === 'staging'}
		/>
		<HaciendaEmisorCredentialsPanel
			ambiente="production"
			title="Producción"
			config={data.production}
			isEmitTarget={data.emitAmbiente === 'production'}
			isComplete={data.productionComplete}
			formMessage={form?.message ?? ''}
			formSuccess={form?.success === true}
			showFeedback={savedScope === 'credentials' && savedAmbiente === 'production'}
		/>
	</div>
</div>

<style>
	.hacienda-page-alert {
		margin: 0 0 var(--spacing-lg);
		padding: 0.65rem 0.85rem;
		border-radius: 6px;
		font-size: 0.875rem;
	}

	.hacienda-page-alert--error {
		background: color-mix(in srgb, var(--color-danger) 12%, transparent);
		color: var(--color-danger);
	}

	.hacienda-env-banner {
		padding: var(--spacing-lg);
		margin-top: var(--spacing-md);
	}

	.hacienda-env-banner__row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-md);
	}

	.hacienda-env-banner__label {
		margin: 0;
	}

	.hacienda-env-toggle {
		display: inline-flex;
		padding: 3px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--color-border, #ccc) 35%, transparent);
		gap: 2px;
	}

	.hacienda-env-toggle__btn {
		border: none;
		cursor: pointer;
		padding: 0.45rem 1.1rem;
		border-radius: 999px;
		font: inherit;
		font-size: 0.875rem;
		background: transparent;
		color: inherit;
		opacity: 0.75;
		transition: background 0.15s, opacity 0.15s;
	}

	.hacienda-env-toggle__btn:hover:not(:disabled) {
		opacity: 1;
	}

	.hacienda-env-toggle__btn--active {
		opacity: 1;
		background: var(--color-surface, #fff);
		box-shadow: 0 1px 3px rgb(0 0 0 / 12%);
		font-weight: 600;
	}

	.hacienda-env-toggle__btn:disabled {
		cursor: wait;
		opacity: 0.6;
	}

	.hacienda-env-banner__warn {
		margin: var(--spacing-md) 0 0;
		color: var(--color-warning, #b8860b);
	}

	.hacienda-env-banner__ok {
		margin: var(--spacing-sm) 0 0;
		color: var(--color-success);
	}

	.hacienda-env-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--spacing-xl);
		align-items: start;
	}

	@media (min-width: 960px) {
		.hacienda-env-grid {
			grid-template-columns: 1fr 1fr;
		}
	}
</style>
