<script lang="ts">
	import { enhance } from '$app/forms';
	import { Trash2 } from '@lucide/svelte';

	interface Props {
		caseId: string;
		caseNumber: string;
		compact?: boolean;
		onDeleted?: () => void;
	}

	let { caseId, caseNumber, compact = false, onDeleted }: Props = $props();

	let open = $state(false);
	let deleting = $state(false);
	let errorMessage = $state('');

	function failureMessage(result: { type: string; data?: unknown }): string {
		if (result.type === 'failure' && result.data && typeof result.data === 'object' && 'message' in result.data) {
			const message = String(result.data.message ?? '').trim();
			if (message) return message;
		}
		return 'No se pudo eliminar el caso.';
	}
</script>

<button
	type="button"
	class={compact ? 'text-link client-case-delete' : 'btn-danger-outline'}
	onclick={() => {
		errorMessage = '';
		open = true;
	}}
>
	{#if !compact}
		<Trash2 size={16} />
	{/if}
	Eliminar
</button>

{#if open}
	<div class="case-file-modal__backdrop" onclick={() => !deleting && (open = false)} role="presentation"></div>
	<div class="case-file-modal case-file-modal--form" role="dialog" aria-modal="true" aria-labelledby="delete-case-title">
		<header class="case-file-modal__header">
			<div>
				<p class="case-file-modal__eyebrow">Zona de riesgo</p>
				<h3 class="case-file-modal__title" id="delete-case-title">Eliminar caso</h3>
			</div>
			<button
				type="button"
				class="case-file-modal__close"
				aria-label="Cerrar"
				disabled={deleting}
				onclick={() => (open = false)}
			>
				×
			</button>
		</header>
		<form
			class="case-file-modal__body"
			method="POST"
			action="/admin/casos/{caseId}?/delete"
			use:enhance={() => {
				deleting = true;
				errorMessage = '';
				return async ({ result, update }) => {
					deleting = false;
					if (result.type === 'success') {
						open = false;
						onDeleted?.();
						await update({ reset: false });
						return;
					}
					errorMessage = failureMessage(result);
					await update({ reset: false });
				};
			}}
		>
			<div class="case-file-modal__fields">
				<p class="case-file-modal__lead">
					Se eliminará el caso <strong>{caseNumber}</strong> y sus facturas que todavía no se han emitido.
				</p>
				{#if errorMessage}
					<div class="alert alert--error">{errorMessage}</div>
				{/if}
			</div>
			<div class="case-file-modal__footer">
				<button type="button" class="btn-pearl-capsule" disabled={deleting} onclick={() => (open = false)}>
					Cancelar
				</button>
				<button type="submit" class="btn-danger" disabled={deleting}>
					{deleting ? 'Eliminando…' : 'Eliminar caso'}
				</button>
			</div>
		</form>
	</div>
{/if}

<style>
	.client-case-delete {
		color: var(--color-danger, #c0392b);
	}
</style>
