<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import CaseWorkTags from '$lib/components/admin/CaseWorkTags.svelte';
	import EstadoProgress from '$lib/components/admin/EstadoProgress.svelte';
	import VitaColorChip from '$lib/components/admin/VitaColorChip.svelte';
	import CaseFilesList from '$lib/components/lab/CaseFilesList.svelte';
	import { canViewFinancial } from '$lib/auth/roles';
	import {
		ESTADOS,
		getCaseItemTipoLabel,
		getEstadoBadgeClass,
		getEstadoLabel,
		getInvoiceEstadoClass,
		getInvoiceEstadoLabel,
		getMaterialLabel,
		isRestauracionTipoTrabajo
	} from '$lib/lab/constants';
	import { formatImplantCrownDetails } from '$lib/lab/implant-crown';
	import {
		deliveryUrgencyClass,
		formatCurrency,
		formatDateTime,
		formatDeliveryCountdown,
		formatLastEditedLine
	} from '$lib/lab/helpers';
	import { getInvoiceByCaseIdAsync, updateCaseStatus } from '$lib/lab/store';
	import type { Invoice, LabCase, LabCaseEstado } from '$lib/lab/types';
	import { requestCaseFinalizedClientNotification } from '$lib/lab/notify-client';
	import { ArrowRight, X } from '@lucide/svelte';

	interface Props {
		caso: LabCase | null;
		detailed?: boolean;
		returnToClient?: boolean;
		onUpdated?: (caso: LabCase) => void;
		onClose: () => void;
	}

	let { caso, detailed = false, returnToClient = false, onUpdated, onClose }: Props = $props();

	let showFinancial = $derived(canViewFinancial($page.data.staffRole ?? $page.data.profile?.role));
	let factura = $state<Invoice | null>(null);
	let saved = $state<LabCase | null>(null);
	let view = $derived(saved && caso && saved.id === caso.id ? saved : caso);
	const estadosAdmin = ESTADOS.filter((estado) => estado.value !== 'todos');

	const modalTitleId = 'case-preview-title';

	$effect(() => {
		const current = view;
		if (!current || !detailed || !showFinancial) {
			factura = null;
			return;
		}
		let cancelled = false;
		void getInvoiceByCaseIdAsync(current.id).then((result) => {
			if (!cancelled) factura = result;
		});
		return () => {
			cancelled = true;
		};
	});

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}

	function goToCase() {
		if (!view) return;
		const from = returnToClient ? '?from=cliente' : '';
		void goto(`/admin/casos/${view.id}${from}`);
	}

	async function handleStatusChange(estado: string) {
		if (!view) return;
		const prevEstado = view.estado;
		const updated = await updateCaseStatus(view.id, estado as LabCaseEstado);
		if (!updated) return;
		saved = updated;
		if (prevEstado !== 'finalizado' && updated.estado === 'finalizado') {
			requestCaseFinalizedClientNotification(updated.id);
		}
		onUpdated?.(updated);
	}

	function teethLabel(item: LabCase['items'][number]): string {
		if (item.piezas_dentales?.length) return item.piezas_dentales.join(', ');
		if (item.numero_pieza) return item.numero_pieza;
		return '—';
	}
</script>

<svelte:window onkeydown={view ? onKeydown : undefined} />

