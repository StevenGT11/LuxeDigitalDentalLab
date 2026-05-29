<script lang="ts">
	import { afterNavigate, goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import {
		getCasesByClient,
		getClientId,
		getClientProfile,
		getClientStats,
		initializeLabStorage
	} from '$lib/lab/store';
	import ColoredBarChart from '$lib/components/admin/ColoredBarChart.svelte';
	import { anatomyToChartSegments, getClientAnatomyStats } from '$lib/lab/analytics';
	import { getEstadoBadgeClass, getEstadoLabel, getMaterialLabel, getTipoTrabajoLabel } from '$lib/lab/constants';
	import { formatCurrency, formatDate, formatDateTime } from '$lib/lab/helpers';
	import type { ClientStats, LabCase } from '$lib/lab/types';

	let casos = $state<LabCase[]>([]);
	let stats = $state<ClientStats>({
		totalCasos: 0,
		pendientes: 0,
		enProceso: 0,
		finalizados: 0,
		totalGastado: 0,
		totalPiezas: 0
	});
	let profile = $state(getClientProfile());
	let anatomySegments = $state<ReturnType<typeof anatomyToChartSegments>>([]);
	let savedNotice = $state('');

	function refresh() {
		const id = getClientId();
		profile = getClientProfile();
		casos = getCasesByClient(id);
		stats = getClientStats(id);
		anatomySegments = anatomyToChartSegments(getClientAnatomyStats(casos));
	}

	onMount(() => {
		initializeLabStorage({ linkClientPortal: true });
		refresh();
	});

	afterNavigate(() => {
		refresh();
		const sent = $page.url.searchParams.get('sent');
		if (sent) {
			savedNotice = `Caso ${sent} guardado en localStorage.`;
			goto('/client', { replaceState: true });
		}
	});
</script>

<div class="dash-page">
	{#if savedNotice}
		<div class="alert alert--success">{savedNotice}</div>
	{/if}

	<p class="dash-lead">
		Resumen de tus casos enviados al laboratorio. Todo se guarda en este navegador
		(localStorage) y también lo verás en el panel admin.
	</p>

	<section class="dash-panel" style="margin-bottom: 1.25rem;">
		<div
			style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1.25rem;"
		>
			<div style="display: flex; align-items: center; gap: 1.25rem;">
				<div class="avatar">{(profile.nombre || 'C').charAt(0).toUpperCase()}</div>
				<div>
					<h2 class="dash-panel__title" style="margin: 0; font-size: 1.35rem;">
						{profile.nombre || 'Mi perfil'}
					</h2>
					<p class="dash-lead" style="margin: 0.35rem 0 0;">
						{profile.clinica || 'Completa tu perfil para identificar tus casos'}
					</p>
					{#if profile.email}
						<p class="type-fine-print" style="margin: 0.35rem 0 0;">{profile.email}</p>
					{/if}
				</div>
			</div>
			<div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
				<button type="button" class="btn-secondary-pill" onclick={() => goto('/client/perfil')}>
					Editar perfil
				</button>
				<button type="button" class="btn-primary" onclick={() => goto('/client/nuevo')}>
					Enviar caso
				</button>
			</div>
		</div>
	</section>

	<section class="dash-stat-grid dash-stat-grid--compact">
		<div class="dash-stat">
			<p class="dash-stat__label">Casos enviados</p>
			<p class="dash-stat__value">{stats.totalCasos}</p>
		</div>
		<div class="dash-stat">
			<p class="dash-stat__label">Pendientes</p>
			<p class="dash-stat__value">{stats.pendientes}</p>
		</div>
		<div class="dash-stat">
			<p class="dash-stat__label">En proceso</p>
			<p class="dash-stat__value">{stats.enProceso}</p>
		</div>
		<div class="dash-stat">
			<p class="dash-stat__label">Total gastado</p>
			<p class="dash-stat__value dash-stat__value--currency">
				{formatCurrency(stats.totalGastado)}
			</p>
		</div>
	</section>

	{#if anatomySegments.length > 0}
		<section class="dash-panel dash-panel--section" style="margin-bottom: 1.25rem;">
			<h2 class="dash-panel__section-title">Tus piezas por tipo dental</h2>
			<p class="dash-panel__subtitle" style="margin: -0.35rem 0 1rem;">
				Cuántas incisivos, molares, etc. has enviado al laboratorio
			</p>
			<ColoredBarChart segments={anatomySegments} suffix=" pzs" />
		</section>
	{/if}

	<section>
		<div
			style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 1rem;"
		>
			<h2 class="dash-panel__title" style="margin: 0;">Historial de casos</h2>
			<span class="type-fine-print">{casos.length} caso(s)</span>
		</div>

		{#if casos.length === 0}
			<div class="dash-panel empty-state">
				<p>Aún no has enviado ningún caso</p>
				<button type="button" class="btn-primary" onclick={() => goto('/client/nuevo')}>
					Enviar primer caso
				</button>
			</div>
		{:else}
			<div class="data-table-wrap">
				<table class="data-table">
					<thead>
						<tr>
							<th>Número</th>
							<th>Paciente</th>
							<th>Trabajo</th>
							<th>Piezas</th>
							<th>Costo</th>
							<th>Estado</th>
							<th>Entrega</th>
						</tr>
					</thead>
					<tbody>
						{#each casos as caso}
							<tr>
								<td><span class="type-body-strong">{caso.case_number}</span></td>
								<td>{caso.paciente_name}</td>
								<td>
									{getTipoTrabajoLabel(caso.tipo_trabajo)}
									{#if caso.material}
										<br /><span class="type-fine-print">{getMaterialLabel(caso.material)}</span>
									{/if}
								</td>
								<td>{caso.piezas}</td>
								<td><span class="type-body-strong">{formatCurrency(caso.costo)}</span></td>
								<td>
									<span class={getEstadoBadgeClass(caso.estado)}>
										{getEstadoLabel(caso.estado)}
									</span>
								</td>
								<td class="type-caption">{formatDateTime(caso.fecha_entrega)}</td>
							</tr>
						{/each}
					</tbody>
					<tfoot>
						<tr>
							<td colspan="4" style="text-align: right;">Total acumulado</td>
							<td>{formatCurrency(stats.totalGastado)}</td>
							<td colspan="2"></td>
						</tr>
					</tfoot>
				</table>
			</div>
		{/if}
	</section>
</div>
