<script lang="ts">
	import { IMPLANTE_MARCAS, IMPLANTE_PLATAFORMAS } from '$lib/lab/implant-crown';

	interface Props {
		id: string;
		marca?: string;
		plataforma?: string;
	}

	let { id, marca = $bindable(''), plataforma = $bindable('') }: Props = $props();

	let marcaPreset = $derived.by(() => {
		const v = marca.trim();
		if (!v) return '';
		if ((IMPLANTE_MARCAS as readonly string[]).includes(v)) return v;
		return 'Otra';
	});

	let plataformaPreset = $derived.by(() => {
		const v = plataforma.trim();
		if (!v) return '';
		if ((IMPLANTE_PLATAFORMAS as readonly string[]).includes(v)) return v;
		return 'Otra';
	});

	function onMarcaPresetChange(value: string) {
		marca = value === 'Otra' ? '' : value;
	}

	function onPlataformaPresetChange(value: string) {
		plataforma = value === 'Otra' ? '' : value;
	}
</script>

<div class="implant-crown-panel">
	<p class="implant-crown-panel__title">Corona sobre implante</p>
	<p class="implant-crown-panel__lead type-fine-print">
		Indica la marca y el tamaño de plataforma para fabricar la corona compatible.
	</p>
	<div class="implant-crown-panel__grid">
		<div>
			<label class="field-label" for="{id}-marca">Marca del implante *</label>
			<select
				id="{id}-marca"
				class="field-select"
				value={marcaPreset}
				required
				onchange={(e) => onMarcaPresetChange((e.currentTarget as HTMLSelectElement).value)}
			>
				<option value="">Seleccionar marca</option>
				{#each IMPLANTE_MARCAS as m (m)}
					<option value={m}>{m}</option>
				{/each}
			</select>
			{#if marcaPreset === 'Otra'}
				<input
					id="{id}-marca-custom"
					class="field-input implant-crown-panel__custom"
					type="text"
					placeholder="Especificar marca"
					bind:value={marca}
					required
				/>
			{/if}
		</div>
		<div>
			<label class="field-label" for="{id}-plataforma">Tamaño de plataforma *</label>
			<select
				id="{id}-plataforma"
				class="field-select"
				value={plataformaPreset}
				required
				onchange={(e) => onPlataformaPresetChange((e.currentTarget as HTMLSelectElement).value)}
			>
				<option value="">Seleccionar plataforma</option>
				{#each IMPLANTE_PLATAFORMAS as p (p)}
					<option value={p}>{p}</option>
				{/each}
			</select>
			{#if plataformaPreset === 'Otra'}
				<input
					id="{id}-plataforma-custom"
					class="field-input implant-crown-panel__custom"
					type="text"
					placeholder="Ej. 4.1 mm, conexión cónica…"
					bind:value={plataforma}
					required
				/>
			{/if}
		</div>
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
	}

	.implant-crown-panel__grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: var(--spacing-md);
	}

	.implant-crown-panel__custom {
		margin-top: var(--spacing-sm);
	}
</style>
