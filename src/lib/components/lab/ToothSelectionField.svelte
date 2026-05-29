<script lang="ts">
	import ToothPicker from './ToothPicker.svelte';
	import { formatTeethSelection } from '$lib/lab/teeth';

	interface Props {
		selected?: string[];
		id?: string;
	}

	let { selected = $bindable<string[]>([]), id = 'piezas' }: Props = $props();

	let open = $state(false);

	const label = $derived(formatTeethSelection(selected));
	const hasSelection = $derived(selected.length > 0);

	function toggleOpen() {
		open = !open;
	}

	function confirmPicking() {
		open = false;
	}
</script>

<div class="tooth-selection-field">
	<label class="field-label" for={id}>Nº pieza *</label>
	<button
		type="button"
		id={id}
		class="field-input tooth-selection-field__control"
		class:tooth-selection-field__control--filled={hasSelection}
		aria-expanded={open}
		onclick={toggleOpen}
	>
		{#if hasSelection}
			{label}
		{:else}
			<span class="tooth-selection-field__placeholder">Seleccionar dientes…</span>
		{/if}
	</button>

	{#if open}
		<div class="tooth-selection-field__panel">
			<ToothPicker bind:selected compact />
			<div class="tooth-selection-field__footer">
				{#if hasSelection}
					<p class="tooth-selection-field__summary">
						<strong>{selected.length}</strong>
						{selected.length === 1 ? 'pieza seleccionada' : 'piezas seleccionadas'}:
						<span class="tooth-selection-field__summary-nums">#{label}</span>
					</p>
				{:else}
					<p class="tooth-selection-field__summary tooth-selection-field__summary--empty">
						Selecciona al menos un diente o pulsa Listo para cerrar
					</p>
				{/if}
				<button
					type="button"
					class="btn-primary tooth-selection-field__done"
					onclick={confirmPicking}
				>
					Listo — confirmar selección
				</button>
			</div>
		</div>
	{/if}
</div>
