<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { canViewFinancial } from '$lib/auth/roles';
	import {
		getCaseByIdAsync,
		getInvoiceByCaseIdAsync,
		hydrateLabDataOnce,
		updateCaseCost,
		updateCaseStatus
	} from '$lib/lab/store';
	import {
		ESTADOS,
		getEstadoBadgeClass,
		getEstadoLabel,
		getInvoiceEstadoClass,
		getInvoiceEstadoLabel,
		getMaterialLabel,
		getCaseItemTipoLabel
	} from '$lib/lab/constants';
	import VitaColorChip from '$lib/components/admin/VitaColorChip.svelte';
	import CaseFilesList from '$lib/components/lab/CaseFilesList.svelte';
	import { getAnatomyLabel } from '$lib/lab/teeth';
	import { formatCurrency, formatDateTime } from '$lib/lab/helpers';
	import type { Invoice, LabCase, LabCaseEstado } from '$lib/lab/types';
	import { requestCaseFinalizedClientNotification } from '$lib/lab/notify-client';

	let caseId = $derived($page.params.caseId);
	let caso = $state<LabCase | null>(null);
	let factura = $state<Invoice | null>(null);
	let costoEdit = $state(0);

	const estadosAdmin = ESTADOS.filter((e) => e.value !== 'todos');

	let showFinancial = $derived(canViewFinancial($page.data.staffRole ?? $page.data.profile?.role));

	onMount(async () => {
		await hydrateLabDataOnce();
		await loadCase();
	});

	async function loadCase() {
		caso = await getCaseByIdAsync(caseId);
		if (caso) {
			costoEdit = caso.costo;
			if (showFinancial) {
				factura = await getInvoiceByCaseIdAsync(caso.id);
			}
		}
	}

	async function handleStatusChange(estado: string) {
		if (!caso) return;
		const prevEstado = caso.estado;
		const updated = await updateCaseStatus(caso.id, estado as LabCaseEstado);
		if (updated) {
			caso = updated;
			if (prevEstado !== 'finalizado' && updated.estado === 'finalizado') {
				requestCaseFinalizedClientNotification(updated.id);
			}
		}
	}

	async function saveCost() {
		if (!caso) return;
		const updated = await updateCaseCost(caso.id, costoEdit);
		if (updated) caso = updated;
	}
</script>

