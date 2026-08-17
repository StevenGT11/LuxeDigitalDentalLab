<script lang="ts">
	import type { ActividadEconomicaEntry } from '$lib/actividadEconomica';
	import {
		findActividadEconomicaFromFile,
		normalizeActividadEconomicaCodigo,
		searchActividadEconomicaCatalogFromFile
	} from '$lib/actividadEconomica';

	interface Props {
		codigo?: string;
		/** Hidden input name for HTML forms */
		inputName?: string;
		label?: string;
		placeholder?: string;
		helperText?: string;
		required?: boolean;
		disabled?: boolean;
		errorText?: string;
		limit?: number;
		onSelect?: (entry: ActividadEconomicaEntry, source: 'user' | 'hydrate') => void;
	}

	let {
		codigo = $bindable(''),
		inputName,
		label = 'Código de actividad económica',
		placeholder = 'Buscar por código o descripción…',
		helperText = '',
		required = false,
		disabled = false,
		errorText = '',
		limit = 25,
		onSelect
	}: Props = $props();

	let dialogEl = $state<HTMLDialogElement | null>(null);
	let searchQuery = $state('');
	let searchResults = $state<ActividadEconomicaEntry[]>([]);
	let selectedDescripcion = $state('');
	let searchInputEl = $state<HTMLInputElement | null>(null);
	let debounceTimeout: ReturnType<typeof setTimeout> | undefined;
	let lastHydratedCode = $state('');

	const showError = $derived(Boolean(errorText));
	const normalizedCodigo = $derived(normalizeActividadEconomicaCodigo(codigo));

	function applyEntry(entry: ActividadEconomicaEntry, source: 'user' | 'hydrate') {
		const code = normalizeActividadEconomicaCodigo(entry.codigo);
		codigo = code;
		selectedDescripcion = entry.descripcion ?? '';
		lastHydratedCode = code;
		onSelect?.(entry, source);
	}

	function runSearch(query: string) {
		searchResults = searchActividadEconomicaCatalogFromFile(query, limit);
	}

	function scheduleSearch(query: string) {
		clearTimeout(debounceTimeout);
		debounceTimeout = setTimeout(() => runSearch(query), 150);
	}

	function openModal() {
		if (disabled) return;
		searchQuery = normalizedCodigo || '';
		runSearch(searchQuery);
		dialogEl?.showModal();
		requestAnimationFrame(() => {
			searchInputEl?.focus();
			searchInputEl?.select();
		});
	}

	function closeModal() {
		dialogEl?.close();
	}

	function handleSearchInput(event: Event) {
		const value = (event.currentTarget as HTMLInputElement).value;
		searchQuery = value;
		scheduleSearch(value);
	}

	function selectEntry(entry: ActividadEconomicaEntry) {
		applyEntry(entry, 'user');
		closeModal();
	}

	function hydrateCodigo(code: string) {
		if (!code) return;
		const exact = findActividadEconomicaFromFile(code);
		if (!exact) return;
		applyEntry(exact, 'hydrate');
	}

	function onDialogClick(event: MouseEvent) {
		if (event.target === dialogEl) closeModal();
	}

	$effect(() => {
		const code = normalizedCodigo;
		if (!code) {
			lastHydratedCode = '';
			selectedDescripcion = '';
			return;
		}
		if (code === lastHydratedCode && selectedDescripcion) return;
		hydrateCodigo(code);
	});
</script>

