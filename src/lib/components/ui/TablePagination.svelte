<script lang="ts">
	import { INVOICE_LIST_PAGE_SIZES, type InvoiceListPageSize } from '$lib/lab/invoices-list';

	let {
		page,
		pageSize,
		totalCount,
		disabled = false,
		ariaLabel = 'Paginación',
		onPageChange,
		onPageSizeChange
	}: {
		page: number;
		pageSize: InvoiceListPageSize;
		totalCount: number;
		disabled?: boolean;
		ariaLabel?: string;
		onPageChange: (page: number) => void;
		onPageSizeChange: (pageSize: InvoiceListPageSize) => void;
	} = $props();

	const totalPages = $derived(Math.max(1, Math.ceil(totalCount / pageSize)));
	const pageStart = $derived(totalCount === 0 ? 0 : (page - 1) * pageSize + 1);
	const pageEnd = $derived(Math.min(page * pageSize, totalCount));

	function handlePageSizeChange(event: Event) {
		const size = Number((event.currentTarget as HTMLSelectElement).value) as InvoiceListPageSize;
		onPageSizeChange(size);
	}
</script>

{#if totalCount > 0}
	<nav class="table-pagination" class:table-pagination--disabled={disabled} aria-label={ariaLabel}>
		<p class="type-caption table-pagination__summary">
			Mostrando {pageStart}–{pageEnd} de {totalCount}
		</p>
		<div class="table-pagination__controls">
			<label class="table-pagination__size type-caption">
				Por página
				<select
					class="field-select table-pagination__size-select"
					value={pageSize}
					disabled={disabled}
					onchange={handlePageSizeChange}
				>
					{#each INVOICE_LIST_PAGE_SIZES as size (size)}
						<option value={size}>{size}</option>
					{/each}
				</select>
			</label>
			{#if totalPages > 1}
				<button
					type="button"
					class="btn-secondary-pill"
					disabled={disabled || page <= 1}
					onclick={() => onPageChange(page - 1)}
				>
					Anterior
				</button>
				<span class="type-caption table-pagination__page">
					Página {page} de {totalPages}
				</span>
				<button
					type="button"
					class="btn-secondary-pill"
					disabled={disabled || page >= totalPages}
					onclick={() => onPageChange(page + 1)}
				>
					Siguiente
				</button>
			{/if}
		</div>
	</nav>
{/if}

<style>
	.table-pagination {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-md);
		margin-top: var(--spacing-md);
		padding-top: var(--spacing-md);
		border-top: 1px solid var(--color-border, #e2e8f0);
	}

	.table-pagination--disabled {
		opacity: 0.65;
		pointer-events: none;
	}

	.table-pagination__controls {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.table-pagination__page {
		min-width: 6.5rem;
		text-align: center;
	}

	.table-pagination__size {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}

	.table-pagination__size-select {
		width: auto;
		padding: 4px 8px;
		font-size: 12px;
	}
</style>
