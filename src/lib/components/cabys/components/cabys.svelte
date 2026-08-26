<script lang="ts">
	import type { CabysCatalogEntry } from '$lib/cabys';
	import { cabysImpuestoLabel, normalizeCabys, normalizeCabysSearchText } from '$lib/cabys';

	interface Props {
		codigo?: string;
		inputName?: string;
		label?: string;
		placeholder?: string;
		required?: boolean;
		disabled?: boolean;
		errorText?: string;
		searchUrl?: string;
		limit?: number;
		onSelect?: (entry: CabysCatalogEntry, source: 'user' | 'hydrate') => void;
	}

	let {
		codigo = $bindable(''),
		inputName,
		label = 'Código CABYS',
		placeholder = 'Buscar por código o descripción…',
		required = false,
		disabled = false,
		errorText = '',
		searchUrl = '/api/cabys/search',
		limit = 25,
		onSelect
	}: Props = $props();

	let dialogEl = $state<HTMLDialogElement | null>(null);
	let searchQuery = $state('');
	let searchResults = $state<CabysCatalogEntry[]>([]);
	let searchLoading = $state(false);
	let searchError = $state('');
	let selectedProducto = $state('');
	let searchInputEl = $state<HTMLInputElement | null>(null);
	let debounceTimeout: ReturnType<typeof setTimeout> | undefined;
	let hydrateSeq = 0;
	let lastHydratedCode = $state('');

	const showError = $derived(Boolean(errorText));
	const normalizedCodigo = $derived(normalizeCabys(codigo));

	function applyEntry(entry: CabysCatalogEntry, source: 'user' | 'hydrate') {
		const code = normalizeCabys(entry.codigo);
		codigo = code;
		selectedProducto = entry.producto ?? '';
		lastHydratedCode = code;
		onSelect?.(entry, source);
	}

	async function fetchCabys(query: string): Promise<CabysCatalogEntry[]> {
		const params = new URLSearchParams({ q: query, limit: String(limit) });
		const response = await fetch(`${searchUrl}?${params}`, { credentials: 'include' });
		if (response.status === 401) {
			searchError = 'Debe iniciar sesión para buscar en el catálogo CABYS.';
			return [];
		}
		if (!response.ok) {
			searchError = 'No se pudo buscar en el catálogo. Intente de nuevo.';
			return [];
		}
		searchError = '';
		const data = (await response.json()) as { cabys?: CabysCatalogEntry[] };
		return data.cabys ?? [];
	}

	async function runSearch(query: string) {
		const trimmed = query.trim();
		if (!trimmed) {
			searchResults = [];
			searchError = '';
			searchLoading = false;
			return;
		}

		const codeQ = normalizeCabys(trimmed);
		const isCodeSearch = /^\d{3,}$/.test(codeQ);
		const textNorm = normalizeCabysSearchText(trimmed).replace(/\s+/g, '');

		if (!isCodeSearch && textNorm.length < 2) {
			searchResults = [];
			searchError = 'Escriba al menos 2 letras o 3 dígitos del código.';
			return;
		}

		searchLoading = true;
		searchError = '';
		try {
			searchResults = await fetchCabys(trimmed);
		} finally {
			searchLoading = false;
		}
	}

	function scheduleSearch(query: string) {
		clearTimeout(debounceTimeout);
		debounceTimeout = setTimeout(() => void runSearch(query), 200);
	}

	function openModal() {
		if (disabled) return;
		searchQuery = '';
		searchResults = [];
		searchError = '';
		dialogEl?.showModal();
		requestAnimationFrame(() => {
			searchInputEl?.focus();
		});
	}

	function closeModal() {
		dialogEl?.close();
	}

	function handleSearchInput(event: Event) {
		searchQuery = (event.currentTarget as HTMLInputElement).value;
		scheduleSearch(searchQuery);
	}

	function selectEntry(entry: CabysCatalogEntry) {
		applyEntry(entry, 'user');
		closeModal();
	}

	async function hydrateCodigo(code: string) {
		if (code.length !== 13) return;
		const seq = ++hydrateSeq;
		try {
			const results = await fetchCabys(code);
			if (seq !== hydrateSeq) return;
			const exact = results.find((entry) => normalizeCabys(entry.codigo) === code);
			if (!exact) return;
			applyEntry(exact, 'hydrate');
		} catch {
			/* best-effort */
		}
	}

	function onDialogClick(event: MouseEvent) {
		if (event.target === dialogEl) closeModal();
	}

	$effect(() => {
		const code = normalizedCodigo;
		if (!code) {
			lastHydratedCode = '';
			selectedProducto = '';
			return;
		}
		if (code.length !== 13) return;
		if (code === lastHydratedCode && selectedProducto) return;
		void hydrateCodigo(code);
	});
