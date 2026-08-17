<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { afterNavigate } from '$app/navigation';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { tick } from 'svelte';
	import FeMediosPagoModal from '$lib/components/fe/FeMediosPagoModal.svelte';
	import type { FeMedioPagoItem } from '$lib/fe/medios-pago';
	import {
		getAllInvoices,
		hydrateInvoicesOnce,
		initializeLabStorage,
		updateInvoiceStatus
	} from '$lib/lab/store';
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
	import type { FeComprobanteSummary } from '$lib/fe/types';
	import type { Invoice, InvoiceEstado } from '$lib/lab/types';

	const PAGE_SIZE = 15;

	let { data, form } = $props();

	let facturas = $state<Invoice[]>([]);
	let filtroEstado = $state<'todos' | InvoiceEstado>('todos');
	let searchQuery = $state('');
	let currentPage = $state(1);
	let feByInvoice = $state<Record<string, FeComprobanteSummary>>({});

	const searchFiltered = $derived.by(() => {
		let list =
			filtroEstado === 'todos' ? facturas : facturas.filter((f) => f.estado === filtroEstado);
		const q = searchQuery.trim().toLowerCase();
		if (q) {
			list = list.filter((f) => {
				const fe = feByInvoice[f.id];
				return (
					f.invoice_number.toLowerCase().includes(q) ||
					f.client_name.toLowerCase().includes(q) ||
					f.client_clinica.toLowerCase().includes(q) ||
					f.case_number.toLowerCase().includes(q) ||
					f.paciente_name.toLowerCase().includes(q) ||
					getInvoiceEstadoLabel(f.estado).toLowerCase().includes(q) ||
					(fe && getFeComprobanteEstadoLabel(fe.estado).toLowerCase().includes(q)) ||
					(fe?.clave?.toLowerCase().includes(q) ?? false)
				);
			});
		}
		return [...list].sort(
			(a, b) => new Date(b.fecha_emision).getTime() - new Date(a.fecha_emision).getTime()
		);
	});

	const totalPages = $derived(Math.max(1, Math.ceil(searchFiltered.length / PAGE_SIZE)));
	const safePage = $derived(Math.min(Math.max(1, currentPage), totalPages));
	const pageStart = $derived(searchFiltered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1);
	const pageEnd = $derived(Math.min(safePage * PAGE_SIZE, searchFiltered.length));
	const paginated = $derived(
		searchFiltered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
	);

	$effect(() => {
		searchQuery;
		filtroEstado;
		currentPage = 1;
	});

	async function refresh() {
		if (!browser) return;
		initializeLabStorage();
		await hydrateInvoicesOnce();
		facturas = getAllInvoices();
		feByInvoice = { ...data.feByInvoice };
	}

	onMount(() => void refresh());

	afterNavigate(() => void refresh());

	$effect(() => {
		feByInvoice = { ...data.feByInvoice };
	});

	async function cambiarEstado(id: string, estado: string) {
		await updateInvoiceStatus(id, estado as InvoiceEstado);
		facturas = getAllInvoices();
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

	function openEmitModal(fac: Invoice) {
		emitTarget = { id: fac.id, label: fac.invoice_number, total: fac.total };
		mediosPagoJson = '';
		emitModalOpen = true;
	}

	async function onMediosConfirm(medios: FeMedioPagoItem[]) {
		mediosPagoJson = JSON.stringify(medios);
		emitModalOpen = false;
		await tick();
		emitFormEl?.requestSubmit();
	}
</script>

<div class="dash-page">
	<p class="dash-lead">Facturación por caso y cliente — generadas al registrar cada caso.</p>

	{#if !data.facturadorOk}
		<p class="fe-facturador-alert" role="alert">
			<strong>Facturador no disponible</strong> en <code>{data.facturadorUrl}</code>.
			{data.facturadorError ?? 'Inicie el servicio Facturador y verifique FACTURADOR_URL en .env.'}
			Guía: <code>INTEGRATION_GUIDE.md</code> en este repositorio.
		</p>
	{/if}

	<div class="dash-toolbar facturas-toolbar">
		<input
			type="search"
			class="search-input facturas-toolbar__search"
			bind:value={searchQuery}
			placeholder="Buscar factura, cliente, caso, paciente o clave FE…"
			aria-label="Buscar facturas"
		/>
		<select class="field-select facturas-toolbar__estado" bind:value={filtroEstado}>
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

	{#if facturas.length === 0}
		<div class="store-utility-card empty-state">
			<p>No hay facturas</p>
		</div>
	{:else if searchFiltered.length === 0}
		<div class="store-utility-card empty-state">
			{#if searchQuery.trim()}
				<p>Ninguna factura coincide con «{searchQuery.trim()}»</p>
				<button type="button" class="btn-secondary-pill" onclick={() => (searchQuery = '')}>
					Limpiar búsqueda
				</button>
			{:else}
				<p>No hay facturas con el estado de cobro seleccionado</p>
				<button type="button" class="btn-secondary-pill" onclick={() => (filtroEstado = 'todos')}>
					Ver todas
				</button>
			{/if}
		</div>
	{:else}
		{#if searchQuery.trim() || filtroEstado !== 'todos'}
			<p class="type-caption facturas-results-hint">
				{searchFiltered.length} factura{searchFiltered.length === 1 ? '' : 's'}
				{#if searchQuery.trim()} — búsqueda «{searchQuery.trim()}»{/if}
			</p>
		{/if}
		<div class="data-table-wrap">
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
					{#each paginated as fac (fac.id)}
						{@const fe = feByInvoice[fac.id]}
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

		{#if totalPages > 1}
			<nav class="facturas-pagination" aria-label="Paginación de facturas">
				<p class="type-caption facturas-pagination__summary">
					Mostrando {pageStart}–{pageEnd} de {searchFiltered.length}
				</p>
				<div class="facturas-pagination__controls">
					<button
						type="button"
						class="btn-secondary-pill"
						disabled={safePage <= 1}
						onclick={() => (currentPage = safePage - 1)}
					>
						Anterior
					</button>
					<span class="type-caption facturas-pagination__page">
						Página {safePage} de {totalPages}
					</span>
					<button
						type="button"
						class="btn-secondary-pill"
						disabled={safePage >= totalPages}
						onclick={() => (currentPage = safePage + 1)}
					>
						Siguiente
					</button>
				</div>
			</nav>
		{/if}
	{/if}

	<form
		bind:this={emitFormEl}
		method="POST"
		action="?/emitir"
		class="fe-emit-form-hidden"
		aria-hidden="true"
		use:enhance={() =>
			async ({ update }) => {
				await update();
				await invalidateAll();
				emitTarget = null;
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
