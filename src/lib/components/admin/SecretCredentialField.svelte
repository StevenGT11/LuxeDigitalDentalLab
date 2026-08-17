<script lang="ts">
	import { Eye, EyeOff } from '@lucide/svelte';

	let {
		name,
		label,
		hasStored = false,
		value = $bindable(''),
		autocomplete = 'new-password',
		fullWidth = false
	}: {
		name: string;
		label: string;
		hasStored?: boolean;
		value?: string;
		autocomplete?: string;
		fullWidth?: boolean;
	} = $props();

	const STORED_MASK = '••••••••';

	let visible = $state(false);
	let editing = $state(false);

	const showStoredMask = $derived(hasStored && !value.trim() && !editing);
	const inputType = $derived(visible ? 'text' : 'password');

	function startEdit() {
		editing = true;
		visible = false;
	}

	function toggleVisible() {
		visible = !visible;
	}
</script>

<label class="field" class:field--full={fullWidth}>
	<span class="field-label">
		{label}
		{#if hasStored && !value.trim()}<span class="type-fine-print"> (guardada)</span>{/if}
	</span>
	<div class="secret-field">
		{#if showStoredMask}
			<input
				class="field-input secret-field__input"
				type={inputType}
				value={STORED_MASK}
				readonly
				onclick={startEdit}
				onfocus={startEdit}
				aria-label={`${label} guardada; clic para cambiar`}
			/>
		{:else}
			<input
				class="field-input secret-field__input"
				{name}
				type={inputType}
				{autocomplete}
				bind:value={value}
				placeholder={hasStored ? 'Dejar en blanco para mantener la guardada' : ''}
			/>
		{/if}
		<button
			type="button"
			class="secret-field__toggle"
			onclick={toggleVisible}
			aria-label={visible ? `Ocultar ${label}` : `Mostrar ${label}`}
			aria-pressed={visible}
		>
			{#if visible}
				<EyeOff size={18} aria-hidden="true" />
			{:else}
				<Eye size={18} aria-hidden="true" />
			{/if}
		</button>
	</div>
</label>

<style>
	.secret-field {
		position: relative;
		display: flex;
		align-items: stretch;
	}

	.secret-field__input {
		flex: 1;
		min-width: 0;
		padding-right: 2.75rem;
	}

	.secret-field__toggle {
		position: absolute;
		top: 0;
		right: 0;
		bottom: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.75rem;
		border: none;
		background: transparent;
		color: var(--color-muted-foreground, #64748b);
		cursor: pointer;
		border-radius: 0 4px 4px 0;
	}

	.secret-field__toggle:hover {
		color: var(--color-foreground, #0f172a);
	}

	.secret-field__toggle:focus-visible {
		outline: 2px solid var(--color-primary, #0f172a);
		outline-offset: -2px;
	}
</style>
