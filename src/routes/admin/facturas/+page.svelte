<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import {
		getAllInvoices,
		hydrateInvoicesOnce,
		initializeLabStorage,
		updateInvoiceStatus
	} from '$lib/lab/store';
	import {
		getInvoiceEstadoClass,
		getInvoiceEstadoLabel,
		INVOICE_ESTADOS
	} from '$lib/lab/constants';
	import { formatCurrency, formatDate } from '$lib/lab/helpers';
	import type { Invoice, InvoiceEstado } from '$lib/lab/types';

	let facturas = $state<Invoice[]>([]);
	let filtroEstado = $state<'todos' | InvoiceEstado>('todos');

	let filtered = $derived(
		filtroEstado === 'todos' ? facturas : facturas.filter((f) => f.estado === filtroEstado)
	);

	async function refresh() {
		if (!browser) return;
		initializeLabStorage();
		await hydrateInvoicesOnce();
		facturas = getAllInvoices();
	}

	onMount(() => void refresh());

	afterNavigate(() => void refresh());

	async function cambiarEstado(id: string, estado: string) {
		await updateInvoiceStatus(id, estado as InvoiceEstado);
		facturas = getAllInvoices();
	}
</script>

<div class="dash-page">
	<p class="dash-lead">Facturación por caso y cliente — generadas al registrar cada caso.</p>

<div class="dash-toolbar">
		<select class="field-select" style="width: auto;" bind:value={filtroEstado}>
			<option value="todos">Todos los estados</option>
			{#each INVOICE_ESTADOS as e}
				<option value={e.value}>{e.label}</option>
			{/each}
		</select>
	</div>

	{#if filtered.length === 0}
		<div class="store-utility-card empty-state">
			<p>No hay facturas</p>
		</div>
	{:else}
		<div class="data-table-wrap">
			<table class="data-table">
				<thead>
					<tr>
						<th>Factura</th>
						<th>Cliente</th>
						<th>Caso</th>
						<th>Paciente</th>
						<th>Subtotal</th>
						<th>IVA</th>
						<th>Total</th>
						<th>Estado</th>
						<th>Emisión</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each filtered as fac}
						<tr>
							<td class="type-body-strong">{fac.invoice_number}</td>
							<td>
								<a href="/admin/clientes/{fac.client_id}" class="text-link">{fac.client_name}</a>
								<br /><span class="type-fine-print">{fac.client_clinica}</span>
							</td>
							<td>
								<a href="/admin/casos/{fac.case_id}" class="text-link">{fac.case_number}</a>
							</td>
							<td>{fac.paciente_name}</td>
							<td>{formatCurrency(fac.subtotal)}</td>
							<td>{formatCurrency(fac.impuesto)}</td>
							<td class="type-body-strong">{formatCurrency(fac.total)}</td>
							<td>
								<span class={getInvoiceEstadoClass(fac.estado)}>
									{getInvoiceEstadoLabel(fac.estado)}
								</span>
							</td>
							<td class="type-caption">{formatDate(fac.fecha_emision)}</td>
							<td>
								<select
									class="field-select"
									style="width: auto; min-width: 120px; padding: 6px 10px; font-size: 13px;"
									value={fac.estado}
									onchange={(e) => cambiarEstado(fac.id, e.currentTarget.value)}
								>
									{#each INVOICE_ESTADOS as e}
										<option value={e.value}>{e.label}</option>
									{/each}
								</select>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
