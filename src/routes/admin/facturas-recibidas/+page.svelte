<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidate } from '$app/navigation';
	import {
		feRecibidoCanConsultar,
		feRecibidoCanResponder,
		getFeRecibidoEstadoClass,
		getFeRecibidoEstadoLabel
	} from '$lib/fe/fe-recibidos.constants';
	import { formatCurrency, formatDate } from '$lib/lab/helpers';
	import { Upload } from '@lucide/svelte';

	let { data, form } = $props();

	let uploadFormEl = $state<HTMLFormElement | null>(null);
	let selectedFileName = $state('');
	let busyRecibidoId = $state<string | null>(null);
	let busyAction = $state<'responder' | 'consultar' | 'upload' | null>(null);
	let feedback = $state<{ kind: 'success' | 'error'; message: string } | null>(null);

	const isBusy = $derived(busyAction !== null);
	const hasSelectedFile = $derived(selectedFileName.length > 0);

	$effect(() => {
		if (form?.message) {
			feedback = {
				kind: form.success ? 'success' : 'error',
				message: form.message
			};
		}
	});

	function onFileChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		selectedFileName = file?.name ?? '';
	}

	function claveCorta(clave: string): string {
		return clave.length > 12 ? `…${clave.slice(-10)}` : clave;
	}
</script>

