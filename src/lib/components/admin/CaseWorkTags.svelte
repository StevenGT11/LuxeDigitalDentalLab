<script lang="ts">
	import { getCaseItemTipoLabel, getMaterialLabel } from '$lib/lab/constants';
	import { formatImplantCrownDetails } from '$lib/lab/implant-crown';
	import type { CaseItem } from '$lib/lab/types';
	import { getMaterialColor, getTipoColor } from '$lib/lab/visual';
	import VitaColorChip from './VitaColorChip.svelte';

	interface Props {
		items: CaseItem[];
		/** Fallback cuando el caso no tiene items[] */
		fallback?: {
			tipo_trabajo: string;
			material: string | null;
			color: string | null;
			piezas: number;
		};
		/** Resumen compacto: solo material y tono VITA */
		variant?: 'full' | 'minimal';
	}

	let { items, fallback, variant = 'full' }: Props = $props();

	const rows = $derived(
		items.length > 0
			? items
			: fallback
				? [
						{
							id: 'legacy',
							case_id: '',
							numero_pieza: null,
							piezas_dentales: [],
							tipo_pieza: null,
							tipo_trabajo: fallback.tipo_trabajo,
							material: fallback.material,
							color: fallback.color,
							piezas: fallback.piezas,
							descripcion: null,
							incluye_diseno: true,
							incluye_fresado: true,
							unit_price: 0,
							subtotal: 0
						}
					]
				: []
	);
</script>

<ul class="case-work-tags">
	{#each rows as item (item.id)}
		<li class="case-work-tags__item">
			{#if variant === 'full'}
				{#if item.numero_pieza || item.piezas_dentales?.length}
					<span class="work-tag work-tag--pieza" title="Dientes FDI">
						#{item.numero_pieza ?? item.piezas_dentales.join(', ')}
					</span>
				{/if}
				<span
					class="work-tag work-tag--tipo"
					style="--tag-color: {getTipoColor(item.tipo_trabajo)}"
				>
					{getCaseItemTipoLabel(item)}
					<span class="work-tag__qty">×{item.piezas}</span>
				</span>
				{#if item.incluye_diseno}
					<span class="work-tag work-tag--servicio work-tag--diseno">Diseño</span>
				{/if}
				{#if item.incluye_fresado}
					<span class="work-tag work-tag--servicio work-tag--fresado">Fresado</span>
				{/if}
				{#if item.corona_sobre_implante}
					<span class="work-tag work-tag--servicio work-tag--implante">Sobre implante</span>
					{@const implanteNotas = formatImplantCrownDetails(item)}
					{#if implanteNotas}
						<span class="work-tag work-tag--implante-detail" title="Datos del implante">
							{implanteNotas}
						</span>
					{/if}
				{/if}
			{/if}
			{#if item.material}
				<span
					class="work-tag work-tag--material"
					style="--tag-color: {getMaterialColor(item.material)}"
				>
					{getMaterialLabel(item.material)}
				</span>
			{/if}
			{#if item.color}
				<VitaColorChip shade={item.color} />
			{/if}
			{#if variant === 'full' && item.descripcion}
				<span class="case-work-tags__desc">{item.descripcion}</span>
			{/if}
		</li>
	{/each}
</ul>
