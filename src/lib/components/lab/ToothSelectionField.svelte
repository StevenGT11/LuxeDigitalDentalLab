<script lang="ts">
	import ToothPicker from './ToothPicker.svelte';

	interface Props {
		selected?: string[];
		id?: string;
	}

	let { selected = $bindable<string[]>([]), id = 'piezas' }: Props = $props();
</script>

<div class="tooth-selection-field">
	<p class="field-label" id="{id}-label">Dientes (opcional)</p>
	<div class="tooth-selection-field__picker" aria-labelledby="{id}-label">
		<ToothPicker bind:selected />
	</div>
</div>
