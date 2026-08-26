<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { navigating } from '$app/state';
	import { tick } from 'svelte';
	import FeMediosPagoModal from '$lib/components/fe/FeMediosPagoModal.svelte';
	import type { FeMedioPagoItem } from '$lib/fe/medios-pago';
	import {
		getInvoiceEstadoClass,
		getInvoiceEstadoLabel,
		INVOICE_ESTADOS
	} from '$lib/lab/constants';
	import {
		feComprobanteBlocksEmit,
		feComprobanteCanReemit,
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
	import { updateInvoiceStatus } from '$lib/lab/store';
	import type { InvoiceEstado } from '$lib/lab/types';
	import type { FeComprobanteSummary } from '$lib/fe/types';

	let { data, form } = $props();

	let searchInput = $state('');
	let filtroEstado = $state<'todos' | InvoiceEstado>('todos');
	let searchDebounce: ReturnType<typeof setTimeout> | undefined;
	let emittingFe = $state(false);
	let emittingLabel = $state('');

	const totalPages = $derived(Math.max(1, Math.ceil(data.totalCount / data.pageSize)));
	const pageStart = $derived(
		data.totalCount === 0 ? 0 : (data.page - 1) * data.pageSize + 1
	);
	const pageEnd = $derived(Math.min(data.page * data.pageSize, data.totalCount));
	const isLoading = $derived(navigating.type !== null);

	$effect(() => {
		searchInput = data.q;
		filtroEstado = data.estado;
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

	async function cambiarEstado(id: string, estado: string) {
		await updateInvoiceStatus(id, estado as InvoiceEstado);
		await invalidateAll();
	}

	let actionMessage = $derived(form?.message ?? '');
	let actionInvoiceId = $derived(form?.invoiceId ?? '');

	function feErrorSnippet(fe: FeComprobanteSummary | undefined): string | null {
		if (!fe?.ultimo_error?.trim()) return null;
		const formatted = parseFeRechazoFromStored(null, fe.ultimo_error);
		if (formatted) return feRechazoSummaryLine(formatted, 80);
		return fe.ultimo_error.slice(0, 80) + (fe.ultimo_error.length > 80 ? '…' : '');
	}

	let emitModalOpen = $state(false);
	let emitTarget = $state<{ id: string; label: string; total: number } | null>(null);
	let emitFormEl = $state<HTMLFormElement | null>(null);
	let mediosPagoJson = $state('');

	function openEmitModal(fac: InvoiceListRow) {
		emitTarget = { id: fac.id, label: fac.invoice_number, total: fac.total };
		mediosPagoJson = '';
		emitModalOpen = true;
	}

	async function onMediosConfirm(medios: FeMedioPagoItem[]) {
		mediosPagoJson = JSON.stringify(medios);
		emittingLabel = emitTarget?.label ?? '';
		emitModalOpen = false;
		emittingFe = true;
		await tick();
		emitFormEl?.requestSubmit();
	}
</script>

{#if emittingFe}
	<div class="fe-emit-overlay" role="alertdialog" aria-modal="true" aria-busy="true" aria-live="polite">
		<div class="fe-emit-overlay__panel">
			<div class="fe-emit-overlay__spinner" aria-hidden="true"></div>
			<p class="fe-emit-overlay__title">Generando factura electrónica</p>
			{#if emittingLabel}
				<p class="type-caption fe-emit-overlay__subtitle">{emittingLabel}</p>
			{/if}
			<p class="type-caption">Firmando XML y enviando a Hacienda…</p>
		</div>
	</div>
{/if}

<div class="dash-page">
	<p class="dash-lead">Facturación por caso y cliente — generadas al registrar cada caso.</p>

	{#if !data.facturadorOk}
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
				Emisor incompleto para {data.emitAmbiente === 'production' ? 'producción' : 'staging'} — revise
				<a href="/admin/factura-electronica" class="text-link">configuración</a>.
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

	{#if isLoading && data.invoices.length === 0}
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
		<div class="data-table-wrap" class:facturas-table-loading={isLoading}>
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
						{@const fe = data.feByInvoice[fac.id]}
						<tr class:fe-row-highlight={actionInvoiceId === fac.id && actionMessage}>
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
								<span class={getInvoiceEstadoClass(fac.estado)}>
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
								<select
									class="field-select fe-actions__select"
									value={fac.estado}
									onchange={(e) => cambiarEstado(fac.id, e.currentTarget.value)}
									aria-label="Estado de cobro"
								>
									{#each INVOICE_ESTADOS as e (e.value)}
										<option value={e.value}>{e.label}</option>
									{/each}
								</select>
								{#if data.hasActiveEmisor && data.facturadorOk && !feComprobanteBlocksEmit(fe?.estado)}
									<button
										type="button"
										class="btn-primary fe-actions__btn"
										onclick={() => openEmitModal(fac)}
									>
										{fe && feComprobanteCanReemit(fe.estado) ? 'Reemitir FE' : 'Generar factura'}
									</button>
								{/if}
								{#if fe && feComprobanteCanConsultar(fe.estado) && fe.clave}
									<form
										method="POST"
										action="?/consultar"
										use:enhance={() =>
											async ({ update }) => {
												await update();
												await invalidateAll();
											}}
									>
										<input type="hidden" name="invoice_id" value={fac.id} />
										<button type="submit" class="btn-secondary-pill fe-actions__btn">Consultar</button>
									</form>
								{/if}
							</td>
							<td>
								<a href="/admin/facturas/{fac.id}" class="btn-secondary-pill fe-actions__btn">Ver</a>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<nav class="facturas-pagination" aria-label="Paginación de facturas">
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

	<form
		bind:this={emitFormEl}
		method="POST"
		action="?/emitir"
		class="fe-emit-form-hidden"
		aria-hidden="true"
		use:enhance={() => {
			emittingFe = true;
			return async ({ update }) => {
				try {
					await update();
					await invalidateAll();
				} finally {
					emittingFe = false;
					emittingLabel = '';
					emitTarget = null;
				}
			};
		}}
	>
		<input type="hidden" name="invoice_id" value={emitTarget?.id ?? ''} />
		<input type="hidden" name="medios_pago" value={mediosPagoJson} />
	</form>

	<FeMediosPagoModal
		bind:open={emitModalOpen}
		total={emitTarget?.total ?? 0}
		subtitle={emitTarget ? `Factura ${emitTarget.label}` : ''}
		onCancel={() => {
			emitTarget = null;
		}}
		onConfirm={onMediosConfirm}
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

	.facturas-table-loading {
		opacity: 0.55;
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

	.fe-emit-overlay {
		position: fixed;
		inset: 0;
		z-index: 2000;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgb(15 23 42 / 55%);
		backdrop-filter: blur(2px);
	}

	.fe-emit-overlay__panel {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.65rem;
		padding: 1.75rem 2rem;
		min-width: min(20rem, calc(100vw - 2rem));
		border-radius: 10px;
		background: var(--color-card, #fff);
		border: 1px solid var(--color-border, #e2e8f0);
		box-shadow: 0 20px 48px rgb(15 23 42 / 25%);
		text-align: center;
	}

	.fe-emit-overlay__title {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
	}

	.fe-emit-overlay__subtitle {
		margin: 0;
		font-weight: 500;
	}

	.fe-emit-overlay__spinner {
		width: 2.25rem;
		height: 2.25rem;
		border: 3px solid color-mix(in srgb, var(--color-border, #cbd5e1) 60%, transparent);
		border-top-color: var(--color-primary, #0f172a);
		border-radius: 50%;
		animation: fe-emit-spin 0.75s linear infinite;
	}

	@keyframes fe-emit-spin {
		to {
			transform: rotate(360deg);
		}
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
	.fe-emit-form-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
