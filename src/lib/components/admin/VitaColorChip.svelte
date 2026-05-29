<script lang="ts">
	import { getVitaHex } from '$lib/lab/visual';

	interface Props {
		shade: string;
		size?: 'sm' | 'md';
	}

	let { shade, size = 'sm' }: Props = $props();

	const hex = $derived(getVitaHex(shade));
	const isBleach = $derived(shade.startsWith('BL'));
</script>

<span class="vita-chip vita-chip--{size}" class:vita-chip--bleach={isBleach} title="Tono VITA {shade}">
	<span class="vita-chip__swatch" style="background: {hex}"></span>
	<span class="vita-chip__label">{shade}</span>
</span>
