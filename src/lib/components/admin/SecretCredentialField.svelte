<script lang="ts">
	import { deserialize } from '$app/forms';
	import { Eye, EyeOff } from '@lucide/svelte';

	export type FeSecretField = 'hacienda_password' | 'pin_certificado';

	let {
		name,
		label,
		hasStored = false,
		value = $bindable(''),
		configId = '',
		secretField = undefined as FeSecretField | undefined,
		autocomplete = 'new-password',
		fullWidth = false
	}: {
		name: string;
		label: string;
		hasStored?: boolean;
		value?: string;
		configId?: string;
		secretField?: FeSecretField;
		autocomplete?: string;
		fullWidth?: boolean;
	} = $props();

	const STORED_MASK = '••••••••';

	let visible = $state(false);
	let editing = $state(false);
	let storedSecret = $state('');
	let loadingReveal = $state(false);
	let revealError = $state('');

	const showStoredMask = $derived(hasStored && !value.trim() && !storedSecret && !editing);
	const inputType = $derived(visible ? 'text' : 'password');
	const canRevealStored = $derived(Boolean(configId && secretField && hasStored));

	function startEdit() {
		editing = true;
		if (storedSecret && !value.trim()) {
			value = storedSecret;
		}
		storedSecret = '';
		visible = false;
	}

	async function toggleVisible() {
		revealError = '';

		if (!visible && hasStored && !value.trim() && !storedSecret && canRevealStored) {
			loadingReveal = true;
			try {
				const fd = new FormData();
				fd.set('id', configId);
				fd.set('field', secretField!);
				const res = await fetch('?/revealSecret', { method: 'POST', body: fd });
				const result = deserialize(await res.text());
				if (result.type === 'success' && result.data?.value != null) {
					storedSecret = String(result.data.value);
					visible = true;
				} else if (result.type === 'failure') {
					revealError =
						(typeof result.data === 'object' && result.data && 'message' in result.data
							? String(result.data.message)
							: null) ?? 'No se pudo cargar el valor guardado.';
				} else {
					revealError = 'No se pudo cargar el valor guardado.';
				}
			} catch {
				revealError = 'Error al cargar el valor guardado.';
			} finally {
				loadingReveal = false;
			}
			return;
		}

		visible = !visible;
	}

	$effect(() => {
		hasStored;
		configId;
		if (!hasStored) {
			storedSecret = '';
			revealError = '';
		}
	});
</script>

<label class="field" class:field--full={fullWidth}>
	<span class="field-label">
		{label}
		{#if hasStored && !value.trim() && !storedSecret}<span class="type-fine-print"> (guardada)</span>{/if}
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
		{:else if storedSecret && !editing}
			<input
				class="field-input secret-field__input"
				type={inputType}
				value={storedSecret}
				readonly
				onclick={startEdit}
				onfocus={startEdit}
				aria-label={`${label} guardada`}
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
			disabled={loadingReveal || (showStoredMask && !canRevealStored)}
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
	{#if revealError}
		<span class="type-fine-print secret-field__error" role="alert">{revealError}</span>
	{/if}
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

	.secret-field__toggle:hover:not(:disabled) {
		color: var(--color-foreground, #0f172a);
	}

	.secret-field__toggle:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.secret-field__toggle:focus-visible {
		outline: 2px solid var(--color-primary, #0f172a);
		outline-offset: -2px;
	}

	.secret-field__error {
		display: block;
		margin-top: 0.25rem;
		color: var(--color-danger, #c0392b);
	}
</style>
