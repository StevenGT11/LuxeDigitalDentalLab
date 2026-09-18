<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto, invalidate } from '$app/navigation';
	import { navigating } from '$app/state';
	import InvoicePdfPreview from '$lib/components/lab/InvoicePdfPreview.svelte';
	import FeProcessingBanner from '$lib/components/fe/FeProcessingBanner.svelte';
	import {
		getInvoiceEstadoClass,
		getInvoiceEstadoLabel,
		getInvoiceRowClass,
		INVOICE_ESTADOS
	} from '$lib/lab/invoice-estado';
	import {
		feComprobanteCanConsultar,
		getFeComprobanteEstadoClass,
		getFeComprobanteEstadoLabel
	} from '$lib/fe/constants';
	import { formatCurrency, formatDate } from '$lib/lab/helpers';
	import { feRechazoSummaryLine, parseFeRechazoFromStored } from '$lib/fe/format-rechazo';
	import {
		INVOICE_LIST_PAGE_SIZES,
		type InvoiceListPageSize,
		type InvoiceListRow
	} from '$lib/lab/invoices-list';
	import type { InvoiceEstado } from '$lib/lab/types';

	let { data, form } = $props();

	let searchInput = $state('');
	let filtroEstado = $state<'todos' | InvoiceEstado>('todos');
	let searchDebounce: ReturnType<typeof setTimeout> | undefined;
	let reemittingFactura = $state(false);
	let emittingLabel = $state('');

	const totalPages = $derived(Math.max(1, Math.ceil(data.totalCount / data.pageSize)));
	const pageStart = $derived(
		data.totalCount === 0 ? 0 : (data.page - 1) * data.pageSize + 1
	);
	const pageEnd = $derived(Math.min(data.page * data.pageSize, data.totalCount));
	const isLoading = $derived(navigating.type !== null);

	$effect(() => {
		const q = data.q;
		const estado = data.estado;
		const searchFocused = document.activeElement?.classList.contains('facturas-toolbar__search');
		if (!searchFocused) searchInput = q;
		filtroEstado = estado;
	});

	function listHref(overrides: Partial<{
		page: number;
		pageSize: InvoiceListPageSize;
		q: string;
		estado: 'todos' | InvoiceEstado;
	}> = {}) {
		const p = new URLSearchParams();
		const page = overrides.page ?? data.page;
		const pageSize = overrides.pageSize ?? data.pageSize;
		const q = overrides.q ?? data.q;
		const estado = overrides.estado ?? data.estado;
		if (page > 1) p.set('page', String(page));
		if (pageSize !== 15) p.set('size', String(pageSize));
		if (q) p.set('q', q);
		if (estado !== 'todos') p.set('estado', estado);
		const qs = p.toString();
		return `/admin/facturas${qs ? `?${qs}` : ''}`;
	}

	function goList(
		overrides: Partial<{
			page: number;
			pageSize: InvoiceListPageSize;
			q: string;
			estado: 'todos' | InvoiceEstado;
		}> = {}
	) {
		void goto(listHref(overrides), { keepFocus: true, noScroll: true });
	}

	function onSearchInput() {
		clearTimeout(searchDebounce);
		searchDebounce = setTimeout(() => {
			goList({ q: searchInput.trim(), page: 1 });
		}, 350);
	}

	function onEstadoChange() {
		goList({ estado: filtroEstado, page: 1 });
	}

	function onPageSizeChange(event: Event) {
		const size = Number((event.currentTarget as HTMLSelectElement).value) as InvoiceListPageSize;
		goList({ pageSize: size, page: 1 });
	}

	let actionMessage = $derived(form?.message ?? '');
	let actionInvoiceId = $derived(form?.invoiceId ?? '');

	function feErrorSnippet(fe: InvoiceListRow['fe']): string | null {
		if (!fe?.ultimo_error?.trim()) return null;
		const formatted = parseFeRechazoFromStored(null, fe.ultimo_error);
		if (formatted) return feRechazoSummaryLine(formatted, 80);
		return fe.ultimo_error.slice(0, 80) + (fe.ultimo_error.length > 80 ? '…' : '');
	}

	let pdfPreviewOpen = $state(false);
	let pdfPreview = $state<{ id: string; number: string } | null>(null);

	function canReemitFacturaTrasNc(fac: InvoiceListRow): boolean {
		return Boolean(fac.fe?.estado === 'aceptado' && fac.reemit?.ncAceptada);
	}
