<script lang="ts">
	import { goto } from '$app/navigation';
	import { getEstadoBadgeClass, getEstadoLabel, getTipoTrabajoLabel } from '$lib/lab/constants';
	import {
		deliveryUrgencyClass,
		formatDeliveryCountdown,
		formatTimeOnly
	} from '$lib/lab/helpers';
	import type { LabCase } from '$lib/lab/types';

	interface Props {
		items: LabCase[];
		emptyMessage?: string;
		onCasePreview?: (caso: LabCase) => void;
	}

	let { items, emptyMessage = 'Sin entregas programadas.', onCasePreview }: Props = $props();

	function handleCardClick(caso: LabCase) {
		onCasePreview?.(caso);
	}
</script>

{#if items.length === 0}
	<div class="delivery-calendar__empty">
		<p>{emptyMessage}</p>
	</div>
{:else}
	<ul class="delivery-calendar__agenda">
		{#each items as caso (caso.id)}
			<li class="delivery-calendar__event">
				<div class="delivery-calendar__event-rail">
					<span class="delivery-calendar__event-time">{formatTimeOnly(caso.fecha_entrega)}</span>
					<span class="delivery-calendar__event-line" aria-hidden="true"></span>
				</div>
				<article
					class="delivery-calendar__event-card"
					class:delivery-calendar__event-card--interactive={!!onCasePreview}
					role={onCasePreview ? 'button' : undefined}
					tabindex={onCasePreview ? 0 : undefined}
					onclick={() => handleCardClick(caso)}
					onkeydown={(e) => {
						if (onCasePreview && (e.key === 'Enter' || e.key === ' ')) {
							e.preventDefault();
							handleCardClick(caso);
						}
					}}
				>
					<div class="delivery-calendar__event-head">
						<span class="delivery-calendar__event-case">{caso.case_number}</span>
						<span class={getEstadoBadgeClass(caso.estado)}>{getEstadoLabel(caso.estado)}</span>
					</div>
					<h4 class="delivery-calendar__event-patient">{caso.paciente_name}</h4>
					<p class="delivery-calendar__event-meta">
						{getTipoTrabajoLabel(caso.tipo_trabajo)} · {caso.client_name}
					</p>
					<div class="delivery-calendar__event-foot">
						<span class={deliveryUrgencyClass(caso.fecha_entrega, caso.estado)}>
							{formatDeliveryCountdown(caso.fecha_entrega, caso.estado)}
						</span>
						<button
							type="button"
							class="btn-secondary-pill delivery-calendar__event-btn"
							onclick={(e) => {
								e.stopPropagation();
								if (onCasePreview) {
									handleCardClick(caso);
								} else {
									void goto(`/admin/casos/${caso.id}`);
								}
							}}
						>
							{onCasePreview ? 'Vista previa' : 'Ver caso'}
						</button>
					</div>
				</article>
			</li>
		{/each}
	</ul>
{/if}
