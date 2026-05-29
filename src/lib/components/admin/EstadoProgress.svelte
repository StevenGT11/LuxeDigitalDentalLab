<script lang="ts">
	import { ESTADOS, getEstadoLabel } from '$lib/lab/constants';
	import type { LabCaseEstado } from '$lib/lab/types';
	import { ESTADO_ORDER, getEstadoColor } from '$lib/lab/visual';

	interface Props {
		estado: LabCaseEstado;
		compact?: boolean;
	}

	let { estado, compact = false }: Props = $props();

	const currentIdx = $derived(ESTADO_ORDER.indexOf(estado));
	const steps = $derived(
		ESTADOS.filter((e) => e.value !== 'todos').map((e) => ({
			value: e.value as LabCaseEstado,
			label: e.label,
			color: getEstadoColor(e.value as LabCaseEstado)
		}))
	);
</script>

<div class="estado-progress" class:estado-progress--compact={compact}>
	<div class="estado-progress__track" role="list" aria-label="Progreso: {getEstadoLabel(estado)}">
		{#each steps as step, i}
			<span
				role="listitem"
				class="estado-progress__step"
				class:estado-progress__step--done={i < currentIdx}
				class:estado-progress__step--current={i === currentIdx}
				style="--step-color: {step.color}"
				title={step.label}
			></span>
		{/each}
	</div>
	{#if !compact}
		<p class="estado-progress__label">{getEstadoLabel(estado)}</p>
	{/if}
</div>
