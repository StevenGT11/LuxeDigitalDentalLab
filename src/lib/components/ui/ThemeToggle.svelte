<script lang="ts">
	import { Moon, Sun } from '@lucide/svelte';
	import { getTheme, toggleTheme } from '$lib/theme/theme.svelte';

	interface Props {
		compact?: boolean;
	}

	let { compact = false }: Props = $props();

	let isDark = $derived(getTheme() === 'dark');
</script>

<button
	type="button"
	class="theme-toggle"
	class:theme-toggle--compact={compact}
	onclick={toggleTheme}
	aria-label={isDark ? 'Activar modo claro' : 'Activar modo oscuro'}
	title={isDark ? 'Modo claro' : 'Modo oscuro'}
>
	{#if isDark}
		<span class="theme-toggle__icon"><Sun size={16} strokeWidth={1.75} /></span>
	{:else}
		<span class="theme-toggle__icon"><Moon size={16} strokeWidth={1.75} /></span>
	{/if}
	{#if !compact}
		<span class="theme-toggle__label">{isDark ? 'Claro' : 'Oscuro'}</span>
	{/if}
</button>
