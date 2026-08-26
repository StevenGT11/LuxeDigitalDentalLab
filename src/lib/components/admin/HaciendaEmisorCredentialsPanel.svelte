<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidate } from '$app/navigation';
	import FeConsecutivosPanel from '$lib/components/admin/FeConsecutivosPanel.svelte';
	import SecretCredentialField from '$lib/components/admin/SecretCredentialField.svelte';
	import type { FeAmbienteConsecutivos } from '$lib/fe/consecutivos';
	import type { FeAmbiente, FeEmisorConfigPublic } from '$lib/fe/types';

	let {
		ambiente,
		title,
		config,
		consecutivos = null,
		canEdit = false,
		consecutivosFormMessage = '',
		consecutivosFormSuccess = false,
		showConsecutivosFeedback = false,
		isEmitTarget = false,
		isComplete = false,
		formMessage = '',
		formSuccess = false,
		showFeedback = false
	}: {
		ambiente: FeAmbiente;
		title: string;
		config: FeEmisorConfigPublic | null;
		consecutivos?: FeAmbienteConsecutivos | null;
		canEdit?: boolean;
		consecutivosFormMessage?: string;
		consecutivosFormSuccess?: boolean;
		showConsecutivosFeedback?: boolean;
		isEmitTarget?: boolean;
		isComplete?: boolean;
		formMessage?: string;
		formSuccess?: boolean;
		showFeedback?: boolean;
	} = $props();

	let draft = $state({
		id: '',
		hacienda_usuario: '',
		has_hacienda_password: false,
		has_pin: false,
		has_certificado: false
	});
	let saving = $state(false);
	let haciendaPassword = $state('');
	let pinCertificado = $state('');

	$effect(() => {
		if (!config) return;
		draft = {
			id: config.id,
			hacienda_usuario: config.hacienda_usuario,
			has_hacienda_password: config.has_hacienda_password,
			has_pin: config.has_pin,
			has_certificado: config.has_certificado
		};
		haciendaPassword = '';
		pinCertificado = '';
	});
</script>

<article
	class="hacienda-creds-panel dash-panel dash-panel--section"
	class:hacienda-creds-panel--emit={isEmitTarget}
>
	<header class="hacienda-creds-panel__head">
		<h3 class="dash-panel__section-title">{title}</h3>
		<div class="hacienda-creds-panel__badges">
			{#if isEmitTarget}
				<span class="badge badge--warning">En uso al emitir</span>
			{/if}
			{#if isComplete}
				<span class="badge badge--success">Completa</span>
			{:else}
				<span class="badge badge--muted">Incompleta</span>
			{/if}
		</div>
	</header>

	{#if formMessage && (showFeedback || !formSuccess)}
		<p
			class="hacienda-creds-panel__alert type-caption"
			class:hacienda-creds-panel__alert--ok={formSuccess}
			role="alert"
		>
			{formMessage}
		</p>
	{/if}

	<FeConsecutivosPanel
		{ambiente}
		{consecutivos}
		{canEdit}
		formMessage={consecutivosFormMessage}
		formSuccess={consecutivosFormSuccess}
		showFeedback={showConsecutivosFeedback}
	/>

	<form
		method="POST"
		action="?/saveCredentials"
		enctype="multipart/form-data"
		use:enhance={() => {
			saving = true;
			return async ({ update }) => {
				saving = false;
				await update({ reset: false });
				await invalidate('app:fe-emisor');
			};
		}}
	>
		<input type="hidden" name="ambiente" value={ambiente} />
		{#if draft.id}
			<input type="hidden" name="id" value={draft.id} />
		{/if}

		<div class="form-grid">
			<label class="field field--full">
				<span class="field-label">Usuario Hacienda (ATV)</span>
				<input
					class="field-input"
					name="hacienda_usuario"
					required
					bind:value={draft.hacienda_usuario}
					placeholder={ambiente === 'staging' ? '...@stag.comprobanteselectronicos.go.cr' : '...@prod.comprobanteselectronicos.go.cr'}
				/>
			</label>
			<SecretCredentialField
				name="hacienda_password"
				label="Contraseña Hacienda"
				hasStored={draft.has_hacienda_password}
				configId={draft.id}
				secretField="hacienda_password"
				bind:value={haciendaPassword}
				fullWidth
			/>
			<SecretCredentialField
				name="pin_certificado"
				label="PIN del certificado"
				hasStored={draft.has_pin}
				configId={draft.id}
				secretField="pin_certificado"
				bind:value={pinCertificado}
			/>
			<label class="field field--full">
				<span class="field-label">
					Certificado .p12 / .pfx
					{#if draft.has_certificado}<span class="type-fine-print"> (guardado)</span>{/if}
				</span>
				<input class="field-input" type="file" name="certificado_file" accept=".p12,.pfx" />
			</label>
		</div>

		<button type="submit" class="btn-primary" disabled={saving}>
			{saving ? 'Guardando…' : `Guardar ${title.toLowerCase()}`}
		</button>
	</form>
</article>

<style>
	.hacienda-creds-panel--emit {
		outline: 2px solid color-mix(in srgb, var(--color-accent, #c9a962) 45%, transparent);
		outline-offset: 2px;
	}

	.hacienda-creds-panel__head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--spacing-md);
		flex-wrap: wrap;
		margin-bottom: var(--spacing-lg);
	}

	.hacienda-creds-panel__head .dash-panel__section-title {
		margin: 0;
	}

	.hacienda-creds-panel__badges {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}

	.hacienda-creds-panel__alert {
		margin: 0 0 var(--spacing-md);
		padding: 0.5rem 0.75rem;
		border-radius: 6px;
		background: color-mix(in srgb, var(--color-danger) 12%, transparent);
		color: var(--color-danger);
	}

	.hacienda-creds-panel__alert--ok {
		background: color-mix(in srgb, var(--color-success) 12%, transparent);
		color: var(--color-success);
	}

	.form-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--spacing-md);
		margin-bottom: var(--spacing-lg);
	}

	.field--full {
		grid-column: 1 / -1;
	}

	@media (max-width: 520px) {
		.form-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
