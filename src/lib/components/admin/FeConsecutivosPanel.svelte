<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidate } from '$app/navigation';
	import type { FeAmbienteConsecutivos } from '$lib/fe/consecutivos';
	import type { FeAmbiente } from '$lib/fe/types';

	let {
		ambiente,
		consecutivos = null,
		canEdit = false,
		formMessage = '',
		formSuccess = false,
		showFeedback = false
	}: {
		ambiente: FeAmbiente;
		consecutivos?: FeAmbienteConsecutivos | null;
		canEdit?: boolean;
		formMessage?: string;
		formSuccess?: boolean;
		showFeedback?: boolean;
	} = $props();

	let saving = $state(false);
	let draft = $state<Record<string, number>>({});
	let hydratedKey = $state('');

	function snapshot(data: FeAmbienteConsecutivos | null): string {
		if (!data?.counters.length) return '__empty__';
		return data.counters.map((c) => `${c.tipo_documento}:${c.current_num}`).join('|');
	}

	$effect(() => {
		const key = snapshot(consecutivos);
		if (key === hydratedKey) return;
		hydratedKey = key;
		const next: Record<string, number> = {};
		for (const row of consecutivos?.counters ?? []) {
			next[row.tipo_documento] = row.current_num;
		}
		draft = next;
	});
</script>

<section class="fe-consecutivos" aria-label="Consecutivos Hacienda">
	<h4 class="fe-consecutivos__title">Consecutivos Hacienda</h4>

	{#if formMessage && (showFeedback || !formSuccess)}
		<p
			class="fe-consecutivos__alert type-caption"
			class:fe-consecutivos__alert--ok={formSuccess}
			role="alert"
		>
			{formMessage}
		</p>
	{/if}

	{#if !consecutivos || consecutivos.counters.length === 0}
		<p class="type-caption fe-consecutivos__empty">
			No disponible — aplique la migración de consecutivos por ambiente o revise la conexión al servidor.
		</p>
	{:else if !canEdit}
		<table class="fe-consecutivos__table type-caption">
			<thead>
				<tr>
					<th>Tipo</th>
					<th>Actual</th>
				</tr>
			</thead>
			<tbody>
				{#each consecutivos.counters as row (row.tipo_documento)}
					<tr class:fe-consecutivos__row--fe={row.tipo_documento === '01'}>
						<td>{row.label}</td>
						<td>{row.current_num}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{:else}
		<form
			method="POST"
			action="?/saveConsecutivos"
			class="fe-consecutivos__form"
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

			<table class="fe-consecutivos__table type-caption">
				<thead>
					<tr>
						<th>Tipo</th>
						<th>Actual</th>
					</tr>
				</thead>
				<tbody>
					{#each consecutivos.counters as row (row.tipo_documento)}
						<tr class:fe-consecutivos__row--fe={row.tipo_documento === '01'}>
							<td>{row.label}</td>
							<td>
								<input
									class="field-input fe-consecutivos__input"
									type="number"
									name="consecutivo_{row.tipo_documento}"
									min="0"
									step="1"
									required
									bind:value={draft[row.tipo_documento]}
									aria-label="Consecutivo actual {row.label}"
								/>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>

			<p class="type-caption fe-consecutivos__hint">
				Último número usado en este ambiente. La próxima emisión usará <strong>actual + 1</strong>.
			</p>

			<button type="submit" class="btn-secondary-pill fe-consecutivos__save" disabled={saving}>
				{saving ? 'Guardando…' : 'Guardar consecutivos'}
			</button>
		</form>
	{/if}
</section>

<style>
	.fe-consecutivos {
		margin-bottom: var(--spacing-lg);
		padding: var(--spacing-md);
		border-radius: 8px;
		background: color-mix(in srgb, var(--color-border, #e2e8f0) 18%, transparent);
	}

	.fe-consecutivos__title {
		margin: 0 0 var(--spacing-sm);
		font-size: 0.8125rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		opacity: 0.85;
	}

	.fe-consecutivos__empty {
		margin: 0;
		color: var(--color-warning, #b8860b);
	}

	.fe-consecutivos__alert {
		margin: 0 0 var(--spacing-sm);
		padding: 0.5rem 0.75rem;
		border-radius: 6px;
		background: color-mix(in srgb, var(--color-danger) 12%, transparent);
		color: var(--color-danger);
	}

	.fe-consecutivos__alert--ok {
		background: color-mix(in srgb, var(--color-success) 12%, transparent);
		color: var(--color-success);
	}

	.fe-consecutivos__table {
		width: 100%;
		border-collapse: collapse;
		margin-bottom: var(--spacing-sm);
	}

	.fe-consecutivos__table th,
	.fe-consecutivos__table td {
		padding: 0.35rem 0.35rem;
		text-align: left;
		vertical-align: middle;
	}

	.fe-consecutivos__table th:last-child,
	.fe-consecutivos__table td:last-child {
		text-align: right;
		width: 6.5rem;
	}

	.fe-consecutivos__row--fe td {
		font-weight: 600;
	}

	.fe-consecutivos__input {
		width: 100%;
		min-width: 5rem;
		padding: 4px 8px;
		font-size: 13px;
		text-align: right;
	}

	.fe-consecutivos__hint {
		margin: 0 0 var(--spacing-sm);
		line-height: 1.45;
		opacity: 0.85;
	}

	.fe-consecutivos__save {
		font-size: 13px;
	}
</style>
