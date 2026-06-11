<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import CaseWorkTags from '$lib/components/admin/CaseWorkTags.svelte';
	import EstadoProgress from '$lib/components/admin/EstadoProgress.svelte';
	import { canViewFinancial } from '$lib/auth/roles';
	import { getEstadoBadgeClass, getEstadoLabel } from '$lib/lab/constants';
	import {
		deliveryUrgencyClass,
		formatCurrency,
		formatDateTime,
		formatDeliveryCountdown
	} from '$lib/lab/helpers';
	import type { LabCase } from '$lib/lab/types';
	import { ArrowRight, X } from '@lucide/svelte';

	interface Props {
		caso: LabCase | null;
		onClose: () => void;
	}

	let { caso, onClose }: Props = $props();

	let showFinancial = $derived(canViewFinancial($page.data.staffRole ?? $page.data.profile?.role));

	const modalTitleId = 'case-preview-title';

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}

	function goToCase() {
		if (!caso) return;
		void goto(`/admin/casos/${caso.id}`);
	}
</script>

<svelte:window onkeydown={caso ? onKeydown : undefined} />

{#if caso}
	<div class="case-file-modal__backdrop" onclick={onClose} role="presentation"></div>
	<div
		class="case-file-modal case-preview-modal"
		role="dialog"
		aria-modal="true"
		aria-labelledby={modalTitleId}
	>
		<header class="case-file-modal__header">
			<div>
				<p class="case-file-modal__eyebrow">Vista previa</p>
				<h3 class="case-file-modal__title" id={modalTitleId}>{caso.case_number}</h3>
			</div>
			<button type="button" class="case-file-modal__close" aria-label="Cerrar" onclick={onClose}>
				<X size={18} />
			</button>
		</header>

		<div class="case-file-modal__body case-preview-modal__body">
			<div class="case-preview-modal__head">
				<h4 class="case-preview-modal__patient">{caso.paciente_name}</h4>
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

			<CaseWorkTags
				items={caso.items}
				fallback={{
					tipo_trabajo: caso.tipo_trabajo,
					material: caso.material,
					color: caso.color,
					piezas: caso.piezas
				}}
			/>

			<EstadoProgress estado={caso.estado} compact />

			{#if caso.notas?.trim()}
				<p class="case-preview-modal__notes">{caso.notas}</p>
			{/if}
		</div>

		<footer class="case-file-modal__footer case-preview-modal__footer">
			<button type="button" class="btn-pearl-capsule" onclick={onClose}>Cerrar</button>
			<button type="button" class="btn-primary case-preview-modal__go" onclick={goToCase}>
				Ir al caso
				<ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
			</button>
		</footer>
	</div>
{/if}
