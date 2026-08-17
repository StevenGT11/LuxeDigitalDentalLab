<script lang="ts">
	import type { FeRechazoFormatted } from '$lib/fe/format-rechazo';

	let { formatted }: { formatted: FeRechazoFormatted } = $props();
</script>

<div class="fe-rechazo" role="alert">
	<h3 class="fe-rechazo__title">Detalle rechazo</h3>

	{#if formatted.estado || formatted.codigo}
		<p class="fe-rechazo__meta">
			{#if formatted.estado}
				<span class="fe-rechazo__badge">{formatted.estado}</span>
			{/if}
			{#if formatted.codigo}
				<span class="type-caption">Código Hacienda: {formatted.codigo}</span>
			{/if}
		</p>
	{/if}

	{#if formatted.intro}
		<p class="fe-rechazo__intro">{formatted.intro}</p>
	{/if}

	{#if formatted.errors.length > 0}
		<div class="data-table-wrap">
			<table class="data-table fe-rechazo__table">
				<thead>
					<tr>
						<th>Cód.</th>
						<th>Mensaje</th>
						<th>Fila</th>
						<th>Col.</th>
					</tr>
				</thead>
				<tbody>
					{#each formatted.errors as err, i (i)}
						<tr>
							<td>{err.codigo}</td>
							<td class="fe-rechazo__mensaje">{err.mensaje}</td>
							<td>{err.fila}</td>
							<td>{err.columna}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<style>
	.fe-rechazo {
		margin: 0 0 var(--spacing-md);
		padding: 0.85rem 1rem;
		border-radius: 8px;
		background: color-mix(in srgb, var(--color-danger) 8%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-danger) 22%, transparent);
	}

	.fe-rechazo__title {
		margin: 0 0 0.5rem;
		font-size: 0.8125rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.fe-rechazo__meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 0.75rem;
		margin: 0 0 0.65rem;
	}

	.fe-rechazo__badge {
		display: inline-block;
		padding: 0.2rem 0.55rem;
		border-radius: 999px;
		font-size: 0.75rem;
		font-weight: 600;
		background: color-mix(in srgb, var(--color-danger) 18%, transparent);
		color: var(--color-danger);
	}

	.fe-rechazo__intro {
		margin: 0 0 0.75rem;
		font-size: 0.875rem;
		line-height: 1.5;
		white-space: pre-wrap;
	}

	.fe-rechazo__table {
		font-size: 0.8125rem;
	}

	.fe-rechazo__mensaje {
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.75rem;
		line-height: 1.45;
		word-break: break-word;
	}
</style>