<div class="ae-picker">
	{#if label}
		<span class="field-label ae-picker__label" class:ae-picker__label--error={showError}>
			{label}{#if required}<span aria-hidden="true"> *</span>{/if}
		</span>
	{/if}

	<button
		type="button"
		class="ae-trigger field-input"
		class:ae-trigger--error={showError}
		{disabled}
		aria-haspopup="dialog"
		aria-expanded={dialogEl?.open ?? false}
		onclick={openModal}
	>
		<span class="ae-trigger__body">
			{#if normalizedCodigo}
				<span class="ae-trigger__code">{normalizedCodigo}</span>
				{#if selectedDescripcion}
					<span class="ae-trigger__desc">{selectedDescripcion}</span>
				{/if}
			{:else}
				<span class="ae-trigger__placeholder">{placeholder}</span>
			{/if}
		</span>
		<span class="ae-trigger__icon" aria-hidden="true">Buscar</span>
	</button>

	{#if inputName}
		<input type="hidden" name={inputName} value={normalizedCodigo} {required} />
	{/if}

	{#if showError}
		<div class="ae-picker__error type-caption" role="alert">{errorText}</div>
	{:else if helperText}
		<div class="ae-picker__helper type-fine-print">{helperText}</div>
	{/if}
</div>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
<dialog bind:this={dialogEl} class="ae-dialog" onclick={onDialogClick}>
	<div class="ae-dialog__panel" role="document">
		<header class="ae-dialog__header">
			<h2 class="ae-dialog__title" id="ae-dialog-title">Buscar actividad económica</h2>
			<button type="button" class="ae-dialog__close" aria-label="Cerrar" onclick={closeModal}>×</button>
		</header>

		<div class="ae-dialog__body">
			<label class="ae-dialog-search">
				<span class="field-label">Buscar</span>
				<input
					bind:this={searchInputEl}
					type="search"
					class="field-input"
					placeholder="Código o descripción…"
					value={searchQuery}
					oninput={handleSearchInput}
					aria-labelledby="ae-dialog-title"
				/>
			</label>

			<div class="ae-modal-table" role="region" aria-label="Resultados actividad económica">
				<div class="ae-modal-head" aria-hidden="true">
					<span>Código</span>
					<span>Descripción</span>
				</div>

				<ul class="ae-modal-list">
					{#if searchResults.length === 0}
						<li class="ae-modal-empty">
							{searchQuery.trim() ? 'Sin resultados.' : 'Escriba para buscar en el catálogo.'}
						</li>
					{:else}
						{#each searchResults as entry (entry.codigo)}
							<li>
								<button
									type="button"
									class="ae-modal-row"
									class:ae-modal-row--selected={normalizeActividadEconomicaCodigo(entry.codigo) ===
										normalizedCodigo}
									onclick={() => selectEntry(entry)}
								>
									<span class="ae-modal-code"
										>{normalizeActividadEconomicaCodigo(entry.codigo)}</span
									>
									<span class="ae-modal-desc">{entry.descripcion}</span>
								</button>
							</li>
						{/each}
					{/if}
				</ul>
			</div>
		</div>
	</div>
</dialog>

<style>
	.ae-picker {
		display: flex;
		flex-direction: column;
		min-width: 0;
		width: 100%;
		gap: 0.35rem;
	}

	.ae-picker__label--error {
		color: var(--color-danger, #c0392b);
	}

	.ae-trigger {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		width: 100%;
		min-height: 2.625rem;
		padding: 0.5rem 0.75rem;
		text-align: left;
		cursor: pointer;
	}

	.ae-trigger:disabled {
		cursor: not-allowed;
		opacity: 0.65;
	}

	.ae-trigger--error {
		border-color: var(--color-danger, #c0392b);
	}

	.ae-trigger__body {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
		flex: 1;
	}

	.ae-trigger__code {
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.875rem;
		font-weight: 600;
	}

	.ae-trigger__desc,
	.ae-trigger__placeholder {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 0.75rem;
		color: var(--color-muted-foreground, #64748b);
	}

	.ae-trigger__icon {
		flex-shrink: 0;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-muted-foreground, #64748b);
	}

	.ae-picker__error {
		color: var(--color-danger, #c0392b);
	}

	.ae-picker__helper {
		color: var(--color-muted-foreground, #64748b);
	}

	.ae-dialog {
		margin: auto;
		padding: 0;
		border: none;
		max-width: min(42rem, calc(100vw - 2rem));
		width: 100%;
		background: transparent;
	}

	.ae-dialog::backdrop {
		background: rgb(15 23 42 / 45%);
	}

	.ae-dialog__panel {
		display: flex;
		flex-direction: column;
		max-height: min(85vh, 36rem);
		background: var(--color-card, #fff);
		color: var(--color-foreground, #0f172a);
		border: 1px solid var(--color-border, #e2e8f0);
		border-radius: 8px;
		box-shadow: 0 16px 48px rgb(15 23 42 / 18%);
		overflow: hidden;
	}

	.ae-dialog__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid var(--color-border, #e2e8f0);
	}

	.ae-dialog__title {
		margin: 0;
		font-size: 1.05rem;
		font-weight: 600;
	}

	.ae-dialog__close {
		border: none;
		background: transparent;
		font-size: 1.5rem;
		line-height: 1;
		cursor: pointer;
		color: var(--color-muted-foreground, #64748b);
		padding: 0.25rem;
	}

	.ae-dialog__body {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1rem 1.25rem 1.25rem;
		min-height: 0;
	}

	.ae-dialog-search {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.ae-modal-table {
		display: flex;
		flex-direction: column;
		min-height: 14rem;
		max-height: min(50vh, 24rem);
		overflow: hidden;
		border: 1px solid var(--color-border, #e2e8f0);
		border-radius: 6px;
	}

	.ae-modal-head {
		display: grid;
		grid-template-columns: 5.5rem minmax(0, 1fr);
		gap: 0.75rem;
		padding: 0.55rem 0.75rem;
		border-bottom: 1px solid var(--color-border, #e2e8f0);
		background: var(--color-muted, #f1f5f9);
		font-size: 0.6875rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-muted-foreground, #64748b);
	}

	.ae-modal-list {
		margin: 0;
		padding: 0;
		list-style: none;
		overflow: auto;
		flex: 1;
	}

	.ae-modal-empty {
		padding: 1.25rem 0.75rem;
		font-size: 0.875rem;
		color: var(--color-muted-foreground, #64748b);
		text-align: center;
	}

	.ae-modal-row {
		display: grid;
		grid-template-columns: 5.5rem minmax(0, 1fr);
		gap: 0.75rem;
		align-items: start;
		width: 100%;
		padding: 0.65rem 0.75rem;
		border: none;
		border-bottom: 1px solid var(--color-border, #e2e8f0);
		background: transparent;
		color: inherit;
		text-align: left;
		cursor: pointer;
		font: inherit;
	}

	.ae-modal-row:hover,
	.ae-modal-row--selected {
		background: color-mix(in srgb, var(--color-primary, #0f172a) 8%, transparent);
	}

	.ae-modal-code {
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.8125rem;
		font-weight: 600;
	}

	.ae-modal-desc {
		font-size: 0.875rem;
		line-height: 1.35;
		color: var(--color-muted-foreground, #64748b);
	}
</style>
