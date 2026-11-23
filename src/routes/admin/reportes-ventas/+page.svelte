<script lang="ts">
	import { resolve } from '$app/paths';
	import { formatDate } from '$lib/lab/helpers';
	import { getInvoiceEstadoLabel } from '$lib/lab/invoice-estado';
	import {
		MONTH_NAMES_FULL,
		formatSalesMoney,
		salesReportPeriodLabel,
		salesReportToSheetRows,
		salesReportTotalCount
	} from '$lib/lab/sales-report';
	import { Download } from '@lucide/svelte';

	let { data } = $props();

	let year = $derived(data.year);
	let month = $derived(data.month);
	let feFilter = $derived(data.feFilter);
	let rows = $derived(data.rows);
	let totals = $derived(data.totals);
	let yearsAvailable = $derived(data.yearsAvailable);
	let periodLabel = $derived(salesReportPeriodLabel(year, month));
	let totalCount = $derived(salesReportTotalCount(totals));
	let exporting = $state(false);

	function onFilterChange(event: Event) {
		const el = event.currentTarget as HTMLSelectElement;
		el.form?.requestSubmit();
	}

	async function downloadExcel() {
		if (exporting || rows.length === 0) return;
		exporting = true;
		try {
			const XLSX = await import('xlsx');
			const sheetRows = salesReportToSheetRows(rows, totals);
			const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
			worksheet['!cols'] = [
				{ wch: 12 },
				{ wch: 14 },
				{ wch: 6 },
				{ wch: 18 },
				{ wch: 28 },
				{ wch: 12 },
				{ wch: 22 },
				{ wch: 20 },
				{ wch: 18 },
				{ wch: 12 },
				{ wch: 8 },
				{ wch: 12 },
				{ wch: 12 },
				{ wch: 12 }
			];
			const workbook = XLSX.utils.book_new();
			XLSX.utils.book_append_sheet(workbook, worksheet, 'Ventas');
			const period =
				month != null ? `${year}-${String(month).padStart(2, '0')}` : String(year);
			const feSuffix =
				feFilter === 'con_fe' ? '-solo-fe' : feFilter === 'sin_fe' ? '-sin-fe' : '';
			XLSX.writeFile(workbook, `reporte-ventas-${period}${feSuffix}.xlsx`);
		} finally {
			exporting = false;
		}
	}
</script>

