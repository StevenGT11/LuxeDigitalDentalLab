<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto, invalidate, afterNavigate } from '$app/navigation';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { get } from 'svelte/store';
	import { onMount, tick } from 'svelte';
	import { Trash2 } from '@lucide/svelte';
	import { canManageClients, canViewFinancial } from '$lib/auth/roles';
	import AdminClientDoctorsEditor from '$lib/components/admin/AdminClientDoctorsEditor.svelte';
	import AdminClientFiscalEditor from '$lib/components/admin/AdminClientFiscalEditor.svelte';
	import AdminClientCredentialsEditor from '$lib/components/admin/AdminClientCredentialsEditor.svelte';
	import AdminDirectInvoiceModal from '$lib/components/admin/AdminDirectInvoiceModal.svelte';
	import CasePreviewModal from '$lib/components/admin/CasePreviewModal.svelte';
	import FeMediosPagoModal, {
		type FeMediosPagoConfirm
	} from '$lib/components/fe/FeMediosPagoModal.svelte';
	import InvoicePdfPreview from '$lib/components/lab/InvoicePdfPreview.svelte';
	import FeProcessingBanner from '$lib/components/fe/FeProcessingBanner.svelte';
	import DoctorProductionSummary from '$lib/components/lab/DoctorProductionSummary.svelte';
	import { getDoctorProductionStats } from '$lib/lab/analytics';
	import { loadClientForAdmin } from '$lib/lab/client-session';
	import {
		getClientById,
		getClientStats,
		getCasesByClient,
		initializeLabStorage,
		revalidateLabDataFromDb
	} from '$lib/lab/store';
	import {
		getEstadoBadgeClass,
		getEstadoLabel,
		getInvoiceEstadoClass,
		getInvoiceEstadoLabel,
		getMaterialLabel,
		getTipoTrabajoLabel
	} from '$lib/lab/constants';
	import {
		feComprobanteBlocksEmit,
		feComprobanteCanReemit,
		feComprobanteCanConsultar,
		getFeComprobanteEstadoClass,
		getFeComprobanteEstadoLabel
	} from '$lib/fe/constants';
	import TablePagination from '$lib/components/ui/TablePagination.svelte';
	import { formatCurrency, formatDate } from '$lib/lab/helpers';
	import type { InvoiceListPageSize, InvoiceListRow } from '$lib/lab/invoices-list';
	import type { LabCase, LabClient } from '$lib/lab/types';

	type ClientDetailTab = 'info' | 'casos' | 'facturas';

	let clientId = $derived($page.params.clientId);
	let client = $state<LabClient | null>(null);
	let casos = $state<LabCase[]>([]);
	let stats = $state(getClientStats(''));
	let loading = $state(true);
	let deleteOpen = $state(false);
	let deleting = $state(false);
	let deleteError = $state('');
	let createdNotice = $state(false);
	let previewCase = $state<LabCase | null>(null);
	let searchQuery = $state('');
	let casosPage = $state(1);
	let casosPageSize = $state<InvoiceListPageSize>(15);

	let showFinancial = $derived(canViewFinancial($page.data.staffRole ?? $page.data.profile?.role));
	let canManage = $derived(canManageClients($page.data.staffRole ?? $page.data.profile?.role));
	let doctorProduction = $derived(getDoctorProductionStats(casos));
	let clientInvoicesData = $derived($page.data.clientInvoices);
	let clientInvoices = $derived(clientInvoicesData?.invoices ?? []);
	let clientInvoicesTotal = $derived(clientInvoicesData?.totalCount ?? 0);
	let clientInvoicesPage = $derived(clientInvoicesData?.page ?? 1);
	let clientInvoicesPageSize = $derived(clientInvoicesData?.pageSize ?? 15);
	let hasActiveEmisor = $derived(Boolean($page.data.hasActiveEmisor));
	let facturadorOk = $derived(Boolean($page.data.facturadorOk));
	let fiscalForm = $derived($page.form?.kind === 'fiscal' ? $page.form : undefined);
	let credentialsForm = $derived($page.form?.kind === 'credentials' ? $page.form : undefined);
	let feActionMessage = $derived(
		$page.form && 'invoiceId' in $page.form && $page.form.invoiceId ? ($page.form.message ?? '') : ''
	);
	let feActionSuccess = $derived(Boolean($page.form?.success));
	let feActionInvoiceId = $derived(
		$page.form && 'invoiceId' in $page.form ? String($page.form.invoiceId ?? '') : ''
	);

	let invoicesByCaseId = $derived.by(() => {
		const map: Record<string, InvoiceListRow[]> = {};
		for (const fac of clientInvoices) {
			(map[fac.case_id] ??= []).push(fac);
		}
		return map;
	});

	function materialLabels(caso: LabCase): string[] {
		const fromItems = caso.items
			.map((item) => getMaterialLabel(item.material, item.tipo_trabajo))
			.filter((label) => label !== '—');
		if (fromItems.length > 0) return [...new Set(fromItems)];
		const fallback = getMaterialLabel(caso.material, caso.tipo_trabajo);
		return fallback === '—' ? [] : [fallback];
	}

	function materialLabel(caso: LabCase): string {
		const labels = materialLabels(caso);
		return labels.length > 0 ? labels.join(' · ') : '—';
	}

	function caseMatchesQuery(caso: LabCase, q: string): boolean {
		const invoices = invoicesByCaseId[caso.id] ?? [];
		return (
			caso.case_number.toLowerCase().includes(q) ||
			caso.paciente_name.toLowerCase().includes(q) ||
			getTipoTrabajoLabel(caso.tipo_trabajo).toLowerCase().includes(q) ||
			getEstadoLabel(caso.estado).toLowerCase().includes(q) ||
			materialLabels(caso).some((label) => label.toLowerCase().includes(q)) ||
			(caso.doctor_name?.toLowerCase().includes(q) ?? false) ||
			(caso.color?.toLowerCase().includes(q) ?? false) ||
			caso.items.some(
				(item) =>
					getTipoTrabajoLabel(item.tipo_trabajo).toLowerCase().includes(q) ||
					(item.color?.toLowerCase().includes(q) ?? false)
			) ||
			invoices.some(
				(fac) =>
					fac.invoice_number.toLowerCase().includes(q) ||
					getInvoiceEstadoLabel(fac.estado).toLowerCase().includes(q)
			)
		);
	}

	let filteredCasos = $derived.by(() => {
		const q = searchQuery.trim().toLowerCase();
		if (!q) return casos;
		return casos.filter((caso) => caseMatchesQuery(caso, q));
	});

	let orphanInvoices = $derived(
		clientInvoices.filter((fac) => !casos.some((caso) => caso.id === fac.case_id))
	);

	let filteredOrphanInvoices = $derived.by(() => {
		const q = searchQuery.trim().toLowerCase();
		if (!q) return orphanInvoices;
		return orphanInvoices.filter(
			(fac) =>
				fac.case_number.toLowerCase().includes(q) ||
				fac.paciente_name.toLowerCase().includes(q) ||
				fac.invoice_number.toLowerCase().includes(q) ||
				getInvoiceEstadoLabel(fac.estado).toLowerCase().includes(q)
		);
	});

	let paginatedCasos = $derived.by(() => {
		const start = (casosPage - 1) * casosPageSize;
		return filteredCasos.slice(start, start + casosPageSize);
	});

	$effect(() => {
		searchQuery;
		casosPage = 1;
	});

	$effect(() => {
		const totalPages = Math.max(1, Math.ceil(filteredCasos.length / casosPageSize));
		if (casosPage > totalPages) {
			casosPage = totalPages;
		}
	});

	let deleteModeLabel = $derived(
		stats.totalCasos === 0
			? 'Se eliminará el cliente y su usuario de acceso de forma permanente.'
			: `Tiene ${stats.totalCasos} caso(s): se quitará el acceso al portal y el cliente dejará de aparecer en la lista. Casos y facturas se conservan.`
	);

	onMount(() => refresh());

	afterNavigate(({ to }) => {
		refresh();
		if (to?.url.hash === '#facturas' && showFinancial) {
			selectTab('facturas');
		}
	});

	async function refresh() {
		if (!browser) return;
		createdNotice = $page.url.searchParams.get('created') === '1';
		initializeLabStorage({ treatments: true });
		await revalidateLabDataFromDb();
		loading = true;
		searchQuery = '';
		try {
			const fromDb = await loadClientForAdmin(clientId);
			client = fromDb ?? getClientById(clientId);
		} catch {
			client = getClientById(clientId);
		}
		load();
		loading = false;
	}

	function load() {
		if (!client) return;
		casos = getCasesByClient(clientId);
		stats = getClientStats(clientId);
	}

	function itemsLabel(caso: LabCase): string {
		return caso.items
			.map((i) => `${getTipoTrabajoLabel(i.tipo_trabajo)} ×${i.piezas}`)
			.join(' · ');
	}

	function openCasePreview(caso: LabCase) {
		previewCase = caso;
	}

	function closeCasePreview() {
		previewCase = null;
	}

	function onCaseUpdated(updated: LabCase) {
		previewCase = updated;
		casos = casos.map((caso) => (caso.id === updated.id ? updated : caso));
	}

	let pdfPreviewOpen = $state(false);
	let pdfPreview = $state<{ id: string; number: string } | null>(null);
	let emitModalOpen = $state(false);
	let emitTarget = $state<{ id: string; label: string; total: number } | null>(null);
	let emitFormEl = $state<HTMLFormElement | null>(null);
	let mediosPagoJson = $state('');
	let emitMoneda = $state('USD');
	let emitTipoCambio = $state('1');
	let emittingFe = $state(false);
	let emittingLabel = $state('');
	let directInvoiceOpen = $state(false);
	let creatingDirectInvoice = $state(false);
	let directInvoiceFormEl = $state<HTMLFormElement | null>(null);
	let directInvoiceLineasJson = $state('');
	let directInvoicePaciente = $state('');
	let directInvoiceNotas = $state('');
	let directInvoiceError = $state('');

	let directInvoiceForm = $derived(
		$page.form?.kind === 'directInvoice' ? $page.form : undefined
	);

	let directInvoiceErrorMessage = $derived(
		directInvoiceError ||
			(directInvoiceForm?.message && !directInvoiceForm.success ? directInvoiceForm.message : '')
	);

	function actionFailureMessage(
		result: { type: string; data?: unknown; error?: { message?: string } },
		fallback: string
	): string {
		if (result.type === 'failure') {
			const data = result.data;
			if (
				data &&
				typeof data === 'object' &&
				'message' in data &&
				typeof data.message === 'string' &&
				data.message.trim()
			) {
				return data.message.trim();
			}
		}
		if (result.type === 'error') {
			return result.error?.message?.trim() || fallback;
		}
		return fallback;
	}

	let activeTab = $derived.by((): ClientDetailTab => {
		const param = $page.url.searchParams.get('tab');
		if (param === 'casos') return 'casos';
		if (param === 'facturas' && showFinancial) return 'facturas';
		if (param === 'info') return 'info';
		if (
			showFinancial &&
			($page.form?.kind === 'directInvoice' ||
				($page.form && 'invoiceId' in $page.form && $page.form.invoiceId))
		) {
			return 'facturas';
		}
		if ($page.form?.kind === 'fiscal' || $page.form?.kind === 'credentials') {
			return 'info';
		}
		return 'info';
	});

	function selectTab(tab: ClientDetailTab) {
		const url = new URL($page.url);
		url.hash = '';
		if (tab === 'info') {
			url.searchParams.delete('tab');
		} else {
			url.searchParams.set('tab', tab);
		}
		const search = url.searchParams.toString();
		void goto(`${url.pathname}${search ? `?${search}` : ''}`, {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	}

	function clientListHref(
		overrides: Partial<{ facturasPage: number; facturasPageSize: InvoiceListPageSize }> = {}
	) {
		const url = new URL(get(page).url);
		const nextPage = overrides.facturasPage ?? clientInvoicesPage;
		const nextPageSize = overrides.facturasPageSize ?? clientInvoicesPageSize;
		if (nextPage <= 1) url.searchParams.delete('facturas_page');
		else url.searchParams.set('facturas_page', String(nextPage));
		if (nextPageSize === 15) url.searchParams.delete('facturas_size');
		else url.searchParams.set('facturas_size', String(nextPageSize));
		const search = url.searchParams.toString();
		return `${url.pathname}${search ? `?${search}` : ''}`;
	}

	function goClientInvoicesList(
		overrides: Partial<{ facturasPage: number; facturasPageSize: InvoiceListPageSize }> = {}
	) {
		void goto(clientListHref(overrides), { keepFocus: true, noScroll: true });
	}

	function openEmitModal(fac: InvoiceListRow) {
		emitTarget = { id: fac.id, label: fac.invoice_number, total: fac.total };
		mediosPagoJson = '';
		emitModalOpen = true;
	}

	async function onDirectInvoiceConfirm(payload: {
		paciente_name: string;
		notas: string;
		items: unknown[];
	}) {
		directInvoiceError = '';
		directInvoicePaciente = payload.paciente_name;
		directInvoiceNotas = payload.notas;
		directInvoiceLineasJson = JSON.stringify(payload.items);
		creatingDirectInvoice = true;
		await tick();
		directInvoiceFormEl?.requestSubmit();
	}

	async function onMediosConfirm(result: FeMediosPagoConfirm) {
		mediosPagoJson = JSON.stringify(result.medios);
		emitMoneda = result.moneda;
		emitTipoCambio = String(result.tipoCambio);
		emittingLabel = emitTarget?.label ?? '';
		emittingFe = true;
		emitModalOpen = false;
		await tick();
		emitFormEl?.requestSubmit();
	}
</script>

<div class="dash-page">
	<button type="button" class="text-link dash-back" onclick={() => goto('/admin/clientes')}>
		← Volver a clientes
	</button>

	{#if createdNotice}
		<div class="alert alert--success">Cliente creado. Comparte el correo y la contraseña para el acceso al portal.</div>
	{/if}

	{#if loading}
		<p class="type-caption">Cargando…</p>
	{:else if !client}
		<div class="store-utility-card empty-state">
			<p>Cliente no encontrado</p>
		</div>
	{:else}
		<header class="client-detail-header">
			<div class="client-detail-header__main">
				<div class="avatar" style="width: 72px; height: 72px; font-size: 28px;">
					{client.nombre.charAt(0)}
				</div>
				<div>
					<h2 class="type-display-md" style="margin: 0;">{client.nombre}</h2>
					<p class="type-lead" style="margin-top: var(--spacing-xs); font-size: 17px;">{client.clinica}</p>
					{#if client.email}<p class="type-caption">{client.email}</p>{/if}
					{#if client.telefono}<p class="type-caption">{client.telefono}</p>{/if}
					{#if $page.data.fiscal?.fe_codigo_actividad}
						<p class="type-caption">
							Actividad económica: {$page.data.fiscal.fe_codigo_actividad}
						</p>
					{/if}
					{#if $page.data.fiscal?.fe_otras_senas?.trim()}
						<p class="type-caption">
							Dirección fiscal: {$page.data.fiscal.fe_otras_senas}
						</p>
					{/if}
				</div>
			</div>
			{#if showFinancial}
				<button
					type="button"
					class="btn-danger-outline"
					onclick={() => {
						deleteError = '';
						deleteOpen = true;
					}}
				>
					<Trash2 size={16} />
					Eliminar cliente
				</button>
			{/if}
		</header>

		<section class="dash-stat-grid dash-stat-grid--compact">
			<div class="dash-stat">
				<p class="dash-stat__label">Casos</p>
				<p class="dash-stat__value">{stats.totalCasos}</p>
			</div>
			<div class="dash-stat">
				<p class="dash-stat__label">Piezas totales</p>
				<p class="dash-stat__value">{stats.totalPiezas}</p>
			</div>
			{#if showFinancial}
				<div class="dash-stat">
					<p class="dash-stat__label">Total comprado</p>
					<p class="dash-stat__value dash-stat__value--currency">
						{formatCurrency(stats.totalGastado)}
					</p>
				</div>
			{/if}
			<div class="dash-stat">
				<p class="dash-stat__label">Finalizados</p>
				<p class="dash-stat__value">{stats.finalizados}</p>
			</div>
		</section>

		<div class="client-detail-tabs" role="tablist" aria-label="Secciones del cliente">
			<button
				type="button"
				role="tab"
				class="client-detail-tabs__tab"
				class:client-detail-tabs__tab--active={activeTab === 'info'}
				aria-selected={activeTab === 'info'}
				onclick={() => selectTab('info')}
			>
				Información
			</button>
			<button
				type="button"
				role="tab"
				class="client-detail-tabs__tab"
				class:client-detail-tabs__tab--active={activeTab === 'casos'}
				aria-selected={activeTab === 'casos'}
				onclick={() => selectTab('casos')}
			>
				Casos
				{#if stats.totalCasos > 0}
					<span class="client-detail-tabs__count">{stats.totalCasos}</span>
				{/if}
			</button>
			{#if showFinancial}
				<button
					type="button"
					role="tab"
					class="client-detail-tabs__tab"
					class:client-detail-tabs__tab--active={activeTab === 'facturas'}
					aria-selected={activeTab === 'facturas'}
					onclick={() => selectTab('facturas')}
				>
					Facturas
					{#if clientInvoicesTotal > 0}
						<span class="client-detail-tabs__count">{clientInvoicesTotal}</span>
					{/if}
				</button>
			{/if}
		</div>

		{#if activeTab === 'info'}
			<div role="tabpanel" class="client-detail-tab-panel">
				{#if canManage}
					<AdminClientCredentialsEditor
						email={client.email}
						form={credentialsForm}
						onSaved={(nextEmail) => {
							if (client) client = { ...client, email: nextEmail };
						}}
					/>
				{/if}

				{#if showFinancial && $page.data.fiscal}
					<AdminClientFiscalEditor
						fiscal={$page.data.fiscal}
						form={fiscalForm}
						onSaved={(telefono) => {
							if (client) client = { ...client, telefono };
						}}
					/>
				{/if}

				{#if canManage}
					<AdminClientDoctorsEditor clientId={client.id} />
				{/if}

				<div class="dash-panel dash-panel--section" style="margin-top: var(--spacing-lg);">
					<DoctorProductionSummary stats={doctorProduction} />
				</div>
			</div>
		{/if}

		{#if activeTab === 'casos'}
			<section role="tabpanel" class="client-detail-tab-panel">
				<div class="client-cases-section__head">
					<h3 class="type-tagline" style="margin: 0;">Casos de este cliente</h3>
					{#if casos.length > 0}
						<span class="type-fine-print">
							{#if searchQuery.trim() && filteredCasos.length !== casos.length}
								{filteredCasos.length} de {casos.length} caso(s)
							{:else}
								{casos.length} caso(s)
							{/if}
						</span>
					{/if}
				</div>
				{#if casos.length === 0}
					<p class="type-caption">Sin casos registrados</p>
				{:else}
					<div class="dash-toolbar client-cases-section__toolbar">
						<input
							type="search"
							class="search-input"
							bind:value={searchQuery}
							placeholder="Buscar por número, paciente, doctor, trabajo, tono…"
							aria-label="Buscar casos del cliente"
						/>
					</div>

					{#if filteredCasos.length === 0}
						<div class="dash-panel empty-state client-cases-section__empty">
							<p>Ningún caso coincide con «{searchQuery.trim()}»</p>
							<button type="button" class="btn-secondary-pill" onclick={() => (searchQuery = '')}>
								Limpiar búsqueda
							</button>
						</div>
					{:else}
						<div class="data-table-wrap">
							<table class="data-table">
								<thead>
									<tr>
										<th>Caso</th>
										<th>Paciente</th>
										<th>Ítems</th>
										{#if showFinancial}<th>Costo</th>{/if}
										<th>Estado</th>
										<th></th>
									</tr>
								</thead>
								<tbody>
									{#each paginatedCasos as caso}
										<tr>
											<td class="type-body-strong">{caso.case_number}</td>
											<td>{caso.paciente_name}</td>
											<td class="type-caption">{itemsLabel(caso)}</td>
											{#if showFinancial}<td>{formatCurrency(caso.costo)}</td>{/if}
											<td>
												<span class={getEstadoBadgeClass(caso.estado)}>{getEstadoLabel(caso.estado)}</span>
											</td>
											<td>
												<button type="button" class="text-link" onclick={() => openCasePreview(caso)}>
													Ver
												</button>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
						<TablePagination
							page={casosPage}
							pageSize={casosPageSize}
							totalCount={filteredCasos.length}
							ariaLabel="Paginación de casos"
							onPageChange={(page) => (casosPage = page)}
							onPageSizeChange={(size) => {
								casosPageSize = size;
								casosPage = 1;
							}}
						/>
					{/if}
				{/if}
			</section>
		{/if}

		{#if activeTab === 'facturas' && showFinancial}
			<section role="tabpanel" class="client-detail-tab-panel" id="facturas">
				<div class="client-facturas-head">
					<div>
						<h3 class="type-tagline" style="margin: 0 0 var(--spacing-sm);">Facturas</h3>
						<p class="type-caption" style="margin: 0;">
							Estado FE según ambiente
							<strong>{$page.data.emitAmbiente === 'production' ? 'Producción' : 'Pruebas (staging)'}</strong>.
							<a href="/admin/factura-electronica" class="text-link">Cambiar</a>
						</p>
					</div>
					<button
						type="button"
						class="btn-primary"
						disabled={creatingDirectInvoice}
						onclick={() => {
							directInvoiceError = '';
							directInvoiceOpen = true;
						}}
					>
						Nueva factura directa
					</button>
				</div>
				{#if directInvoiceErrorMessage}
					<div class="alert alert--error" style="margin-top: var(--spacing-md);" role="alert">
						{directInvoiceErrorMessage}
					</div>
				{/if}
				{#if emittingFe}
					<FeProcessingBanner
						title="Generando factura electrónica"
						subtitle={emittingLabel}
						detail="Firmando XML, enviando y consultando en Hacienda…"
					/>
				{/if}
				{#if feActionMessage}
					<div
						class="store-utility-card"
						style="margin-bottom: var(--spacing-md); border-color: {feActionSuccess
							? 'var(--color-success)'
							: 'var(--color-danger)'};"
						role="alert"
					>
						<p>{feActionMessage}</p>
					</div>
				{/if}
				{#if !facturadorOk && $page.data.facturadorUrl}
					<p class="type-caption" style="margin-bottom: var(--spacing-md); color: var(--color-danger, #c0392b);">
						Facturador no disponible. No se puede generar FE desde aquí.
					</p>
				{:else if !hasActiveEmisor}
					<p class="type-caption" style="margin-bottom: var(--spacing-md); color: var(--color-warning, #b8860b);">
						Emisor incompleto: complete datos fiscales del laboratorio para generar FE.
					</p>
				{/if}
				{#if clientInvoicesTotal === 0}
					<p class="type-caption">Sin facturas</p>
				{:else}
					<div class="data-table-wrap">
						<table class="data-table">
							<thead>
								<tr>
									<th>Número</th>
									<th>Caso</th>
									<th>Total</th>
									<th>Estado</th>
									<th>FE Hacienda</th>
									<th>Emisión</th>
									<th>Acciones</th>
								</tr>
							</thead>
							<tbody>
								{#each clientInvoices as fac (fac.id)}
									{@const fe = fac.fe}
									<tr
										class={getInvoiceRowClass(fac.estado, fe?.estado)}
										class:fe-row-highlight={feActionInvoiceId === fac.id && feActionMessage}
									>
										<td class="type-body-strong">
											<a href="/admin/facturas/{fac.id}?from=cliente" class="text-link">{fac.invoice_number}</a>
										</td>
										<td>
											<a href="/admin/facturas/{fac.id}?from=cliente" class="text-link">{fac.invoice_number}</a>
										</td>
										<td>
											<span class={getInvoiceEstadoClass(fac.estado, fac.fe?.estado)}>
												{getInvoiceEstadoLabel(fac.estado)}
											</span>
										</td>
										<td>
											{#if fac.fe}
												<span class={getFeComprobanteEstadoClass(fac.fe.estado)}>
													{getFeComprobanteEstadoLabel(fac.fe.estado)}
												</span>
											{:else}
												<span class="type-caption">Sin enviar</span>
											{/if}
										</td>
										<td><span class="type-caption">—</span></td>
										<td class="client-fe-actions">
											{#if hasActiveEmisor && facturadorOk && !feComprobanteBlocksEmit(fac.fe?.estado)}
												<button
													type="button"
													class="btn-primary client-fe-actions__btn"
													disabled={emittingFe}
													onclick={() => openEmitModal(fac)}
												>
													{fac.fe && feComprobanteCanReemit(fac.fe.estado) ? 'Reemitir FE' : 'Generar factura'}
												</button>
											{/if}
											{#if fac.fe && feComprobanteCanConsultar(fac.fe.estado) && fac.fe.clave}
												<form
													method="POST"
													action="?/consultar"
													use:enhance={() =>
														async ({ update }) => {
															await update({ reset: false });
															await invalidate('app:client-invoices');
															selectTab('facturas');
														}}
												>
													<input type="hidden" name="invoice_id" value={fac.id} />
													<button
														type="submit"
														class="btn-secondary-pill client-fe-actions__btn"
														disabled={emittingFe}
													>
														Consultar
													</button>
												</form>
											{/if}
											<button
												type="button"
												class="btn-secondary-pill client-fe-actions__btn"
												onclick={() => {
													pdfPreview = { id: fac.id, number: fac.invoice_number };
													pdfPreviewOpen = true;
												}}
											>
												PDF
											</button>
											<a href="/admin/facturas/{fac.id}?from=cliente" class="btn-secondary-pill client-fe-actions__btn">
												Ver factura
											</a>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					<TablePagination
						page={clientInvoicesPage}
						pageSize={clientInvoicesPageSize}
						totalCount={clientInvoicesTotal}
						disabled={emittingFe}
						ariaLabel="Paginación de facturas"
						onPageChange={(page) => goClientInvoicesList({ facturasPage: page })}
						onPageSizeChange={(size) => goClientInvoicesList({ facturasPageSize: size, facturasPage: 1 })}
					/>
				{/if}
			{/if}
		</section>

		{#if canManage}
			<AdminClientDoctorsEditor clientId={client.id} />
		{/if}

		<div class="dash-panel dash-panel--section" style="margin-top: var(--spacing-lg);">
			<DoctorProductionSummary stats={doctorProduction} />
		</div>
	{/if}
</div>

{#if deleteOpen && client && showFinancial}
	<div class="case-file-modal__backdrop" onclick={() => !deleting && (deleteOpen = false)} role="presentation"></div>
	<div
		class="case-file-modal case-file-modal--form"
		role="dialog"
		aria-modal="true"
		aria-labelledby="delete-client-title"
	>
		<header class="case-file-modal__header">
			<div>
				<p class="case-file-modal__eyebrow">Zona de riesgo</p>
				<h3 class="case-file-modal__title" id="delete-client-title">Eliminar cliente</h3>
			</div>
			<button
				type="button"
				class="case-file-modal__close"
				aria-label="Cerrar"
				disabled={deleting}
				onclick={() => (deleteOpen = false)}
			>
				×
			</button>
		</header>

		<form
			class="case-file-modal__body"
			method="POST"
			action="?/delete"
			use:enhance={() => {
				deleting = true;
				deleteError = '';
				return async ({ result, update }) => {
					deleting = false;
					if (result.type === 'failure') {
						deleteError =
							(typeof result.data === 'object' &&
								result.data &&
								'message' in result.data &&
								String(result.data.message)) ||
							'No se pudo eliminar';
						await update();
						return;
					}
					await update();
				};
			}}
		>
			<input type="hidden" name="confirm" value="yes" />
			<div class="case-file-modal__fields">
				<p class="case-file-modal__lead">{deleteModeLabel}</p>
				<p class="type-caption">
					Cliente: <strong>{client.nombre}</strong>
				</p>
				{#if deleteError}
					<div class="alert alert--error">{deleteError}</div>
				{/if}
			</div>
			<div class="case-file-modal__footer">
				<button
					type="button"
					class="btn-pearl-capsule"
					disabled={deleting}
					onclick={() => (deleteOpen = false)}
				>
					Cancelar
				</button>
				<button type="submit" class="btn-danger" disabled={deleting}>
					{deleting ? 'Eliminando…' : stats.totalCasos === 0 ? 'Eliminar permanentemente' : 'Eliminar acceso'}
				</button>
			</div>
		</form>
	</div>
{/if}

<CasePreviewModal
	caso={previewCase}
	detailed
	returnToClient
	onUpdated={onCaseUpdated}
	onClose={closeCasePreview}
/>

<form
	bind:this={emitFormEl}
	method="POST"
	action="?/emitir"
	class="fe-emit-form-hidden"
	aria-hidden="true"
	use:enhance={() => {
		return async ({ update }) => {
			emittingFe = true;
			try {
				await update({ reset: false });
				await invalidate('app:client-invoices');
				selectTab('facturas');
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
	<input type="hidden" name="moneda" value={emitMoneda} />
	<input type="hidden" name="tipo_cambio" value={emitTipoCambio} />
</form>

<InvoicePdfPreview
	bind:open={pdfPreviewOpen}
	invoiceId={pdfPreview?.id ?? ''}
	invoiceNumber={pdfPreview?.number ?? ''}
/>

<FeMediosPagoModal
	bind:open={emitModalOpen}
	total={emitTarget?.total ?? 0}
	subtitle={emitTarget ? `Factura ${emitTarget.label}` : ''}
	onCancel={() => {
		emitTarget = null;
	}}
	onConfirm={onMediosConfirm}
/>

<AdminDirectInvoiceModal
	bind:open={directInvoiceOpen}
	clientName={client?.nombre ?? ''}
	clientClinica={client?.clinica ?? ''}
	serverError={directInvoiceErrorMessage}
	saving={creatingDirectInvoice}
	onConfirm={onDirectInvoiceConfirm}
/>

<form
	bind:this={directInvoiceFormEl}
	method="POST"
	action="?/createDirectInvoice"
	class="fe-emit-form-hidden"
	aria-hidden="true"
	use:enhance={() => {
		creatingDirectInvoice = true;
		directInvoiceError = '';
		return async ({ result, update }) => {
			if (result.type === 'redirect') {
				directInvoiceOpen = false;
				await update();
				return;
			}
			creatingDirectInvoice = false;
			if (result.type === 'failure' || result.type === 'error') {
				directInvoiceError = actionFailureMessage(result, 'No se pudo crear la factura.');
				await update({ reset: false });
				return;
			}
			await update();
		};
	}}
>
	<input type="hidden" name="paciente_name" value={directInvoicePaciente} />
	<input type="hidden" name="notas" value={directInvoiceNotas} />
	<input type="hidden" name="lineas_json" value={directInvoiceLineasJson} />
</form>

<style>
	.client-detail-tabs {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		margin-top: var(--spacing-xl);
		margin-bottom: var(--spacing-lg);
	}

	.client-detail-tabs__tab {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		border: 1px solid var(--color-border, #e2e8f0);
		background: transparent;
		padding: 0.45rem 0.85rem;
		border-radius: 999px;
		font: inherit;
		font-size: 0.875rem;
		cursor: pointer;
	}

	.client-detail-tabs__tab--active {
		background: var(--color-primary, #0f172a);
		color: var(--color-primary-foreground, #fff);
		border-color: transparent;
	}

	.client-detail-tabs__count {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 1.25rem;
		height: 1.25rem;
		padding: 0 0.35rem;
		border-radius: 999px;
		font-size: 0.6875rem;
		font-weight: 600;
		background: color-mix(in srgb, currentColor 12%, transparent);
	}

	.client-detail-tabs__tab--active .client-detail-tabs__count {
		background: color-mix(in srgb, currentColor 22%, transparent);
	}

	.client-detail-tab-panel {
		margin-top: 0;
	}

	.client-facturas-head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--spacing-md);
		margin-bottom: var(--spacing-lg);
	}

	.client-detail-header {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-lg);
		align-items: flex-start;
		justify-content: space-between;
	}

	.client-detail-header__main {
		display: flex;
		gap: var(--spacing-lg);
		align-items: flex-start;
	}

	.client-cases-section__head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.75rem 1rem;
		margin-bottom: var(--spacing-lg);
	}

	.client-cases-section__toolbar {
		margin-bottom: 1rem;
	}

	.client-cases-section__toolbar .search-input {
		flex: 1;
		min-width: min(100%, 220px);
	}

	.client-cases-section__empty {
		margin-top: 0;
	}

	.client-case-invoices {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.35rem;
	}

	.client-fe-actions {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 6px;
		min-width: 132px;
	}

	.client-fe-actions__btn {
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