{#if view}
	<div class="case-file-modal__backdrop" onclick={onClose} role="presentation"></div>
	<div
		class="case-file-modal case-preview-modal"
		class:case-preview-modal--detail={detailed}
		role="dialog"
		aria-modal="true"
		aria-labelledby={modalTitleId}
	>
		<header class="case-file-modal__header">
			<div>
				<p class="case-file-modal__eyebrow">{detailed ? 'Detalle del caso' : 'Vista previa'}</p>
				<h3 class="case-file-modal__title" id={modalTitleId}>{view.case_number}</h3>
			</div>
			<button type="button" class="case-file-modal__close" aria-label="Cerrar" onclick={onClose}>
				<X size={18} />
			</button>
		</header>

		<div class="case-file-modal__body case-preview-modal__body">
			<div class="case-preview-modal__head">
				<div>
					<h4 class="case-preview-modal__patient">{view.paciente_name}</h4>
					{#if detailed && formatLastEditedLine(view)}
						<p class="case-preview-modal__edited type-fine-print">{formatLastEditedLine(view)}</p>
					{/if}
				</div>
				<div class="case-preview-modal__status">
					<span class={getEstadoBadgeClass(view.estado)}>{getEstadoLabel(view.estado)}</span>
					<select
						class="field-select case-preview-modal__status-select"
						aria-label="Estado del caso"
						value={view.estado}
						onchange={(e) => handleStatusChange(e.currentTarget.value)}
					>
						{#each estadosAdmin as estado (estado.value)}
							<option value={estado.value}>{estado.label}</option>
						{/each}
					</select>
				</div>
			</div>

			<dl class="case-preview-modal__meta">
				<div class="case-preview-modal__row">
					<dt>Cliente</dt>
					<dd>{view.client_name}{view.client_clinica ? ` · ${view.client_clinica}` : ''}</dd>
				</div>
				<div class="case-preview-modal__row">
					<dt>Doctor</dt>
					<dd>{view.doctor_name}</dd>
				</div>
				<div class="case-preview-modal__row">
					<dt>Entrega</dt>
					<dd>{formatDateTime(view.fecha_entrega)}</dd>
				</div>
				{#if detailed}
					<div class="case-preview-modal__row">
						<dt>Creado</dt>
						<dd>{formatDateTime(view.fecha_creacion)}</dd>
					</div>
				{/if}
				{#if showFinancial}
					<div class="case-preview-modal__row">
						<dt>Costo</dt>
						<dd>{formatCurrency(view.costo)}</dd>
					</div>
				{/if}
			</dl>

			<span class={deliveryUrgencyClass(view.fecha_entrega, view.estado)}>
				{formatDeliveryCountdown(view.fecha_entrega, view.estado)}
			</span>

			{#if detailed}
				<section class="case-preview-modal__section">
					<h5 class="case-preview-modal__section-title">Ítems del caso</h5>
					<div class="data-table-wrap case-preview-modal__table-wrap">
						<table class="data-table">
							<thead>
								<tr>
									<th>Dientes</th>
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
								{#each view.items as item (item.id)}
									<tr>
										<td>{teethLabel(item)}</td>
										<td class="type-body-strong">{getCaseItemTipoLabel(item)}</td>
										<td>{getMaterialLabel(item.material, item.tipo_trabajo)}</td>
										<td>
											{#if item.color}
												<VitaColorChip shade={item.color} />
											{:else}
												—
											{/if}
										</td>
										<td>
											<div class="item-services-inline">
												{#if !isRestauracionTipoTrabajo(item.tipo_trabajo) && item.incluye_diseno}
													<span class="work-tag work-tag--servicio work-tag--diseno">Diseño</span>
												{/if}
												{#if !isRestauracionTipoTrabajo(item.tipo_trabajo) && item.incluye_fresado}
													<span class="work-tag work-tag--servicio work-tag--fresado">Fresado</span>
												{/if}
												{#if item.corona_sobre_implante}
													<span class="work-tag work-tag--servicio work-tag--implante">Sobre implante</span>
												{/if}
												{#if !isRestauracionTipoTrabajo(item.tipo_trabajo) && !item.incluye_diseno && !item.incluye_fresado && !item.corona_sobre_implante}
													—
												{/if}
											</div>
										</td>
										<td>
											{#if item.corona_sobre_implante}
												{@const implanteNotas = formatImplantCrownDetails(item)}
												{#if implanteNotas}
													<p class="implante-detail-cell__line">{implanteNotas}</p>
												{:else}
													<span class="type-caption">Sin datos</span>
												{/if}
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
										<td colspan="8">Total caso</td>
										<td>{formatCurrency(view.costo)}</td>
									</tr>
								</tfoot>
							{/if}
						</table>
					</div>
				</section>

				<section class="case-preview-modal__section">
					<h5 class="case-preview-modal__section-title">Escaneos y diseños</h5>
					<CaseFilesList
						archivos={view.archivos}
						emptyMessage="El cliente no adjuntó archivos al enviar este view."
					/>
				</section>

				{#if showFinancial && factura}
					<section class="case-preview-modal__section">
						<h5 class="case-preview-modal__section-title">Factura vinculada</h5>
						<dl class="case-preview-modal__meta case-preview-modal__meta--invoice">
							<div class="case-preview-modal__row">
								<dt>Número</dt>
								<dd>
									<a href="/admin/facturas/{factura.id}?from=caso{returnToClient ? '&client=1' : ''}" class="text-link">{factura.invoice_number}</a>
								</dd>
							</div>
							<div class="case-preview-modal__row">
								<dt>Estado</dt>
								<dd>
									<span class={getInvoiceEstadoClass(factura.estado)}>
										{getInvoiceEstadoLabel(factura.estado)}
									</span>
								</dd>
							</div>
							<div class="case-preview-modal__row">
								<dt>Total</dt>
								<dd>{formatCurrency(factura.total)}</dd>
							</div>
						</dl>
					</section>
				{/if}
			{:else}
				<CaseWorkTags
					items={view.items}
					fallback={{
						tipo_trabajo: view.tipo_trabajo,
						material: view.material,
						color: view.color,
						piezas: view.piezas
					}}
				/>
			{/if}

			<EstadoProgress estado={view.estado} compact />

			{#if view.notas?.trim()}
				<p class="case-preview-modal__notes"><strong>Notas:</strong> {view.notas}</p>
			{/if}
		</div>

		<footer class="case-file-modal__footer case-preview-modal__footer">
			<button type="button" class="btn-pearl-capsule" onclick={onClose}>Cerrar</button>
			<button type="button" class="btn-primary case-preview-modal__go" onclick={goToCase}>
				{detailed ? 'Abrir caso completo' : 'Ir al caso'}
				<ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
			</button>
		</footer>
	</div>
{/if}