<div class="dash-page">
	<button type="button" class="text-link dash-back" onclick={() => goto('/admin/casos')}>
		← Volver a casos
	</button>

	{#if !caso}
		<div class="dash-panel empty-state">
			<p>Caso no encontrado</p>
		</div>
	{:else}
		<header class="case-detail-header admin-page__header">
			<div>
				<p class="case-detail-header__eyebrow">Caso</p>
				<h2 class="case-detail-header__number">{caso.case_number}</h2>
				<p class="case-detail-header__patient">{caso.paciente_name}</p>
			</div>
			<div class="case-detail-header__actions">
				<span class={getEstadoBadgeClass(caso.estado)}>{getEstadoLabel(caso.estado)}</span>
				<select
					class="field-select case-detail-header__select"
					value={caso.estado}
					onchange={(e) => handleStatusChange(e.currentTarget.value)}
				>
					{#each estadosAdmin as e}
						<option value={e.value}>{e.label}</option>
					{/each}
				</select>
			</div>
		</header>

		<section class="dash-panel dash-panel--section" style="margin-top: 1rem;">
			<h3 class="dash-panel__section-title">Cliente</h3>
			<div class="detail-grid">
				<div>
					<p class="detail-item__label">Nombre</p>
					<p class="detail-item__value">
						<a href="/admin/clientes/{caso.client_id}" class="text-link">{caso.client_name}</a>
					</p>
				</div>
				<div>
					<p class="detail-item__label">Clínica</p>
					<p class="detail-item__value">{caso.client_clinica}</p>
				</div>
				<div>
					<p class="detail-item__label">Doctor</p>
					<p class="detail-item__value">{caso.doctor_name}</p>
				</div>
			</div>
		</section>

		<section class="dash-panel dash-panel--section" style="margin-top: 1rem;">
			<h3 class="dash-panel__section-title">Ítems del caso</h3>
			<div class="data-table-wrap">
				<table class="data-table">
					<thead>
						<tr>
							<th>Dientes</th>
							<th>Grupo</th>
							<th>Tipo</th>
							<th>Material</th>
							<th>Color</th>
							<th>Servicios</th>
							<th>Implante</th>
							<th>Cant.</th>
							{#if showFinancial}
								<th>P. unit.</th>
								<th>Subtotal</th>
							{/if}
						</tr>
					</thead>
					<tbody>
						{#each caso.items as item}
							<tr>
								<td>
									{#if item.numero_pieza}
										<span class="work-tag work-tag--pieza">#{item.numero_pieza}</span>
									{:else}
										—
									{/if}
								</td>
								<td>
									{#if item.tipo_pieza}
										<span class="work-tag work-tag--anatomy work-tag--anatomy-{item.tipo_pieza}">
											{getAnatomyLabel(item.tipo_pieza)}
										</span>
									{:else}
										—
									{/if}
								</td>
								<td class="type-body-strong">{getCaseItemTipoLabel(item)}</td>
								<td>{getMaterialLabel(item.material)}</td>
								<td>
									{#if item.color}
										<VitaColorChip shade={item.color} />
									{:else}
										—
									{/if}
								</td>
								<td>
									<div class="item-services-inline">
										{#if item.incluye_diseno}
											<span class="work-tag work-tag--servicio work-tag--diseno">Diseño</span>
										{/if}
										{#if item.incluye_fresado}
											<span class="work-tag work-tag--servicio work-tag--fresado">Fresado</span>
										{/if}
										{#if item.corona_sobre_implante}
											<span class="work-tag work-tag--servicio work-tag--implante">Sobre implante</span>
										{/if}
										{#if !item.incluye_diseno && !item.incluye_fresado && !item.corona_sobre_implante}
											—
										{/if}
									</div>
								</td>
								<td>
									{#if item.corona_sobre_implante}
										<div class="implante-detail-cell">
											{#if item.implante_marca}
												<p class="implante-detail-cell__line">
													<span class="type-fine-print">Marca</span>
													<span>{item.implante_marca}</span>
												</p>
											{/if}
											{#if item.implante_plataforma}
												<p class="implante-detail-cell__line">
													<span class="type-fine-print">Plataforma</span>
													<span>{item.implante_plataforma}</span>
												</p>
											{/if}
											{#if !item.implante_marca && !item.implante_plataforma}
												<span class="type-caption">Sin datos</span>
											{/if}
										</div>
									{:else}
										—
									{/if}
								</td>
								<td>{item.piezas}</td>
								{#if showFinancial}
									<td>{formatCurrency(item.unit_price)}</td>
									<td class="type-body-strong">{formatCurrency(item.subtotal)}</td>
								{/if}
							</tr>
						{/each}
					</tbody>
					{#if showFinancial}
						<tfoot>
							<tr>
								<td colspan="9">Total caso</td>
								<td>{formatCurrency(caso.costo)}</td>
							</tr>
						</tfoot>
					{/if}
				</table>
			</div>
			<p class="type-caption" style="margin-top: var(--spacing-md);">
				Creado: {formatDateTime(caso.fecha_creacion)} · Entrega: {formatDateTime(caso.fecha_entrega)}
			</p>
			{#if caso.notas}
				<p class="type-body" style="margin-top: var(--spacing-sm);"><strong>Notas:</strong> {caso.notas}</p>
			{/if}
		</section>

		<section class="dash-panel dash-panel--section" style="margin-top: 1rem;">
			<h3 class="dash-panel__section-title">Escaneos y diseños</h3>
			<CaseFilesList
				archivos={caso.archivos}
				emptyMessage="El cliente no adjuntó archivos al enviar este caso."
			/>
		</section>

		{#if showFinancial}
			<section class="dash-panel dash-panel--section" style="margin-top: 1rem;">
				<h3 class="dash-panel__section-title">Costo</h3>
				<div style="display: flex; flex-wrap: wrap; align-items: flex-end; gap: var(--spacing-md);">
					<div style="flex: 1; min-width: 140px;">
						<label class="field-label" for="costo">Monto total (USD)</label>
						<input id="costo" class="field-input" type="number" min="0" step="0.01" bind:value={costoEdit} />
					</div>
					<button type="button" class="btn-primary" onclick={saveCost}>Guardar costo</button>
				</div>
			</section>

			{#if factura}
				<section class="dash-panel dash-panel--section" style="margin-top: 1rem;">
					<h3 class="dash-panel__section-title">Factura vinculada</h3>
					<div class="detail-grid">
						<div>
							<p class="detail-item__label">Número</p>
							<p class="detail-item__value">{factura.invoice_number}</p>
						</div>
						<div>
							<p class="detail-item__label">Estado</p>
							<p class="detail-item__value">
								<span class={getInvoiceEstadoClass(factura.estado)}>
									{getInvoiceEstadoLabel(factura.estado)}
								</span>
							</p>
						</div>
						<div>
							<p class="detail-item__label">Total</p>
							<p class="detail-item__value">{formatCurrency(factura.total)}</p>
						</div>
					</div>
					<a href="/admin/facturas" class="text-link" style="display: inline-block; margin-top: var(--spacing-md);">
						Ver todas las facturas →
					</a>
				</section>
			{/if}
		{/if}
	{/if}
</div>
