<script lang="ts">
	import {
		LOWER_TEETH_FDI,
		UPPER_TEETH_FDI,
		formatTeethSelection,
		getAnatomyLabel,
		getToothDefinition,
		inferAnatomySummary,
		sortTeethFdi
	} from '$lib/lab/teeth';

	interface Props {
		selected?: string[];
		disabled?: boolean;
		/** Modo embebido: sin leyenda y resumen más compacto */
		compact?: boolean;
	}

	let { selected = $bindable<string[]>([]), disabled = false, compact = false }: Props = $props();

	const summary = $derived(inferAnatomySummary(selected));
	const label = $derived(formatTeethSelection(selected));

	function toggle(fdi: string) {
		if (disabled) return;
		if (selected.includes(fdi)) {
			selected = selected.filter((t) => t !== fdi);
		} else {
			selected = sortTeethFdi([...selected, fdi]);
		}
	}

	function archClass(fdi: string): string {
		const def = getToothDefinition(fdi);
		if (!def) return '';
		return `tooth-btn--${def.anatomy}`;
	}
</script>

<div class="tooth-picker" class:tooth-picker--disabled={disabled}>
	{#if !compact}
		<p class="tooth-picker__hint">Haz clic en los dientes (notación FDI). Puedes elegir varios.</p>
	{:else}
		<p class="tooth-picker__hint tooth-picker__hint--compact">Clic en cada diente · FDI</p>
	{/if}

	<div class="tooth-picker__arch">
		<span class="tooth-picker__arch-label">Superior</span>
		<div class="tooth-picker__row" role="group" aria-label="Arcada superior">
			{#each UPPER_TEETH_FDI as fdi}
				<button
					type="button"
					class="tooth-btn {archClass(fdi)}"
					class:tooth-btn--selected={selected.includes(fdi)}
					{disabled}
					title="{getToothDefinition(fdi)?.label ?? fdi}"
					aria-pressed={selected.includes(fdi)}
					onclick={() => toggle(fdi)}
				>
					{fdi}
				</button>
			{/each}
		</div>
	</div>

	<div class="tooth-picker__midline" aria-hidden="true"></div>

	<div class="tooth-picker__arch">
		<span class="tooth-picker__arch-label">Inferior</span>
		<div class="tooth-picker__row" role="group" aria-label="Arcada inferior">
			{#each LOWER_TEETH_FDI as fdi}
				<button
					type="button"
					class="tooth-btn {archClass(fdi)}"
					class:tooth-btn--selected={selected.includes(fdi)}
					{disabled}
					title="{getToothDefinition(fdi)?.label ?? fdi}"
					aria-pressed={selected.includes(fdi)}
					onclick={() => toggle(fdi)}
				>
					{fdi}
				</button>
			{/each}
		</div>
	</div>

	{#if !compact}
		<div class="tooth-picker__summary">
			{#if selected.length === 0}
				<span class="tooth-picker__empty">Ningún diente seleccionado</span>
			{:else}
				<span class="tooth-picker__selection">
					<strong>{selected.length}</strong>
					{selected.length === 1 ? 'pieza' : 'piezas'}:
					<span class="tooth-picker__nums">#{label}</span>
				</span>
				{#if summary}
					<span class="tooth-picker__anatomy tooth-picker__anatomy--{summary}">
						{getAnatomyLabel(summary)}
					</span>
				{/if}
			{/if}
		</div>
	{/if}

	{#if !compact}
		<div class="tooth-picker__legend">
			<span class="tooth-picker__legend-item"><i class="tooth-legend-dot tooth-legend-dot--incisivo"></i> Incisivo</span>
			<span class="tooth-picker__legend-item"><i class="tooth-legend-dot tooth-legend-dot--canino"></i> Canino</span>
			<span class="tooth-picker__legend-item"><i class="tooth-legend-dot tooth-legend-dot--premolar"></i> Premolar</span>
			<span class="tooth-picker__legend-item"><i class="tooth-legend-dot tooth-legend-dot--molar"></i> Molar</span>
		</div>
	{/if}
</div>
