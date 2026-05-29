<script lang="ts">
	import type { ShadeStat } from '$lib/lab/analytics';

	interface Props {
		shades: ShadeStat[];
		limit?: number;
	}

	let { shades, limit = 10 }: Props = $props();

	const rows = $derived.by(() => {
		const top = shades.slice(0, limit);
		const max = Math.max(...top.map((s) => s.piezas), 1);
		return top.map((s) => ({
			...s,
			pct: Math.round((s.piezas / max) * 100),
			series: vitaSeries(s.shade),
			isBleach: s.shade.startsWith('BL')
		}));
	});

	const totalPiezas = $derived(rows.reduce((sum, r) => sum + r.piezas, 0));

	function vitaSeries(shade: string): string {
		if (shade.startsWith('BL')) return 'Bleach';
		const letter = shade.charAt(0);
		if (letter === 'A' || letter === 'B' || letter === 'C' || letter === 'D') {
			return `Serie ${letter}`;
		}
		return 'VITA';
	}
</script>

{#if rows.length === 0}
	<p class="type-caption">Sin tonos registrados</p>
{:else}
	<div class="vita-shades-panel" role="list" aria-label="Tonos VITA más pedidos">
		{#each rows as row, i}
			<article class="vita-shades-panel__row" role="listitem">
				<span class="vita-shades-panel__rank" aria-hidden="true">{i + 1}</span>

				<div
					class="vita-shades-panel__swatch"
					class:vita-shades-panel__swatch--bleach={row.isBleach}
					style="--vita-hex: {row.hex}"
					title="Muestra {row.shade}"
				>
					<span class="vita-shades-panel__swatch-fill"></span>
				</div>

				<div class="vita-shades-panel__body">
					<div class="vita-shades-panel__head">
						<div class="vita-shades-panel__meta">
							<span class="vita-shades-panel__code">{row.shade}</span>
							<span class="vita-shades-panel__series">{row.series}</span>
						</div>
						<span class="vita-shades-panel__count">
							{row.piezas}
							<span class="vita-shades-panel__count-unit">pzs</span>
						</span>
					</div>
					<div class="vita-shades-panel__track" aria-hidden="true">
						<div class="vita-shades-panel__fill" style="width: {row.pct}%"></div>
					</div>
				</div>
			</article>
		{/each}
	</div>

	<p class="vita-shades-panel__footnote">
		{rows.length} tonos · {totalPiezas} piezas en total
	</p>
{/if}
