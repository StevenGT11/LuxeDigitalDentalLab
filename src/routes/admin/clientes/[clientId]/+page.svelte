<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto, invalidate, afterNavigate } from '$app/navigation';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { onMount, tick } from 'svelte';
	import { ChevronRight, Trash2 } from '@lucide/svelte';
	import { canManageClients, canViewFinancial, isAdminRole } from '$lib/auth/roles';
	import AdminDeleteCaseButton from '$lib/components/admin/AdminDeleteCaseButton.svelte';
	import { removeCachedCase } from '$lib/lab/cases-cache';
	import { invoicesIncludeIssuedFe } from '$lib/lab/case-issued';
	import AdminClientDoctorsEditor from '$lib/components/admin/AdminClientDoctorsEditor.svelte';
	import AdminClientFiscalEditor from '$lib/components/admin/AdminClientFiscalEditor.svelte';
	import AdminClientCredentialsEditor from '$lib/components/admin/AdminClientCredentialsEditor.svelte';
	import AdminClientProfileEditor from '$lib/components/admin/AdminClientProfileEditor.svelte';
	import AdminDirectInvoiceModal from '$lib/components/admin/AdminDirectInvoiceModal.svelte';
	import CasePreviewModal from '$lib/components/admin/CasePreviewModal.svelte';
	import InvoicePdfPreview from '$lib/components/lab/InvoicePdfPreview.svelte';
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
		getInvoiceRowClass,
		getMaterialLabel,
		getTipoTrabajoLabel
	} from '$lib/lab/constants';
	import { getInvoiceEstadoLabel, invoiceCobroSelectOptions } from '$lib/lab/invoice-estado';
	import {
		feComprobanteCanConsultar,
		getFeComprobanteEstadoClass,
		getFeComprobanteEstadoLabel,
		getFeTipoDocumentoLabel
	} from '$lib/fe/constants';
	import TablePagination from '$lib/components/ui/TablePagination.svelte';
	import { formatColones, formatCurrency, formatDate } from '$lib/lab/helpers';
	import type { InvoiceListPageSize, InvoiceListRow } from '$lib/lab/invoices-list';
	import type { LabCase, LabClient } from '$lib/lab/types';

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
	let openCaseInvoices = $state<Record<string, boolean>>({});

	let showFinancial = $derived(canViewFinancial($page.data.staffRole ?? $page.data.profile?.role));
	let canManage = $derived(canManageClients($page.data.staffRole ?? $page.data.profile?.role));
	let isAdmin = $derived(isAdminRole($page.data.staffRole ?? $page.data.profile?.role));
	let doctorProduction = $derived(getDoctorProductionStats(casos));
	let clientInvoices = $derived(($page.data.clientInvoices ?? []) as InvoiceListRow[]);
	let fiscalForm = $derived($page.form?.kind === 'fiscal' ? $page.form : undefined);
	let credentialsForm = $derived($page.form?.kind === 'credentials' ? $page.form : undefined);
	let profileForm = $derived($page.form?.kind === 'profile' ? $page.form : undefined);
	let profileNotice = $state('');
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
			invoices.some((fac) => invoiceMatchesQuery(fac, q))
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
		return orphanInvoices.filter((fac) => invoiceMatchesQuery(fac, q) || caseTextMatchesInvoice(fac, q));
	});

	type CaseInvoiceGroup = {
		key: string;
		caso: LabCase | null;
		caseNumber: string;
		paciente: string;
		items: string;
		costo: number | null;
		estado: LabCase['estado'] | null;
		invoices: InvoiceListRow[];
	};

	let unifiedGroups = $derived.by(() => {
		const groups: CaseInvoiceGroup[] = filteredCasos.map((caso) => ({
			key: caso.id,
			caso,
			caseNumber: caso.case_number,
			paciente: caso.paciente_name,
			items: itemsLabel(caso),
			costo: caso.costo,
			estado: caso.estado,
			invoices: showFinancial ? (invoicesByCaseId[caso.id] ?? []) : []
		}));
		if (!showFinancial) return groups;

		const orphansByCase: Record<string, InvoiceListRow[]> = {};
		for (const fac of filteredOrphanInvoices) {
			(orphansByCase[fac.case_id] ??= []).push(fac);
		}
		for (const [caseId, invoices] of Object.entries(orphansByCase)) {
			const first = invoices[0];
			groups.push({
				key: `orphan-${caseId}`,
				caso: null,
				caseNumber: first.case_number,
				paciente: first.paciente_name,
				items: '—',
				costo: null,
				estado: null,
				invoices
			});
		}
		return groups;
	});

	let paginatedGroups = $derived.by(() => {
		const start = (casosPage - 1) * casosPageSize;
		return unifiedGroups.slice(start, start + casosPageSize);
	});

	let allGroupsCount = $derived.by(() => {
		if (!showFinancial) return casos.length;
		const orphanCaseIds = new Set(
			clientInvoices
				.filter((fac) => !casos.some((caso) => caso.id === fac.case_id))
				.map((fac) => fac.case_id)
		);
		return casos.length + orphanCaseIds.size;
	});

	function caseInvoicesOpen(key: string) {
		return openCaseInvoices[key] === true;
	}

	function toggleCaseInvoices(key: string) {
		openCaseInvoices[key] = !openCaseInvoices[key];
	}

	function expandAllCaseInvoices() {
		for (const group of paginatedGroups) {
			if (group.invoices.length > 0) openCaseInvoices[group.key] = true;
		}
	}

	function collapseAllCaseInvoices() {
		for (const group of paginatedGroups) openCaseInvoices[group.key] = false;
	}

	function cobroSelectTone(estado: string): string {
		if (estado === 'pagado' || estado === 'pagada') return 'pagado';
		if (estado === 'facturado') return 'facturado';
		if (estado === 'cancelada') return 'cancelada';
		return 'pendiente';
	}

	function onCaseRowClick(event: MouseEvent, key: string, invoiceCount: number) {
		if (!showFinancial || invoiceCount === 0) return;
		const target = event.target;
		if (!(target instanceof Element)) return;
		if (target.closest('a, button, select, input, label')) return;
		toggleCaseInvoices(key);
	}

	$effect(() => {
		searchQuery;
		casosPage = 1;
	});

	$effect(() => {
		const q = searchQuery.trim();
		if (!q) return;
		for (const group of unifiedGroups) {
			if (group.invoices.length > 0) openCaseInvoices[group.key] = true;
		}
	});

	$effect(() => {
		const id = feActionInvoiceId;
		if (!id) return;
		const fac = clientInvoices.find((item) => item.id === id);
		if (!fac) return;
		const key = casos.some((caso) => caso.id === fac.case_id) ? fac.case_id : `orphan-${fac.case_id}`;
		if (!openCaseInvoices[key]) openCaseInvoices[key] = true;
	});

	$effect(() => {
		const totalPages = Math.max(1, Math.ceil(unifiedGroups.length / casosPageSize));
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
		if (to?.url.hash === '#facturas' && browser) {
			void tick().then(() => {
				document.getElementById('facturas')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
			});
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

	function invoiceMatchesQuery(fac: InvoiceListRow, q: string): boolean {
		return (
			fac.invoice_number.toLowerCase().includes(q) ||
			getInvoiceEstadoLabel(fac.estado).toLowerCase().includes(q) ||
			(fac.fe?.clave?.toLowerCase().includes(q) ?? false) ||
			fac.notas.some(
				(nota) =>
					getFeTipoDocumentoLabel(nota.tipo_documento).toLowerCase().includes(q) ||
					(nota.consecutivo?.toLowerCase().includes(q) ?? false) ||
					(nota.clave?.toLowerCase().includes(q) ?? false) ||
					getFeComprobanteEstadoLabel(nota.estado).toLowerCase().includes(q)
			)
		);
	}

	function caseTextMatchesInvoice(fac: InvoiceListRow, q: string): boolean {
		return (
			fac.case_number.toLowerCase().includes(q) || fac.paciente_name.toLowerCase().includes(q)
		);
	}

	function notaMonto(nota: InvoiceListRow['notas'][number]): string {
		return nota.moneda === 'CRC' ? formatColones(nota.total) : formatCurrency(nota.total);
	}

	function notaNumero(nota: InvoiceListRow['notas'][number]): string {
		if (nota.consecutivo) return nota.consecutivo;
		if (nota.clave) return `…${nota.clave.slice(-8)}`;
		return '—';
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

	function onCaseDeleted(caseId: string) {
		removeCachedCase(caseId);
		casos = casos.filter((caso) => caso.id !== caseId);
		if (previewCase?.id === caseId) previewCase = null;
		void invalidate('app:client-invoices');
	}

	let pdfPreviewOpen = $state(false);
	let pdfPreview = $state<{ id: string; number: string } | null>(null);
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

		{#if canManage && client}
			{#key `${client.nombre}|${client.clinica}|${client.telefono}`}
			{#if profileNotice}
				<p class="type-caption" style="margin: var(--spacing-lg) 0 0; color: var(--color-success);" role="status">
					{profileNotice}
				</p>
			{/if}
			<AdminClientProfileEditor
				nombre={client.nombre}
				clinica={client.clinica}
				telefono={client.telefono}
				form={profileForm}
				onSaved={(next) => {
					if (!client) return;
					profileNotice = 'Datos del cliente actualizados.';
					client = { ...client, ...next };
					casos = casos.map((caso) => ({
						...caso,
						client_name: next.nombre,
						client_clinica: next.clinica
					}));
					void invalidate('app:client-invoices');
				}}
			/>
			{/key}
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

		<section id="facturas" style="margin-top: var(--spacing-xxl);">
			<div class="client-facturas-head">
				<div class="client-cases-section__head" style="margin-bottom: 0;">
					<h3 class="type-tagline" style="margin: 0;">
						{showFinancial ? 'Casos y facturas' : 'Casos de este cliente'}
					</h3>
					{#if allGroupsCount > 0}
						<span class="type-fine-print">
							{#if searchQuery.trim() && unifiedGroups.length !== allGroupsCount}
								{unifiedGroups.length} de {allGroupsCount} caso(s)
							{:else}
								{allGroupsCount} caso(s)
							{/if}
						</span>
					{/if}
				</div>
				{#if showFinancial}
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
				{/if}
			</div>
			{#if showFinancial}
				<p class="type-caption" style="margin: 0 0 var(--spacing-md);">
					Cada caso incluye sus facturas, notas de crédito y notas de débito. Estado FE según ambiente
					<strong>{$page.data.emitAmbiente === 'production' ? 'Producción' : 'Pruebas (staging)'}</strong>.
					<a href="/admin/factura-electronica" class="text-link">Cambiar</a>
				</p>
				{#if directInvoiceErrorMessage}
					<div class="alert alert--error" style="margin-bottom: var(--spacing-md);" role="alert">
						{directInvoiceErrorMessage}
					</div>
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
			{/if}
			{#if allGroupsCount === 0}
				<p class="type-caption">Sin casos registrados</p>
			{:else}
				<div class="dash-toolbar client-cases-section__toolbar">
					<input
						type="search"
						class="search-input"
						bind:value={searchQuery}
						placeholder={showFinancial
							? 'Buscar por caso, paciente, factura, nota…'
							: 'Buscar por número, paciente, doctor, trabajo, tono…'}
						aria-label="Buscar casos y facturas del cliente"
					/>
					{#if showFinancial}
						<div class="client-case-fold-all">
							<button type="button" class="text-link" onclick={expandAllCaseInvoices}>Expandir facturas</button>
							<span aria-hidden="true">·</span>
							<button type="button" class="text-link" onclick={collapseAllCaseInvoices}>Contraer facturas</button>
						</div>
					{/if}
				</div>

				{#if unifiedGroups.length === 0}
					<div class="dash-panel empty-state client-cases-section__empty">
						<p>Nada coincide con «{searchQuery.trim()}»</p>
						<button type="button" class="btn-secondary-pill" onclick={() => (searchQuery = '')}>
							Limpiar búsqueda
						</button>
					</div>
				{:else}
					<div class="data-table-wrap client-cases-table">
						<table class="data-table">
							<thead>
								<tr>
									<th>Caso</th>
									<th>Paciente</th>
									<th>Ítems</th>
									{#if showFinancial}
										<th>Documento</th>
										<th>Número</th>
										<th>Monto</th>
									{/if}
									<th>Estado</th>
									{#if showFinancial}
										<th>FE Hacienda</th>
										<th>Emisión</th>
									{/if}
									<th></th>
								</tr>
							</thead>
							{#each paginatedGroups as group (group.key)}
								{@const invoicesOpen = caseInvoicesOpen(group.key)}
								<tbody class="client-case-group">
									<tr
										class="client-doc-row--case"
										class:client-doc-row--case-toggle={showFinancial && group.invoices.length > 0}
										onclick={(event) => onCaseRowClick(event, group.key, group.invoices.length)}
									>
										<td class="type-body-strong">
											<div class="client-case-id">
												{#if showFinancial && group.invoices.length > 0}
													<button
														type="button"
														class="client-case-fold"
														aria-expanded={invoicesOpen}
														aria-label="{invoicesOpen ? 'Ocultar' : 'Mostrar'} facturas de {group.caseNumber}"
														onclick={() => toggleCaseInvoices(group.key)}
													>
														<span
															class="client-case-fold__icon"
															class:client-case-fold__icon--open={invoicesOpen}
														>
															<ChevronRight size={16} />
														</span>
													</button>
												{/if}
												<span>{group.caseNumber}</span>
											</div>
										</td>
										<td>{group.paciente}</td>
										<td class="type-caption">{group.items}</td>
										{#if showFinancial}
											<td class="type-caption">Caso</td>
											<td class="type-caption">
												{#if group.invoices.length > 0 && !invoicesOpen}
													{group.invoices.length}
													{group.invoices.length === 1 ? 'factura' : 'facturas'}
												{/if}
											</td>
											<td>{group.costo == null ? '—' : formatCurrency(group.costo)}</td>
										{/if}
										<td>
											{#if group.estado}
												<span class={getEstadoBadgeClass(group.estado)}>{getEstadoLabel(group.estado)}</span>
											{:else}
												<span class="type-caption">—</span>
											{/if}
										</td>
										{#if showFinancial}
											<td></td>
											<td></td>
										{/if}
										<td>
											{#if group.caso}
												<div class="client-case-row-actions">
													<button
														type="button"
														class="text-link"
														onclick={() => group.caso && openCasePreview(group.caso)}
													>
														Ver caso
													</button>
													{#if isAdmin && !invoicesIncludeIssuedFe(group.invoices)}
														<a class="text-link" href="/admin/casos/{group.caso.id}/editar?from=cliente">
															Editar
														</a>
														<AdminDeleteCaseButton
															compact
															caseId={group.caso.id}
															caseNumber={group.caseNumber}
															onDeleted={() => group.caso && onCaseDeleted(group.caso.id)}
														/>
													{/if}
												</div>
											{/if}
										</td>
									</tr>
									{#if showFinancial && group.invoices.length === 0}
										<tr class="client-doc-row--empty">
											<td colspan="3"></td>
											<td colspan="7" class="type-caption">Sin facturas</td>
										</tr>
									{/if}
									{#if showFinancial && invoicesOpen}
										{#each group.invoices as fac (fac.id)}
											{@const fe = fac.fe}
											<tr
												class="client-doc-row--invoice {getInvoiceRowClass(fac.estado, fe?.estado)}"
												class:fe-row-highlight={feActionInvoiceId === fac.id && feActionMessage}
											>
												<td></td>
												<td></td>
												<td></td>
												<td>Factura</td>
												<td class="type-body-strong">
													<a href="/admin/facturas/{fac.id}?from=cliente" class="text-link">
														{fac.invoice_number}
													</a>
													{#if fac.reemit?.correctionInvoiceId}
														<br />
														<a
															href="/admin/facturas/{fac.reemit.correctionInvoiceId}?from=cliente"
															class="type-fine-print text-link"
														>
															Corregida {fac.reemit.correctionInvoiceNumber ?? ''}
														</a>
													{/if}
												</td>
												<td>{formatCurrency(fac.total)}</td>
												<td>
													<form
														method="POST"
														action="?/updateEstado"
														class="client-cobro-form"
														use:enhance={() =>
															async ({ update }) => {
																await update({ reset: false });
																await invalidate('app:client-invoices');
															}}
													>
														<input type="hidden" name="invoice_id" value={fac.id} />
														<select
															class="field-select client-cobro-form__select client-cobro-form__select--{cobroSelectTone(fac.estado)}"
															name="estado"
															value={fac.estado}
															onchange={(e) => e.currentTarget.form?.requestSubmit()}
															aria-label="Estado de cobro de {fac.invoice_number}"
														>
															{#each invoiceCobroSelectOptions(fac.estado, fe?.estado) as option (option.value)}
																<option value={option.value}>{option.label}</option>
															{/each}
														</select>
													</form>
												</td>
												<td>
													{#if fe}
														<span class={getFeComprobanteEstadoClass(fe.estado)}>
															{getFeComprobanteEstadoLabel(fe.estado)}
														</span>
													{:else}
														<span class="type-caption">Sin enviar</span>
													{/if}
												</td>
												<td>{formatDate(fac.fecha_emision)}</td>
												<td class="client-fe-actions">
													{#if fe && feComprobanteCanConsultar(fe.estado) && fe.clave}
														<form
															method="POST"
															action="?/consultar"
															use:enhance={() =>
																async ({ update }) => {
																	await update({ reset: false });
																	await invalidate('app:client-invoices');
																}}
														>
															<input type="hidden" name="invoice_id" value={fac.id} />
															<button
																type="submit"
																class="btn-secondary-pill client-fe-actions__btn"
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
													<a
														href="/admin/facturas/{fac.id}?from=cliente"
														class="btn-secondary-pill client-fe-actions__btn"
													>
														Ver
													</a>
												</td>
											</tr>
											{#each fac.notas as nota (nota.id)}
												<tr class="client-doc-row--nota">
													<td></td>
													<td></td>
													<td></td>
													<td class="client-doc-indent">{getFeTipoDocumentoLabel(nota.tipo_documento)}</td>
													<td class="type-caption" title={nota.clave ?? ''}>{notaNumero(nota)}</td>
													<td>{notaMonto(nota)}</td>
													<td class="type-caption">—</td>
													<td>
														<span class={getFeComprobanteEstadoClass(nota.estado)}>
															{getFeComprobanteEstadoLabel(nota.estado)}
														</span>
													</td>
													<td>{nota.enviado_at ? formatDate(nota.enviado_at) : '—'}</td>
													<td>
														<a href="/admin/facturas/{fac.id}?from=cliente" class="text-link">Ver factura</a>
													</td>
												</tr>
											{/each}
										{/each}
									{/if}
								</tbody>
							{/each}
						</table>
					</div>
					<TablePagination
						page={casosPage}
						pageSize={casosPageSize}
						totalCount={unifiedGroups.length}
						ariaLabel="Paginación de casos y facturas"
						onPageChange={(nextPage) => (casosPage = nextPage)}
						onPageSizeChange={(size) => {
							casosPageSize = size;
							casosPage = 1;
						}}
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
	onDeleted={onCaseDeleted}
	onClose={closeCasePreview}
/>

<InvoicePdfPreview
	bind:open={pdfPreviewOpen}
	invoiceId={pdfPreview?.id ?? ''}
	invoiceNumber={pdfPreview?.number ?? ''}
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

	.client-case-group {
		border-top: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.06));
	}

	.client-doc-row--case {
		background: transparent;
	}

	:global(
		.dash-content .client-cases-table .data-table tbody tr.client-doc-row--invoice.invoice-row--danger
	),
	:global(
		.dash-content .client-cases-table .data-table tbody tr.client-doc-row--invoice.invoice-row--warning
	),
	:global(
		.dash-content .client-cases-table .data-table tbody tr.client-doc-row--invoice.invoice-row--success
	) {
		background: var(--dash-card-solid);
		box-shadow: none;
	}

	:global(
		.dash-content
			.client-cases-table
			.data-table
			tbody
			tr.client-doc-row--invoice.invoice-row--danger:hover
	),
	:global(
		.dash-content
			.client-cases-table
			.data-table
			tbody
			tr.client-doc-row--invoice.invoice-row--warning:hover
	),
	:global(
		.dash-content
			.client-cases-table
			.data-table
			tbody
			tr.client-doc-row--invoice.invoice-row--success:hover
	) {
		background: var(--dash-table-hover);
	}

	:global(
		.dash-content .client-cases-table .data-table tbody tr.client-doc-row--invoice.invoice-row--danger td
	),
	:global(
		.dash-content
			.client-cases-table
			.data-table
			tbody
			tr.client-doc-row--invoice.invoice-row--warning
			td
	),
	:global(
		.dash-content
			.client-cases-table
			.data-table
			tbody
			tr.client-doc-row--invoice.invoice-row--success
			td
	) {
		border-bottom-color: var(--dash-table-row-border);
	}

	.client-doc-row--nota td {
		font-size: 13px;
	}

	.client-doc-indent {
		padding-left: 1.25rem;
	}

	.client-case-fold-all {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-left: auto;
		font-size: 0.8125rem;
		white-space: nowrap;
	}

	.client-case-fold-all button {
		background: none;
		border: 0;
		padding: 0;
		cursor: pointer;
		font: inherit;
	}

	.client-case-id {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}

	:global(.dash-content .data-table tbody tr.client-doc-row--case-toggle) {
		cursor: pointer;
	}

	.client-case-fold {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.5rem;
		height: 1.5rem;
		padding: 0;
		border: 0;
		border-radius: 6px;
		background: transparent;
		color: var(--dash-text, #0f172a);
		cursor: pointer;
		flex: 0 0 auto;
	}

	.client-case-fold:hover {
		background: color-mix(in srgb, var(--dash-text, #0f172a) 8%, transparent);
	}

	.client-case-fold__icon {
		display: inline-flex;
		transition: transform 0.15s ease;
	}

	.client-case-fold__icon--open {
		transform: rotate(90deg);
	}

	.client-case-row-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.65rem 0.9rem;
		align-items: center;
	}

	.client-cobro-form {
		margin: 0;
	}

	.client-cobro-form__select {
		width: 100%;
		min-width: 7.5rem;
		padding: 6px 10px;
		font-size: 13px;
		font-weight: 600;
	}

	:global(.dash-content .client-cobro-form__select.client-cobro-form__select--pendiente) {
		background: color-mix(in srgb, #dc2626 16%, var(--dash-card-solid));
		color: #b91c1c;
		border-color: color-mix(in srgb, #dc2626 45%, var(--dash-border-strong));
	}

	:global(.dash-content .client-cobro-form__select.client-cobro-form__select--facturado) {
		background: color-mix(in srgb, #ca8a04 20%, var(--dash-card-solid));
		color: #a16207;
		border-color: color-mix(in srgb, #ca8a04 50%, var(--dash-border-strong));
	}

	:global(.dash-content .client-cobro-form__select.client-cobro-form__select--pagado) {
		background: color-mix(in srgb, #16a34a 18%, var(--dash-card-solid));
		color: #15803d;
		border-color: color-mix(in srgb, #16a34a 45%, var(--dash-border-strong));
	}

	:global(.dash-content .client-cobro-form__select.client-cobro-form__select--cancelada) {
		background: var(--dash-table-head);
		color: var(--dash-text-secondary);
		border-color: var(--dash-border-strong);
	}

	:global([data-theme='dark'] .dash-content .client-cobro-form__select.client-cobro-form__select--pendiente) {
		color: #fca5a5;
	}

	:global([data-theme='dark'] .dash-content .client-cobro-form__select.client-cobro-form__select--facturado) {
		color: #facc15;
	}

	:global([data-theme='dark'] .dash-content .client-cobro-form__select.client-cobro-form__select--pagado) {
		color: #86efac;
	}

	:global(.dash-content .client-cobro-form__select option[value='pendiente']) {
		background: #fee2e2;
		color: #b91c1c;
	}

	:global(.dash-content .client-cobro-form__select option[value='facturado']) {
		background: #fef3c7;
		color: #a16207;
	}

	:global(.dash-content .client-cobro-form__select option[value='pagado']) {
		background: #dcfce7;
		color: #15803d;
	}

	:global(.dash-content .client-cobro-form__select option[value='cancelada']) {
		background: #f8fafc;
		color: #64748b;
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