{#if isBusy}
	<div class="fe-emit-overlay" role="alertdialog" aria-modal="true" aria-busy="true" aria-live="polite">
		<div class="fe-emit-overlay__panel">
			<div class="fe-emit-overlay__spinner" aria-hidden="true"></div>
			<p class="fe-emit-overlay__title">
				{#if busyAction === 'upload'}
					Registrando comprobante…
				{:else if busyAction === 'consultar'}
					Consultando Hacienda…
				{:else}
					Enviando confirmación a Hacienda…
				{/if}
			</p>
			<p class="type-caption">Firmando Mensaje Receptor y consultando estado…</p>
		</div>
	</div>
{/if}

<div class="dash-page">
	{#if !data.facturadorOk}
		<p class="fe-facturador-alert" role="alert">
			<strong>Facturador no disponible</strong> ({data.facturadorUrl}).
			{data.facturadorError ?? 'Verifique @happy-prod/facturador.'}
		</p>
	{/if}

	{#if !data.hasActiveEmisor}
		<p class="fe-facturador-alert" role="alert">
			Configure el emisor activo en
			<a href="/admin/factura-electronica" class="text-link">Factura electrónica</a>
			({data.emitAmbiente}) para firmar confirmaciones.
		</p>
	{/if}

	<section class="dash-panel recibidas-upload">
		<h2 class="dash-panel__section-title">Subir XML</h2>
		<form
			bind:this={uploadFormEl}
			method="POST"
			action="?/subirXml"
			enctype="multipart/form-data"
			use:enhance={() => {
				busyAction = 'upload';
				feedback = null;
				return async ({ result, update }) => {
					await update();
					busyAction = null;
					if (result.type === 'success') {
						selectedFileName = '';
						const input = uploadFormEl?.querySelector('input[type="file"]') as HTMLInputElement | null;
						if (input) input.value = '';
						await invalidate('app:facturas-recibidas');
					}
				};
			}}
			class="recibidas-upload__form"
		>
			<label class="recibidas-upload__drop" for="xml-file-input">
				<span class="recibidas-upload__icon" aria-hidden="true"><Upload size={22} /></span>
				<span class="type-body-strong">Seleccionar archivo .xml</span>
				<span class="type-caption">Comprobante electrónico del proveedor (FE, TE, NC, ND…)</span>
				{#if selectedFileName}
					<span class="type-fine-print recibidas-upload__filename">{selectedFileName}</span>
				{/if}
			</label>
			<input
				id="xml-file-input"
				name="xml_file"
				type="file"
				accept=".xml,application/xml,text/xml"
				class="recibidas-upload__input"
				onchange={onFileChange}
			/>
			{#if hasSelectedFile}
				<button
					type="submit"
					class="btn-primary-pill"
					disabled={isBusy || !data.hasActiveEmisor || !data.schemaReady}
				>
					Aceptar
				</button>
			{/if}
		</form>
	</section>

	{#if feedback}
		<div
			class="store-utility-card"
			style="margin-bottom: var(--spacing-md); border-color: {feedback.kind === 'success'
				? 'var(--color-success)'
				: 'var(--color-danger)'};"
			role="alert"
		>
			<p>{feedback.message}</p>
		</div>
	{/if}

	<section class="dash-panel">
		<h2 class="dash-panel__section-title">Comprobantes recibidos</h2>

		{#if data.items.length === 0}
			<div class="empty-state">
				<p>Aún no hay comprobantes registrados.</p>
			</div>
		{:else}
			<div class="data-table-wrap">
				<table class="data-table">
					<thead>
						<tr>
							<th>Emisor</th>
							<th>Clave</th>
							<th>Total</th>
							<th>Emisión</th>
							<th>Plazo</th>
							<th>Estado</th>
							<th>Acciones</th>
						</tr>
					</thead>
					<tbody>
						{#each data.items as item (item.id)}
							<tr class:fe-row-highlight={form?.feRecibidoId === item.id && feedback}>
								<td>
									<span class="type-body-strong">{item.emisor_nombre || '—'}</span>
									<br />
									<span class="type-fine-print">{item.emisor_numero_identificacion}</span>
								</td>
								<td>
									<span class="type-fine-print" title={item.clave}>{claveCorta(item.clave)}</span>
									<br />
									<span class="type-caption">Tipo {item.tipo_documento}</span>
								</td>
								<td class="type-body-strong">
									{formatCurrency(item.total)}
									<br />
									<span class="type-caption">IVA {formatCurrency(item.impuesto)}</span>
								</td>
								<td>{formatDate(item.fecha_emision)}</td>
								<td>
									{#if item.plazo_limite}
										{formatDate(item.plazo_limite)}
									{:else}
										—
									{/if}
								</td>
								<td>
									<span class={getFeRecibidoEstadoClass(item.estado)}>
										{getFeRecibidoEstadoLabel(item.estado)}
									</span>
									{#if item.ultimo_mensaje?.ultimo_error}
										<br />
										<span class="type-fine-print" style="color: var(--color-danger);">
											{item.ultimo_mensaje.ultimo_error.slice(0, 80)}
										</span>
									{/if}
								</td>
								<td class="recibidas-actions">
									{#if feRecibidoCanResponder(item.estado) && data.hasActiveEmisor}
										<form
											method="POST"
											action="?/responder"
											use:enhance={() => {
												busyRecibidoId = item.id;
												busyAction = 'responder';
												feedback = null;
												return async ({ result, update }) => {
													await update();
													busyAction = null;
													busyRecibidoId = null;
													if (result.type === 'success') {
														await invalidate('app:facturas-recibidas');
													}
												};
											}}
										>
											<input type="hidden" name="fe_recibido_id" value={item.id} />
											<input type="hidden" name="mensaje" value="aceptado" />
											<button
												type="submit"
												class="btn-primary-pill btn-primary-pill--sm"
												disabled={isBusy}
											>
												Aceptar
											</button>
										</form>
										<form
											method="POST"
											action="?/responder"
											use:enhance={() => {
												busyRecibidoId = item.id;
												busyAction = 'responder';
												feedback = null;
												return async ({ result, update }) => {
													await update();
													busyAction = null;
													busyRecibidoId = null;
													if (result.type === 'success') {
														await invalidate('app:facturas-recibidas');
													}
												};
											}}
										>
											<input type="hidden" name="fe_recibido_id" value={item.id} />
											<input type="hidden" name="mensaje" value="rechazado" />
											<input type="hidden" name="detalle_mensaje" value="Rechazado" />
											<button
												type="submit"
												class="btn-secondary-pill btn-secondary-pill--sm"
												disabled={isBusy}
											>
												Rechazar
											</button>
										</form>
									{:else if feRecibidoCanConsultar(item.estado, item.ultimo_mensaje?.estado)}
										<form
											method="POST"
											action="?/consultar"
											use:enhance={() => {
												busyRecibidoId = item.id;
												busyAction = 'consultar';
												feedback = null;
												return async ({ result, update }) => {
													await update();
													busyAction = null;
													busyRecibidoId = null;
													if (result.type === 'success') {
														await invalidate('app:facturas-recibidas');
													}
												};
											}}
										>
											<input type="hidden" name="fe_recibido_id" value={item.id} />
											<button
												type="submit"
												class="btn-secondary-pill btn-secondary-pill--sm"
												disabled={isBusy}
											>
												Consultar
											</button>
										</form>
									{:else}
										<span class="type-caption">—</span>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>
</div>

<style>
	.recibidas-upload {
		margin-bottom: var(--spacing-lg);
	}

	.recibidas-upload__form {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--spacing-md);
	}

	.recibidas-upload__drop {
		flex: 1 1 280px;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: var(--spacing-md);
		border: 1px dashed var(--color-border);
		border-radius: var(--radius-md);
		cursor: pointer;
	}

	.recibidas-upload__drop:hover {
		border-color: var(--color-accent);
		background: color-mix(in srgb, var(--color-accent) 6%, transparent);
	}

	.recibidas-upload__icon {
		color: var(--color-accent);
		margin-bottom: 0.25rem;
	}

	.recibidas-upload__input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		overflow: hidden;
	}

	.recibidas-upload__filename {
		margin-top: 0.35rem;
		color: var(--color-accent);
	}

	.recibidas-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		align-items: center;
	}

	.btn-primary-pill--sm,
	.btn-secondary-pill--sm {
		padding: 0.35rem 0.75rem;
		font-size: 0.8125rem;
	}
</style>