</script>

<div class="cabys-picker">
	{#if label}
		<span class="field-label cabys-picker__label" class:cabys-picker__label--error={showError}>
			{label}{#if required}<span aria-hidden="true"> *</span>{/if}
		</span>
	{/if}

	<button
		type="button"
		class="cabys-trigger field-input"
		class:cabys-trigger--error={showError}
		{disabled}
		aria-haspopup="dialog"
		onclick={openModal}
	>
		<span class="cabys-trigger__body">
			{#if normalizedCodigo}
				<span class="cabys-trigger__code">{normalizedCodigo}</span>
				{#if selectedProducto}
					<span class="cabys-trigger__desc">{selectedProducto}</span>
				{/if}
			{:else}
				<span class="cabys-trigger__placeholder">{placeholder}</span>
			{/if}
		</span>
		<span class="cabys-trigger__icon" aria-hidden="true">Buscar</span>
	</button>

	{#if inputName}
		<input type="hidden" name={inputName} value={normalizedCodigo} {required} />
	{/if}

	{#if showError}
		<div class="cabys-picker__error type-caption" role="alert">{errorText}</div>
	{/if}
</div>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
<dialog bind:this={dialogEl} class="cabys-dialog" onclick={onDialogClick}>
	<div class="cabys-dialog__panel">
		<header class="cabys-dialog__header">
			<h2 class="cabys-dialog__title" id="cabys-dialog-title">Buscar código CABYS</h2>
			<button type="button" class="cabys-dialog__close" aria-label="Cerrar" onclick={closeModal}>×</button>
		</header>

		<div class="cabys-dialog__body">
			<label class="cabys-dialog-search">
				<span class="field-label">Buscar</span>
				<input
					bind:this={searchInputEl}
					type="search"
					class="field-input"
					placeholder="Código o descripción del producto…"
					value={searchQuery}
					oninput={handleSearchInput}
				/>
			</label>

			<div class="cabys-modal-table" role="region" aria-label="Resultados CABYS">
				<div class="cabys-modal-head" aria-hidden="true">
					<span>Producto</span>
					<span>Clasificación</span>
					<span>Impuesto</span>
				</div>

				<ul class="cabys-modal-list">
					{#if searchLoading}
						<li class="cabys-modal-empty">Buscando…</li>
					{:else if searchError}
						<li class="cabys-modal-empty cabys-modal-empty--error" role="alert">{searchError}</li>
					{:else if searchResults.length === 0}
						<li class="cabys-modal-empty">
							{searchQuery.trim()
								? 'Sin resultados. Pruebe otras palabras (con o sin tildes) o parte del código CABYS.'
								: 'Escriba descripción del producto o servicio, o al menos 3 dígitos del código.'}
						</li>
					{:else}
						{#each searchResults as entry (entry.codigo)}
							<li>
								<button
									type="button"
									class="cabys-modal-row"
									class:cabys-modal-row--selected={normalizeCabys(entry.codigo) ===
										normalizedCodigo}
									onclick={() => selectEntry(entry)}
								>
									<div class="cabys-modal-col cabys-modal-col--producto">
										<span class="cabys-modal-code">{normalizeCabys(entry.codigo)}</span>
										<span class="cabys-modal-producto">{entry.producto}</span>
									</div>
									<div class="cabys-modal-col cabys-modal-col--clasificacion">
										{entry.clasificacion || '—'}
									</div>
									<div class="cabys-modal-col cabys-modal-col--impuesto">
										{entry.impuesto?.trim() ? cabysImpuestoLabel(entry.impuesto) : '—'}
									</div>
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
	.cabys-picker {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		min-width: 0;
		width: 100%;
	}

	.cabys-picker__label--error {
		color: var(--color-danger, #c0392b);
	}

	.cabys-trigger {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		width: 100%;
		min-height: 2.625rem;
		padding: 0.5rem 0.75rem;
		text-align: left;
		cursor: pointer;
	}

	.cabys-trigger:disabled {
		cursor: not-allowed;
		opacity: 0.65;
	}

	.cabys-trigger--error {
		border-color: var(--color-danger, #c0392b);
	}

	.cabys-trigger__body {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
		flex: 1;
	}

	.cabys-trigger__code {
		font-size: 0.8125rem;
		font-variant-numeric: tabular-nums;
		color: var(--color-muted-foreground, #64748b);
	}

	.cabys-trigger__desc,
	.cabys-trigger__placeholder {
		font-size: 0.875rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.cabys-trigger__placeholder {
		color: var(--color-muted-foreground, #64748b);
	}

	.cabys-trigger__icon {
		flex-shrink: 0;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-muted-foreground, #64748b);
	}

	.cabys-picker__error {
		color: var(--color-danger, #c0392b);
	}

	.cabys-dialog {
		margin: auto;
		padding: 0;
		border: none;
		max-width: min(52rem, calc(100vw - 2rem));
		width: 100%;
		background: transparent;
	}

	.cabys-dialog::backdrop {
		background: rgb(15 23 42 / 45%);
	}

	.cabys-dialog__panel {
		display: flex;
		flex-direction: column;
		max-height: min(90vh, 40rem);
		background: var(--color-card, #fff);
		border: 1px solid var(--color-border, #e2e8f0);
		border-radius: 8px;
		overflow: hidden;
		box-shadow: 0 16px 48px rgb(15 23 42 / 18%);
	}

	.cabys-dialog__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid var(--color-border, #e2e8f0);
	}

	.cabys-dialog__title {
		margin: 0;
		font-size: 1.05rem;
		font-weight: 600;
	}

	.cabys-dialog__close {
		border: none;
		background: transparent;
		font-size: 1.5rem;
		line-height: 1;
		cursor: pointer;
		color: var(--color-muted-foreground, #64748b);
	}

	.cabys-dialog__body {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1rem 1.25rem 1.25rem;
		min-height: 0;
	}

	.cabys-dialog-search {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.cabys-modal-table {
		display: flex;
		flex-direction: column;
		min-height: 14rem;
		max-height: min(55vh, 28rem);
		overflow: hidden;
		border: 1px solid var(--color-border, #e2e8f0);
		border-radius: 6px;
	}

	.cabys-modal-head {
		display: grid;
		grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr) minmax(5rem, 0.5fr);
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

	.cabys-modal-list {
		margin: 0;
		padding: 0;
		list-style: none;
		overflow: auto;
		flex: 1;
	}

	.cabys-modal-empty {
		padding: 1.25rem 0.75rem;
		font-size: 0.875rem;
		color: var(--color-muted-foreground, #64748b);
		text-align: center;
	}

	.cabys-modal-empty--error {
		color: var(--color-danger, #c0392b);
	}

	.cabys-modal-row {
		display: grid;
		grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr) minmax(5rem, 0.5fr);
		gap: 0.75rem;
		width: 100%;
		padding: 0.65rem 0.75rem;
		text-align: left;
		border: none;
		border-bottom: 1px solid var(--color-border, #e2e8f0);
		background: transparent;
		cursor: pointer;
		font: inherit;
		color: inherit;
	}

	.cabys-modal-row:hover,
	.cabys-modal-row--selected {
		background: color-mix(in srgb, var(--color-primary, #0f172a) 8%, transparent);
	}

	.cabys-modal-code {
		display: block;
		margin-bottom: 0.2rem;
		font-size: 0.8125rem;
		font-variant-numeric: tabular-nums;
	}

	.cabys-modal-producto {
		display: block;
		font-size: 0.875rem;
		line-height: 1.4;
		overflow-wrap: anywhere;
	}

	.cabys-modal-col--clasificacion,
	.cabys-modal-col--impuesto {
		font-size: 0.8125rem;
		line-height: 1.4;
		color: var(--color-muted-foreground, #64748b);
		overflow-wrap: anywhere;
	}

	@media (max-width: 640px) {
		.cabys-modal-head,
		.cabys-modal-row {
			grid-template-columns: 1fr;
		}
	}
</style>
