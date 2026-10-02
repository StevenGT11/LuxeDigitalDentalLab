<script lang="ts">
	import { onMount } from 'svelte';
	import TreatmentCategoryPicker from '$lib/components/lab/TreatmentCategoryPicker.svelte';
	import {
		calcularCostoItem,
		getGuiaPrecioUsd,
		IMPLANTES_GUIA_OPTIONS,
		isGuiaQuirurgica,
		getTipoTrabajoLabel
	} from '$lib/lab/constants';
	import { resolveItemServices } from '$lib/lab/client-case-draft';
	import { formatCurrency } from '$lib/lab/helpers';
	import { roundMoney } from '$lib/lab/invoice-line-amounts';
	import { hydrateTreatmentsCatalogOnce } from '$lib/lab/treatments';
	import type { TreatmentCategory } from '$lib/lab/treatments';
	import type { CreateCaseItemInput } from '$lib/lab/store-types';

	export type DirectInvoiceConfirm = {
		paciente_name: string;
		notas: string;
		items: CreateCaseItemInput[];
	};

	type LineDraft = {
		key: string;
		categoria: TreatmentCategory | '';
		tipo_trabajo: string;
		material: string;
		piezas: string;
		precio_unitario: string;
		corona_sobre_implante: boolean;
		implantes_guia: number | null;
		priceTouched: boolean;
	};

	let {
		open = $bindable(false),
		clientName,
		clientClinica = '',
		serverError = '',
		saving = false,
		onCancel,
		onConfirm
	}: {
		open?: boolean;
		clientName: string;
		clientClinica?: string;
		serverError?: string;
		saving?: boolean;
		onCancel?: () => void;
		onConfirm: (payload: DirectInvoiceConfirm) => void;
	} = $props();

	let pacienteName = $state('');
	let notas = $state('');
	let lines = $state<LineDraft[]>([]);
	let formError = $state('');

	function newLine(): LineDraft {
		return {
			key: crypto.randomUUID(),
			categoria: '',
			tipo_trabajo: '',
			material: '',
			piezas: '1',
			precio_unitario: '',
			corona_sobre_implante: false,
			implantes_guia: null,
			priceTouched: false
		};
	}

	function patchLine(key: string, patch: Partial<LineDraft>) {
		lines = lines.map((row) => (row.key === key ? { ...row, ...patch } : row));
	}

	function lineServices(row: LineDraft) {
		return resolveItemServices({
			tipo_trabajo: row.tipo_trabajo,
			categoria_seleccionada: row.categoria,
			material: row.material,
			corona_sobre_implante: row.corona_sobre_implante
		});
	}

	function suggestedUnitPrice(row: LineDraft): number {
		if (!row.tipo_trabajo) return 0;
		const piezas = Math.max(1, Number(row.piezas) || 1);
		const services = lineServices(row);
		const total = calcularCostoItem({
			tipo_trabajo: row.tipo_trabajo,
			material: row.material || null,
			piezas,
			incluye_diseno: services.incluye_diseno,
			incluye_fresado: services.incluye_fresado,
			implantes_guia: row.implantes_guia,
			corona_sobre_implante: row.corona_sobre_implante
		});
		return piezas > 0 ? roundMoney(total / piezas) : 0;
	}

	function lineSubtotal(row: LineDraft): number {
		const cantidad = Math.max(1, Number(row.piezas) || 1);
		const precio = Number(String(row.precio_unitario).replace(',', '.'));
		if (!Number.isFinite(precio)) return 0;
		return roundMoney(cantidad * precio);
	}

	const total = $derived(roundMoney(lines.reduce((sum, row) => sum + lineSubtotal(row), 0)));

	function refreshSuggestedPrice(key: string) {
		const row = lines.find((r) => r.key === key);
		if (!row || row.priceTouched) return;
		const price = suggestedUnitPrice(row);
		if (price > 0) patchLine(key, { precio_unitario: String(price) });
	}

	function onCategoryChange(key: string, categoria: TreatmentCategory) {
		patchLine(key, {
			categoria,
			tipo_trabajo: '',
			material: '',
			implantes_guia: null,
			priceTouched: false,
			precio_unitario: ''
		});
	}

	function onTreatmentChange(key: string, value: string) {
		const isGuia = isGuiaQuirurgica(value);
		patchLine(key, {
			tipo_trabajo: value,
			material: '',
			implantes_guia: isGuia ? 1 : null,
			priceTouched: false
		});
		refreshSuggestedPrice(key);
	}

	function onMaterialChange(key: string, material: string) {
		patchLine(key, { material, priceTouched: false });
		refreshSuggestedPrice(key);
	}

	function resetForm() {
		pacienteName = clientName.trim();
		notas = '';
		lines = [newLine()];
		formError = '';
	}

	function close() {
		open = false;
		onCancel?.();
	}

	function submit() {
		formError = '';
		if (lines.length === 0) {
			formError = 'Agregue al menos una línea.';
			return;
		}

		const items: CreateCaseItemInput[] = [];
		for (const row of lines) {
			if (!row.tipo_trabajo) {
				formError = 'Seleccione el tratamiento en cada línea.';
				return;
			}
			if (isGuiaQuirurgica(row.tipo_trabajo) && !row.implantes_guia) {
				formError = `Indique implantes para ${getTipoTrabajoLabel(row.tipo_trabajo)}.`;
				return;
			}
			const piezas = Math.max(1, Math.round(Number(row.piezas) || 1));
			const precio = Number(String(row.precio_unitario).replace(',', '.'));
			if (!Number.isFinite(precio) || precio < 0) {
				formError = `Precio inválido en ${getTipoTrabajoLabel(row.tipo_trabajo)}.`;
				return;
			}
			const services = lineServices(row);
			items.push({
				tipo_trabajo: row.tipo_trabajo,
				material: row.material || null,
				color: null,
				piezas,
				piezas_dentales: [],
				incluye_diseno: services.incluye_diseno,
				incluye_fresado: services.incluye_fresado,
				implantes_guia: row.implantes_guia,
				corona_sobre_implante: row.corona_sobre_implante,
				precio_unitario: precio
			} as CreateCaseItemInput & { precio_unitario: number });
		}

		if (total <= 0) {
			formError = 'El total debe ser mayor que cero.';
			return;
		}

		onConfirm({
			paciente_name: pacienteName.trim() || clientName,
			notas: notas.trim(),
			items
		});
	}

	let wasOpen = false;

	$effect(() => {
		if (open && !wasOpen) {
			resetForm();
			void hydrateTreatmentsCatalogOnce();
		}
		wasOpen = open;
	});

	$effect(() => {
		if (serverError.trim()) {
			formError = serverError.trim();
		}
	});

	onMount(() => {
		void hydrateTreatmentsCatalogOnce();
	});