</script>

<div class="dash-page">
	<p class="dash-lead">
		Facturación por caso y cliente — generadas al registrar cada caso.
		Comprobantes FE: <strong>{data.emitAmbiente === 'production' ? 'Producción' : 'Pruebas (staging)'}</strong>.
		<a href="/admin/factura-electronica" class="text-link">Cambiar ambiente</a>
	</p>

	{#if reemittingFactura}
		<FeProcessingBanner
			title="Reemitiendo factura"
			subtitle={emittingLabel}
			detail="Creando copia corregida con los mismos ítems…"
		/>
	{/if}

	{#if !data.facturadorOk && !reemittingFactura}
		<p class="fe-facturador-alert" role="alert">
			<strong>Facturador no disponible</strong> ({data.facturadorUrl}).
			{data.facturadorError ?? 'Verifique que @happy-prod/facturador esté instalado (npm install).'}
		</p>
	{/if}

	<div class="dash-toolbar facturas-toolbar">
		<input
			type="search"
			class="search-input facturas-toolbar__search"
			bind:value={searchInput}
			oninput={onSearchInput}
			placeholder="Buscar factura, cliente, caso, paciente o clave FE…"
			aria-label="Buscar facturas"
		/>
		<select
			class="field-select facturas-toolbar__estado"
			bind:value={filtroEstado}
			onchange={onEstadoChange}
		>
			<option value="todos">Todos los estados</option>
			{#each INVOICE_ESTADOS as e (e.value)}
				<option value={e.value}>{e.label}</option>
			{/each}
		</select>
		{#if !data.hasActiveEmisor}
			<span class="type-caption" style="color: var(--color-warning, #b8860b);">
				Emisor incompleto para {data.emitAmbiente === 'production' ? 'producción' : 'staging'}.
			</span>
		{/if}
	</div>

	{#if actionMessage}
		<div
			class="store-utility-card"
			style="margin-bottom: var(--spacing-md); border-color: {form?.success ? 'var(--color-success)' : 'var(--color-danger)'};"
			role="alert"
		>
			<p>{actionMessage}</p>
		</div>
	{/if}

	{#if isLoading && data.invoices.length === 0 && !reemittingFactura}
		<div class="store-utility-card empty-state">
			<p>Cargando facturas…</p>
		</div>
	{:else if data.totalCount === 0 && !data.q && data.estado === 'todos'}
		<div class="store-utility-card empty-state">
			<p>No hay facturas</p>
		</div>
	{:else if data.invoices.length === 0}
		<div class="store-utility-card empty-state">
			{#if data.q}
				<p>Ninguna factura coincide con «{data.q}»</p>
				<button type="button" class="btn-secondary-pill" onclick={() => goList({ q: '', page: 1 })}>
					Limpiar búsqueda
				</button>
			{:else}
				<p>No hay facturas con el estado de cobro seleccionado</p>
				<button type="button" class="btn-secondary-pill" onclick={() => goList({ estado: 'todos', page: 1 })}>
					Ver todas
				</button>
			{/if}
		</div>
	{:else}
		{#if data.q || data.estado !== 'todos'}
			<p class="type-caption facturas-results-hint">
				{data.totalCount} factura{data.totalCount === 1 ? '' : 's'}
				{#if data.q} — búsqueda «{data.q}»{/if}
			</p>
		{/if}
		<div
			class="data-table-wrap"
			class:fe-processing-blocked={isLoading || reemittingFactura}
		>
			<table class="data-table">
				<thead>
					<tr>
						<th>Factura</th>
						<th>Cliente</th>
						<th>Caso</th>
						<th>Total</th>
						<th>Cobro</th>
						<th>FE Hacienda</th>
						<th>Emisión</th>
						<th>Acciones FE</th>
						<th>Detalle</th>
					</tr>
				</thead>
				<tbody>
					{#each data.invoices as fac (fac.id)}
						{@const fe = fac.fe}
						<tr
							class={getInvoiceRowClass(fac.estado, fe?.estado)}
							class:fe-row-highlight={actionInvoiceId === fac.id && actionMessage}
						>
							<td class="type-body-strong">
								<a href="/admin/facturas/{fac.id}" class="text-link">{fac.invoice_number}</a>
							</td>
							<td>
								<a href="/admin/clientes/{fac.client_id}" class="text-link">{fac.client_name}</a>
								<br /><span class="type-fine-print">{fac.client_clinica}</span>
							</td>
							<td>
								<a href="/admin/casos/{fac.case_id}" class="text-link">{fac.case_number}</a>
								<br /><span class="type-fine-print">{fac.paciente_name}</span>
							</td>
							<td class="type-body-strong">{formatCurrency(fac.total)}</td>
							<td>
								<span class={getInvoiceEstadoClass(fac.estado, fe?.estado)}>
									{getInvoiceEstadoLabel(fac.estado)}
								</span>
							</td>
							<td>
								{#if fe}
									<span class={getFeComprobanteEstadoClass(fe.estado)}>
										{getFeComprobanteEstadoLabel(fe.estado)}
									</span>
									{#if fe.clave}
										<br /><span class="type-fine-print" title={fe.clave}>Clave …{fe.clave.slice(-8)}</span>
									{/if}
									{#if fe.ultimo_error}
										{@const errLine = feErrorSnippet(fe)}
										{#if errLine}
											<br /><span class="type-fine-print" style="color: var(--color-danger);">{errLine}</span>
										{/if}
									{/if}
								{:else}
									<span class="type-caption">Sin enviar</span>
								{/if}
							</td>
							<td class="type-caption">{formatDate(fac.fecha_emision)}</td>
							<td class="fe-actions">
								<form
									method="POST"
									action="?/updateEstado"
									class="fe-actions__estado-form"
									use:enhance={() =>
										async ({ update }) => {
											await update({ reset: false });
											await invalidate('app:facturas-list');
										}}
								>
									<input type="hidden" name="invoice_id" value={fac.id} />
									<select
										class="field-select fe-actions__select"
										name="estado"
										value={fac.estado}
										onchange={(e) => e.currentTarget.form?.requestSubmit()}
										aria-label="Estado de cobro"
									>
										{#each INVOICE_ESTADOS as e (e.value)}
											<option value={e.value}>{e.label}</option>
										{/each}
									</select>
								</form>
								{#if fe && feComprobanteCanConsultar(fe.estado) && fe.clave}
									<form
										method="POST"
										action="?/consultar"
										use:enhance={() =>
											async ({ update }) => {
												await update({ reset: false });
												await invalidate('app:facturas-list');
											}}
									>
										<input type="hidden" name="invoice_id" value={fac.id} />
										<button type="submit" class="btn-secondary-pill fe-actions__btn">Consultar</button>
									</form>
								{/if}
								{#if canReemitFacturaTrasNc(fac)}
									{#if fac.reemit?.correctionInvoiceId}
										<a
											href="/admin/facturas/{fac.reemit.correctionInvoiceId}"
											class="btn-secondary-pill fe-actions__btn"
										>
											FE corregida
										</a>
									{:else}
										<form
											method="POST"
											action="?/crearFacturaCorreccion"
											use:enhance={() => {
												emittingLabel = fac.invoice_number;
												reemittingFactura = true;
												return async ({ result, update }) => {
													try {
														await update({ reset: false });
														if (result.type === 'success') {
															const payload = result.data as Record<string, unknown> | undefined;
															const redirectTo =
																typeof payload?.redirectTo === 'string' ? payload.redirectTo : null;
															if (redirectTo) {
																await goto(redirectTo);
																return;
															}
														}
														await invalidate('app:facturas-list');
													} finally {
														reemittingFactura = false;
														emittingLabel = '';
													}
												};
											}}
										>
											<input type="hidden" name="invoice_id" value={fac.id} />
											<button type="submit" class="btn-secondary-pill fe-actions__btn">
												Reemitir factura
											</button>
										</form>
									{/if}
								{/if}
							</td>
							<td>
								<button
									type="button"
									class="btn-secondary-pill fe-actions__btn"
									onclick={() => {
										pdfPreview = { id: fac.id, number: fac.invoice_number };
										pdfPreviewOpen = true;
									}}
								>
									PDF
								</button>
								<a href="/admin/facturas/{fac.id}" class="btn-secondary-pill fe-actions__btn">Ver</a>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<nav
			class="facturas-pagination"
			class:fe-processing-blocked={isLoading || reemittingFactura}
			aria-label="Paginación de facturas"
		>
			<p class="type-caption facturas-pagination__summary">
				Mostrando {pageStart}–{pageEnd} de {data.totalCount}
			</p>
			<div class="facturas-pagination__controls">
				<label class="facturas-pagination__size type-caption">
					Por página
					<select
						class="field-select facturas-pagination__size-select"
						value={data.pageSize}
						onchange={onPageSizeChange}
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
						disabled={data.page <= 1 || isLoading}
						onclick={() => goList({ page: data.page - 1 })}
					>
						Anterior
					</button>
					<span class="type-caption facturas-pagination__page">
						Página {data.page} de {totalPages}
					</span>
					<button
						type="button"
						class="btn-secondary-pill"
						disabled={data.page >= totalPages || isLoading}
						onclick={() => goList({ page: data.page + 1 })}
					>
						Siguiente
					</button>
				{/if}
			</div>
		</nav>
	{/if}

	<InvoicePdfPreview
		bind:open={pdfPreviewOpen}
		invoiceId={pdfPreview?.id ?? ''}
		invoiceNumber={pdfPreview?.number ?? ''}
	/>
</div>

<style>
	.facturas-toolbar {
		flex-wrap: wrap;
		gap: var(--spacing-md);
		align-items: center;
	}

	.facturas-toolbar__search {
		flex: 1 1 16rem;
		min-width: 12rem;
	}

	.facturas-toolbar__estado {
		width: auto;
		flex: 0 0 auto;
	}

	.facturas-results-hint {
		margin: 0 0 var(--spacing-sm);
	}

	.facturas-pagination {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-md);
		margin-top: var(--spacing-md);
		padding-top: var(--spacing-md);
		border-top: 1px solid var(--color-border, #e2e8f0);
	}

	.facturas-pagination__controls {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.facturas-pagination__page {
		min-width: 6.5rem;
		text-align: center;
	}

	.facturas-pagination__size {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}

	.facturas-pagination__size-select {
		width: auto;
		padding: 4px 8px;
		font-size: 12px;
	}

	.fe-facturador-alert {
		margin: 0 0 var(--spacing-lg);
		padding: 0.75rem 1rem;
		border-radius: 6px;
		font-size: 0.875rem;
		line-height: 1.45;
		background: color-mix(in srgb, var(--color-danger) 10%, transparent);
		color: var(--color-danger, #c0392b);
		border: 1px solid color-mix(in srgb, var(--color-danger) 25%, transparent);
	}

	.fe-actions {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 6px;
		min-width: 140px;
	}
	.fe-actions__estado-form {
		width: 100%;
		margin: 0;
	}

	.fe-actions__select {
		width: 100%;
		min-width: 120px;
		padding: 6px 10px;
		font-size: 13px;
	}
	.fe-actions__btn {
		font-size: 13px;
		padding: 6px 12px;
		white-space: nowrap;
	}
	.fe-row-highlight {
		background: color-mix(in srgb, var(--color-accent) 8%, transparent);
	}
</style>
