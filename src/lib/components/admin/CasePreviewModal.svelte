<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import CaseWorkTags from '$lib/components/admin/CaseWorkTags.svelte';
	import EstadoProgress from '$lib/components/admin/EstadoProgress.svelte';
	import VitaColorChip from '$lib/components/admin/VitaColorChip.svelte';
	import CaseFilesList from '$lib/components/lab/CaseFilesList.svelte';
	import { canViewFinancial } from '$lib/auth/roles';
	import {
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
	import { getInvoiceByCaseIdAsync } from '$lib/lab/store';
	import type { Invoice, LabCase } from '$lib/lab/types';
	import { ArrowRight, X } from '@lucide/svelte';

	interface Props {
		caso: LabCase | null;
		detailed?: boolean;
		onClose: () => void;
	}

	let { caso, detailed = false, onClose }: Props = $props();

	let showFinancial = $derived(canViewFinancial($page.data.staffRole ?? $page.data.profile?.role));
	let factura = $state<Invoice | null>(null);

	const modalTitleId = 'case-preview-title';

	$effect(() => {
		if (!caso || !detailed || !showFinancial) {
			factura = null;
			return;
		}
		let cancelled = false;
		void getInvoiceByCaseIdAsync(caso.id).then((result) => {
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
		if (!caso) return;
		void goto(`/admin/casos/${caso.id}`);
	}

	function teethLabel(item: LabCase['items'][number]): string {
		if (item.piezas_dentales?.length) return item.piezas_dentales.join(', ');
		if (item.numero_pieza) return item.numero_pieza;
		return '—';
	}
</script>

<svelte:window onkeydown={caso ? onKeydown : undefined} />

{#if caso}
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
				<h3 class="case-file-modal__title" id={modalTitleId}>{caso.case_number}</h3>
			</div>
			<button type="button" class="case-file-modal__close" aria-label="Cerrar" onclick={onClose}>
				<X size={18} />
			</button>
		</header>

		<div class="case-file-modal__body case-preview-modal__body">
			<div class="case-preview-modal__head">
				<div>
					<h4 class="case-preview-modal__patient">{caso.paciente_name}</h4>
					{#if detailed && formatLastEditedLine(caso)}
						<p class="case-preview-modal__edited type-fine-print">{formatLastEditedLine(caso)}</p>
					{/if}
				</div>
				<span class={getEstadoBadgeClass(caso.estado)}>{getEstadoLabel(caso.estado)}</span>
			</div>

			<dl class="case-preview-modal__meta">
				<div class="case-preview-modal__row">
					<dt>Cliente</dt>
					<dd>{caso.client_name}{caso.client_clinica ? ` · ${caso.client_clinica}` : ''}</dd>
				</div>
				<div class="case-preview-modal__row">
					<dt>Doctor</dt>
					<dd>{caso.doctor_name}</dd>
				</div>
				<div class="case-preview-modal__row">
					<dt>Entrega</dt>
					<dd>{formatDateTime(caso.fecha_entrega)}</dd>
				</div>
				{#if detailed}
					<div class="case-preview-modal__row">
						<dt>Creado</dt>
						<dd>{formatDateTime(caso.fecha_creacion)}</dd>
					</div>
				{/if}
				{#if showFinancial}
					<div class="case-preview-modal__row">
						<dt>Costo</dt>
						<dd>{formatCurrency(caso.costo)}</dd>
					</div>
				{/if}
			</dl>

			<span class={deliveryUrgencyClass(caso.fecha_entrega, caso.estado)}>
				{formatDeliveryCountdown(caso.fecha_entrega, caso.estado)}
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
								{#each caso.items as item (item.id)}
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
										<td>{formatCurrency(caso.costo)}</td>
									</tr>
								</tfoot>
							{/if}
						</table>
					</div>
				</section>

				<section class="case-preview-modal__section">
					<h5 class="case-preview-modal__section-title">Escaneos y diseños</h5>
					<CaseFilesList
						archivos={caso.archivos}
						emptyMessage="El cliente no adjuntó archivos al enviar este caso."
					/>
				</section>

				{#if showFinancial && factura}
					<section class="case-preview-modal__section">
						<h5 class="case-preview-modal__section-title">Factura vinculada</h5>
						<dl class="case-preview-modal__meta case-preview-modal__meta--invoice">
							<div class="case-preview-modal__row">
								<dt>Número</dt>
								<dd>{factura.invoice_number}</dd>
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
					items={caso.items}
					fallback={{
						tipo_trabajo: caso.tipo_trabajo,
						material: caso.material,
						color: caso.color,
						piezas: caso.piezas
					}}
				/>
			{/if}

			<EstadoProgress estado={caso.estado} compact />

			{#if caso.notas?.trim()}
				<p class="case-preview-modal__notes"><strong>Notas:</strong> {caso.notas}</p>
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
