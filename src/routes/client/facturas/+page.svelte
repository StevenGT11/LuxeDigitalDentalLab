<script lang="ts">
	import InvoicePdfPreview from '$lib/components/lab/InvoicePdfPreview.svelte';
	import {
		getFeComprobanteEstadoClass,
		getFeComprobanteEstadoLabel
	} from '$lib/fe/constants';
	import { getInvoiceEstadoClass, getInvoiceEstadoLabel, getInvoiceRowClass } from '$lib/lab/invoice-estado';
	import { formatInvoiceListTotal } from '$lib/lab/invoice-money';
	import { formatDate } from '$lib/lab/helpers';
	import { Download } from '@lucide/svelte';

	let { data } = $props();

	let invoices = $derived(data.invoices);
	let pdfPreviewOpen = $state(false);
	let pdfPreview = $state<{ id: string; number: string } | null>(null);

	function openPdf(id: string, number: string) {
		pdfPreview = { id, number };
		pdfPreviewOpen = true;
	}
</script>

<div class="dash-page">
	<p class="dash-lead">
		Consulta el estado de cobro y la factura electrónica de tus casos. Puedes descargar el PDF; no
		puedes editar facturas desde aquí.
	</p>

	{#if invoices.length === 0}
		<section class="dash-panel empty-state">
			<p>Aún no tienes facturas registradas.</p>
		</section>
	{:else}
		<div class="data-table-wrap">
			<table class="data-table">
				<thead>
					<tr>
						<th>Factura</th>
						<th>Caso</th>
						<th>Paciente</th>
						<th>Total</th>
						<th>Cobro</th>
						<th>FE Hacienda</th>
						<th>Emisión</th>
						<th>PDF</th>
					</tr>
				</thead>
				<tbody>
					{#each invoices as fac (fac.id)}
						{@const fe = fac.fe}
						<tr class={getInvoiceRowClass(fac.estado, fe?.estado)}>
							<td class="type-body-strong">{fac.invoice_number}</td>
							<td>
								<span>{fac.case_number || '—'}</span>
							</td>
							<td>{fac.paciente_name || '—'}</td>
							<td class="type-body-strong">{formatInvoiceListTotal(fac.total, fac.fe)}</td>
							<td>
								<span class={getInvoiceEstadoClass(fac.estado, fe?.estado)}>
									{getInvoiceEstadoLabel(fac.estado)}
								</span>
							</td>
							<td>
								{#if fe}
									<span class={getFeComprobanteEstadoClass(fe.estado)}>
										{getFeComprobanteEstadoLabel(fe.estado)}
									</span>
									{#if fe.consecutivo}
										<br />
										<span class="type-fine-print">{fe.consecutivo}</span>
									{/if}
								{:else}
									<span class="type-caption">Sin FE</span>
								{/if}
							</td>
							<td>{formatDate(fac.fecha_emision)}</td>
							<td>
								<button
									type="button"
									class="btn-secondary-pill client-facturas-pdf"
									onclick={() => openPdf(fac.id, fac.invoice_number)}
								>
									<Download size={16} strokeWidth={1.75} />
									PDF
								</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<InvoicePdfPreview
	bind:open={pdfPreviewOpen}
	invoiceId={pdfPreview?.id ?? ''}
	invoiceNumber={pdfPreview?.number ?? ''}
	portal="client"
/>

<style>
	.client-facturas-pdf {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}
</style>
