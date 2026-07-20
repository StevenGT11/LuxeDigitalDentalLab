<script lang="ts">
	interface Props {
		id: string;
		notas?: string;
	}

	let { id, notas = $bindable('') }: Props = $props();
</script>

<div class="implant-crown-panel">
	<p class="implant-crown-panel__title">Sobre implante</p>
	<div class="implant-crown-panel__lead alert alert--info alert--compact" role="status">
		Indica la marca del implante y el tamaño de plataforma (ej. Straumann · 4.1 mm).
	</div>
	<div>
		<label class="field-label" for="{id}-notas">Datos del implante *</label>
		<textarea
			id="{id}-notas"
			class="field-textarea implant-crown-panel__notas"
			bind:value={notas}
			placeholder="Marca y plataforma del implante"
			rows="2"
		></textarea>
	</div>
</div>

<style>
	.implant-crown-panel {
		grid-column: 1 / -1;
		padding: var(--spacing-md) var(--spacing-lg);
		border: 1px solid color-mix(in srgb, var(--color-accent) 28%, var(--color-border));
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--color-accent) 6%, var(--color-surface));
	}

	.implant-crown-panel__title {
		margin: 0 0 4px;
		font-size: 14px;
		font-weight: 600;
		letter-spacing: 0.02em;
	}

	.implant-crown-panel__lead {
		margin: 0 0 var(--spacing-md);
		box-shadow: none;
	}

	.implant-crown-panel__notas {
		min-height: 4.5rem;
		resize: vertical;
	}
</style>
