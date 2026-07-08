<script lang="ts">
	import {
		BRAND_NAME,
		LOGO_FOR_DARK_BG,
		LOGO_FOR_LIGHT_BG,
		logoForTheme
	} from '$lib/brand/assets';
	import { getTheme } from '$lib/theme/theme.svelte';

	type LogoSurface = 'auto' | 'dark' | 'light';

	interface Props {
		/** auto = sigue el tema; dark = fondo oscuro; light = fondo claro */
		surface?: LogoSurface;
		size?: number;
		alt?: string;
		class?: string;
	}

	let {
		surface = 'auto',
		size = 44,
		alt = BRAND_NAME,
		class: className = ''
	}: Props = $props();

	let src = $derived.by(() => {
		if (surface === 'dark') return LOGO_FOR_DARK_BG;
		if (surface === 'light') return LOGO_FOR_LIGHT_BG;
		return logoForTheme(getTheme());
	});
</script>

<img
	{src}
	{alt}
	class="luxe-logo {className}"
	width={size}
	height={size}
	decoding="async"
/>