</script>

{#if open}
	<div
		class="case-file-modal__backdrop"
		onclick={() => !saving && close()}
		role="presentation"
	></div>
	<div
		class="case-file-modal case-file-modal--form direct-invoice-modal"
		role="dialog"
		aria-modal="true"
		aria-labelledby="direct-invoice-title"
	>
		<header class="case-file-modal__header">
			<div>
				<p class="case-file-modal__eyebrow">Factura directa</p>
				<h3 class="case-file-modal__title" id="direct-invoice-title">Nueva factura — {clientName}</h3>
			</div>
			<button
				type="button"
				class="case-file-modal__close"
				aria-label="Cerrar"
				disabled={saving}
				onclick={close}
			>
				×
			</button>
		</header>

		<div class="case-file-modal__body direct-invoice-modal__body">
			<p class="case-file-modal__lead">
				Cree la factura interna (caso finalizado en segundo plano). Al continuar podrá registrar medios
				de pago, enviar a Hacienda y enviar el correo con los XML decodificados y el PDF.
			</p>

			{#if formError}
				<div class="alert alert--error">{formError}</div>
			{/if}

			<div class="direct-invoice-modal__meta">
				<div class="field direct-invoice-modal__client">
					<span class="field-label">Cliente</span>
					<p class="direct-invoice-modal__client-value">
						{clientName}
						{#if clientClinica.trim()}
							<span class="direct-invoice-modal__client-clinica">· {clientClinica}</span>
						{/if}
					</p>
				</div>
				<label class="field">
					<span class="field-label">Paciente / referencia</span>
					<input
						class="field-input"
						type="text"
						bind:value={pacienteName}
						placeholder="Nombre del paciente o referencia"
					/>
				</label>
				<label class="field">
					<span class="field-label">Notas (opcional)</span>
					<input class="field-input" type="text" bind:value={notas} placeholder="Observaciones" />
				</label>
			</div>

			<div class="direct-invoice-modal__lines">
				<div class="direct-invoice-modal__lines-head type-caption" aria-hidden="true">
					<span>Tratamiento</span>
					<span>Cant.</span>
					<span>Precio unit.</span>
					<span>Subtotal</span>
					<span></span>
				</div>
				{#each lines as line, index (line.key)}
					<div class="direct-invoice-modal__line">
						<div class="direct-invoice-modal__line-grid">
							<div class="direct-invoice-modal__line-picker">
								<span class="direct-invoice-modal__line-num type-caption">#{index + 1}</span>
								<div class="direct-invoice-modal__line-picker-body">
									<TreatmentCategoryPicker
										id="direct-inv-{line.key}"
										selectedCategory={line.categoria}
										selectedValue={line.tipo_trabajo}
										selectedMaterial={line.material}
										coronaSobreImplante={line.corona_sobre_implante}
										oncategorychange={(c) => onCategoryChange(line.key, c)}
										ontreatmentchange={(v) => onTreatmentChange(line.key, v)}
										onmaterialchange={(m) => onMaterialChange(line.key, m)}
										oncoronaimplantechange={(v) => {
											patchLine(line.key, { corona_sobre_implante: v, priceTouched: false });
											refreshSuggestedPrice(line.key);
										}}
									/>
									{#if isGuiaQuirurgica(line.tipo_trabajo)}
										<label class="field direct-invoice-modal__guia-field">
											<span class="field-label">Implantes</span>
											<select
												class="field-select"
												value={line.implantes_guia ?? ''}
												onchange={(e) => {
													const n = Number(e.currentTarget.value);
													patchLine(line.key, {
														implantes_guia: Number.isFinite(n) ? n : null,
														priceTouched: false
													});
													refreshSuggestedPrice(line.key);
												}}
											>
												<option value="">—</option>
												{#each IMPLANTES_GUIA_OPTIONS as n (n)}
													<option value={n}>
														{n} {n === 1 ? 'implante' : 'implantes'} · {formatCurrency(getGuiaPrecioUsd(n))}
													</option>
												{/each}
											</select>
										</label>
									{/if}
								</div>
							</div>
							<label class="field direct-invoice-modal__field-qty">
								<span class="field-label">Cantidad</span>
								<input
									class="field-input"
									type="number"
									min="1"
									step="1"
									value={line.piezas}
									oninput={(e) => {
										patchLine(line.key, { piezas: e.currentTarget.value, priceTouched: false });
										refreshSuggestedPrice(line.key);
									}}
								/>
							</label>
							<label class="field direct-invoice-modal__field-price">
								<span class="field-label">Precio (USD)</span>
								<input
									class="field-input"
									type="number"
									min="0"
									step="0.01"
									value={line.precio_unitario}
									oninput={(e) => {
										patchLine(line.key, {
											precio_unitario: e.currentTarget.value,
											priceTouched: true
										});
									}}
								/>
							</label>
							<div class="field direct-invoice-modal__field-subtotal">
								<span class="field-label">Subtotal</span>
								<p class="direct-invoice-modal__subtotal">{formatCurrency(lineSubtotal(line))}</p>
							</div>
							<button
								type="button"
								class="btn-secondary-pill direct-invoice-modal__line-remove"
								disabled={saving || lines.length <= 1}
								title="Quitar línea"
								onclick={() => {
									lines = lines.filter((r) => r.key !== line.key);
								}}
							>
								Quitar
							</button>
						</div>
					</div>
				{/each}
			</div>

			<button
				type="button"
				class="btn-secondary-pill"
				disabled={saving}
				onclick={() => {
					lines = [...lines, newLine()];
				}}
			>
				+ Agregar línea
			</button>

			<p class="direct-invoice-modal__total type-body-strong">
				Total estimado: {formatCurrency(total)}
			</p>
		</div>

		<div class="case-file-modal__footer">
			<button type="button" class="btn-pearl-capsule" disabled={saving} onclick={close}>
				Cancelar
			</button>
			<button type="button" class="btn-primary" disabled={saving} onclick={submit}>
				{saving ? 'Creando…' : 'Crear y continuar a FE'}
			</button>
		</div>
	</div>
{/if}

<style>
	:global(.case-file-modal.direct-invoice-modal) {
		width: min(72rem, calc(100vw - 1.5rem));
		max-height: min(92dvh, 52rem);
	}

	.direct-invoice-modal__body {
		max-height: min(72vh, 44rem);
		overflow: auto;
	}

	.direct-invoice-modal__meta {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--spacing-md);
		margin-bottom: var(--spacing-lg);
	}

	.direct-invoice-modal__client-value {
		margin: 0.35rem 0 0;
		font-size: 0.9375rem;
		font-weight: 600;
		color: var(--dash-text, inherit);
	}

	.direct-invoice-modal__client-clinica {
		font-weight: 500;
		color: var(--dash-text-secondary, #64748b);
	}

	.direct-invoice-modal__lines {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-md);
	}

	.direct-invoice-modal__lines-head {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 4.5rem 6.5rem 6.5rem auto;
		gap: 0.75rem 1rem;
		padding: 0 0.75rem;
		color: var(--dash-text-secondary, #64748b);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		font-size: 0.6875rem;
	}

	.direct-invoice-modal__line {
		padding: 0.65rem 0.75rem;
		border: 1px solid var(--color-border, #e2e8f0);
		border-radius: var(--radius-md, 8px);
		background: var(--color-surface-muted, #f8fafc);
	}

	.direct-invoice-modal__line-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 4.5rem 6.5rem 6.5rem auto;
		gap: 0.75rem 1rem;
		align-items: end;
	}

	.direct-invoice-modal__line-picker {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		min-width: 0;
		grid-column: 1;
	}

	.direct-invoice-modal__line-num {
		flex: 0 0 auto;
		margin-top: 0.45rem;
		color: var(--dash-text-secondary, #64748b);
		font-weight: 600;
	}

	.direct-invoice-modal__line-picker-body {
		flex: 1;
		min-width: 0;
	}

	.direct-invoice-modal__line-picker-body :global(.treatment-picker) {
		flex-direction: row;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.35rem;
	}

	.direct-invoice-modal__line-picker-body :global(.treatment-picker__summary) {
		flex: 0 1 auto;
		flex-wrap: nowrap;
		padding: 0.35rem 0.55rem;
	}

	.direct-invoice-modal__line-picker-body :global(.treatment-picker__summary-value) {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 14rem;
	}

	.direct-invoice-modal__line-picker-body :global(.treatment-picker__fieldset),
	.direct-invoice-modal__line-picker-body :global(.treatment-picker__hint),
	.direct-invoice-modal__line-picker-body :global(.treatment-picker__implante-addons) {
		flex-basis: 100%;
		width: 100%;
	}

	.direct-invoice-modal__line-picker:has(:global(.treatment-picker__fieldset)),
	.direct-invoice-modal__line-picker:has(:global(.treatment-picker__hint)) {
		grid-column: 1 / -1;
	}

	.direct-invoice-modal__guia-field {
		display: inline-flex;
		flex-direction: row;
		align-items: center;
		gap: 0.35rem;
		margin-top: 0.35rem;
	}

	.direct-invoice-modal__guia-field .field-label {
		margin: 0;
		white-space: nowrap;
	}

	.direct-invoice-modal__guia-field .field-select {
		width: auto;
		min-width: 13.5rem;
		padding: 0.35rem 0.5rem;
		font-size: 0.8125rem;
	}

	.direct-invoice-modal__field-qty,
	.direct-invoice-modal__field-price,
	.direct-invoice-modal__field-subtotal {
		margin: 0;
	}

	.direct-invoice-modal__field-qty .field-input,
	.direct-invoice-modal__field-price .field-input {
		padding: 0.45rem 0.5rem;
		font-size: 0.875rem;
	}

	.direct-invoice-modal__field-qty .field-label,
	.direct-invoice-modal__field-price .field-label,
	.direct-invoice-modal__field-subtotal .field-label {
		display: none;
	}

	.direct-invoice-modal__subtotal {
		margin: 0.35rem 0 0;
		font-size: 0.9375rem;
		font-weight: 600;
		white-space: nowrap;
	}

	.direct-invoice-modal__line-remove {
		align-self: end;
		font-size: 0.8125rem;
		padding: 0.45rem 0.65rem;
		white-space: nowrap;
	}

	.direct-invoice-modal__total {
		margin: var(--spacing-lg) 0 0;
		text-align: right;
	}

	@media (max-width: 900px) {
		:global(.case-file-modal.direct-invoice-modal) {
			width: calc(100vw - 1rem);
		}

		.direct-invoice-modal__lines-head {
			display: none;
		}

		.direct-invoice-modal__line-grid {
			grid-template-columns: 1fr;
		}

		.direct-invoice-modal__line-picker {
			grid-column: 1;
		}

		.direct-invoice-modal__field-qty .field-label,
		.direct-invoice-modal__field-price .field-label,
		.direct-invoice-modal__field-subtotal .field-label {
			display: block;
		}

		.direct-invoice-modal__line-remove {
			justify-self: start;
		}

		.direct-invoice-modal__meta {
			grid-template-columns: 1fr;
		}
	}
</style>