<div class="dash-page">
	<p class="dash-lead">
		Reporte general de ventas (facturadas o pagadas). Con FE, los montos salen en la moneda del
		comprobante (USD o CRC). Sin FE, en USD del libro. El Excel exporta lo filtrado en pantalla.
	</p>

	<div class="dash-toolbar reportes-ventas-toolbar">
		<form
			method="GET"
			action={resolve('/admin/reportes-ventas')}
			class="reportes-ventas-toolbar__filters"
			data-sveltekit-keepfocus
			data-sveltekit-noscroll
		>
			<label class="reportes-ventas-toolbar__field">
				<span class="type-caption">Año</span>
				<select
					class="field-select"
					name="year"
					value={year}
					onchange={onFilterChange}
					aria-label="Año del reporte"
				>
					{#each yearsAvailable as y (y)}
						<option value={y}>{y}</option>
					{/each}
				</select>
			</label>
			<label class="reportes-ventas-toolbar__field">
				<span class="type-caption">Mes</span>
				<select
					class="field-select"
					name="month"
					value={month == null ? 'all' : month}
					onchange={onFilterChange}
					aria-label="Mes del reporte"
				>
					<option value="all">Todo el año</option>
					{#each MONTH_NAMES_FULL as label, i (label)}
						<option value={i + 1}>{label}</option>
					{/each}
				</select>
			</label>
			<label class="reportes-ventas-toolbar__field">
				<span class="type-caption">Factura electrónica</span>
				<select
					class="field-select"
					name="fe"
					value={feFilter}
					onchange={onFilterChange}
					aria-label="Filtro de factura electrónica"
				>
					<option value="all">Todas</option>
					<option value="con_fe">Solo con FE</option>
					<option value="sin_fe">Solo sin FE</option>
				</select>
			</label>
		</form>
		<button
			type="button"
			class="btn-secondary-pill"
			onclick={downloadExcel}
			disabled={rows.length === 0 || exporting}
		>
			<Download size={16} strokeWidth={1.75} />
			{exporting ? 'Exportando…' : 'Exportar Excel'}
		</button>
	</div>

	<section class="dash-stat-grid dash-stat-grid--compact">
		{#if totals.USD.count > 0}
			<div class="dash-stat">
				<p class="dash-stat__label">Subtotal USD — {periodLabel}</p>
				<p class="dash-stat__value dash-stat__value--currency">
					{formatSalesMoney(totals.USD.subtotal, 'USD')}
				</p>
			</div>
			<div class="dash-stat">
				<p class="dash-stat__label">IVA USD — {periodLabel}</p>
				<p class="dash-stat__value dash-stat__value--currency">
					{formatSalesMoney(totals.USD.impuesto, 'USD')}
				</p>
			</div>
			<div class="dash-stat dash-stat--accent">
				<p class="dash-stat__label">Total USD — {periodLabel}</p>
				<p class="dash-stat__value dash-stat__value--currency">
					{formatSalesMoney(totals.USD.total, 'USD')}
				</p>
				<p class="dash-stat__hint">{totals.USD.count} factura{totals.USD.count === 1 ? '' : 's'}</p>
			</div>
		{/if}
		{#if totals.CRC.count > 0}
			<div class="dash-stat">
				<p class="dash-stat__label">Subtotal CRC — {periodLabel}</p>
				<p class="dash-stat__value dash-stat__value--currency">
					{formatSalesMoney(totals.CRC.subtotal, 'CRC')}
				</p>
			</div>
			<div class="dash-stat">
				<p class="dash-stat__label">IVA CRC — {periodLabel}</p>
				<p class="dash-stat__value dash-stat__value--currency">
					{formatSalesMoney(totals.CRC.impuesto, 'CRC')}
				</p>
			</div>
			<div class="dash-stat dash-stat--accent">
				<p class="dash-stat__label">Total CRC — {periodLabel}</p>
				<p class="dash-stat__value dash-stat__value--currency">
					{formatSalesMoney(totals.CRC.total, 'CRC')}
				</p>
				<p class="dash-stat__hint">{totals.CRC.count} factura{totals.CRC.count === 1 ? '' : 's'}</p>
			</div>
		{/if}
		{#if totalCount === 0}
			<div class="dash-stat">
				<p class="dash-stat__label">Facturas — {periodLabel}</p>
				<p class="dash-stat__value">0</p>
			</div>
		{/if}
	</section>

	<section class="dash-panel dash-panel--section">
		<h2 class="dash-panel__section-title">Detalle de ventas</h2>
		{#if rows.length === 0}
			<p class="type-caption reportes-ventas-empty">
				{#if feFilter === 'con_fe'}
					No hay facturas con FE aceptada en este periodo.
				{:else if feFilter === 'sin_fe'}
					No hay facturas sin FE en este periodo.
				{:else}
					No hay facturas facturadas o pagadas en este periodo.
				{/if}
			</p>
		{:else}
			<div class="data-table-wrap">
				<table class="data-table">
					<thead>
						<tr>
							<th>Fecha</th>
							<th>Factura</th>
							<th>FE</th>
							<th>Caso</th>
							<th>Cliente</th>
							<th>Paciente</th>
							<th>Moneda</th>
							<th class="reportes-ventas-num">Subtotal</th>
							<th class="reportes-ventas-num">IVA</th>
							<th class="reportes-ventas-num">Total</th>
						</tr>
					</thead>
					<tbody>
						{#each rows as row (row.id)}
							<tr>
								<td>{formatDate(row.fecha_emision)}</td>
								<td>
									<a class="text-link" href={resolve(`/admin/facturas/${row.id}`)}>
										{row.invoice_number}
									</a>
									<span class="type-caption reportes-ventas-estado">
										{getInvoiceEstadoLabel(row.estado)}
									</span>
								</td>
								<td>
									{#if row.tiene_fe}
										<span class="reportes-ventas-mono" title={row.fe_clave || undefined}>
											{row.fe_consecutivo || 'Sí'}
										</span>
									{:else}
										<span class="type-caption">Sin FE</span>
									{/if}
								</td>
								<td>{row.case_number || '—'}</td>
								<td>
									<span class="reportes-ventas-client">{row.client_name}</span>
									{#if row.client_clinica}
										<span class="type-caption reportes-ventas-clinica">{row.client_clinica}</span>
									{/if}
								</td>
								<td>{row.paciente_name || '—'}</td>
								<td>{row.moneda}</td>
								<td class="reportes-ventas-num">{formatSalesMoney(row.subtotal, row.moneda)}</td>
								<td class="reportes-ventas-num">{formatSalesMoney(row.impuesto, row.moneda)}</td>
								<td class="reportes-ventas-num type-body-strong">
									{formatSalesMoney(row.total, row.moneda)}
								</td>
							</tr>
						{/each}
					</tbody>
					<tfoot>
						{#if totals.USD.count > 0}
							<tr>
								<td colspan="7" class="type-body-strong">Total USD ({totals.USD.count})</td>
								<td class="reportes-ventas-num type-body-strong">
									{formatSalesMoney(totals.USD.subtotal, 'USD')}
								</td>
								<td class="reportes-ventas-num type-body-strong">
									{formatSalesMoney(totals.USD.impuesto, 'USD')}
								</td>
								<td class="reportes-ventas-num type-body-strong">
									{formatSalesMoney(totals.USD.total, 'USD')}
								</td>
							</tr>
						{/if}
						{#if totals.CRC.count > 0}
							<tr>
								<td colspan="7" class="type-body-strong">Total CRC ({totals.CRC.count})</td>
								<td class="reportes-ventas-num type-body-strong">
									{formatSalesMoney(totals.CRC.subtotal, 'CRC')}
								</td>
								<td class="reportes-ventas-num type-body-strong">
									{formatSalesMoney(totals.CRC.impuesto, 'CRC')}
								</td>
								<td class="reportes-ventas-num type-body-strong">
									{formatSalesMoney(totals.CRC.total, 'CRC')}
								</td>
							</tr>
						{/if}
					</tfoot>
				</table>
			</div>
		{/if}
	</section>
</div>

<style>
	.reportes-ventas-toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: var(--spacing-md, 1rem);
		margin-bottom: var(--spacing-lg, 1.25rem);
	}

	.reportes-ventas-toolbar__filters {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--spacing-md, 1rem);
	}

	.reportes-ventas-toolbar__field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		min-width: 9rem;
	}

	.reportes-ventas-num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.reportes-ventas-client {
		display: block;
	}

	.reportes-ventas-clinica,
	.reportes-ventas-estado {
		display: block;
		margin-top: 0.15rem;
	}

	.reportes-ventas-mono {
		font-variant-numeric: tabular-nums;
		font-size: 0.9em;
	}

	.reportes-ventas-empty {
		margin: 0;
		padding: 0.5rem 0 0.25rem;
	}
</style>
