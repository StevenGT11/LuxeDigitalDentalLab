<script lang="ts">
	import { goto } from '$app/navigation';
	import CaseFileDropzone from '$lib/components/lab/CaseFileDropzone.svelte';
	import DateTimeField from '$lib/components/lab/DateTimeField.svelte';
	import ToothSelectionField from '$lib/components/lab/ToothSelectionField.svelte';
	import { filesToCaseFiles, validateCaseFileBatch } from '$lib/lab/attachments';
	import {
		COLORES_VITA,
		MATERIALES,
		TIPOS_TRABAJO,
		calcularCostoItem,
		getPrecioDiseno,
		getPrecioFresado
	} from '$lib/lab/constants';
	import { createCase, getClientId, getClientProfile, initializeLabStorage } from '$lib/lab/store';
	import type { CreateCaseItemInput } from '$lib/lab/store';
	import { formatCurrency, dateTimeLocalToISO, getDefaultDeliveryDateTime } from '$lib/lab/helpers';
	import { onMount } from 'svelte';

	interface DraftItem {
		key: string;
		piezas_dentales: string[];
		tipo_trabajo: string;
		material: string;
		color: string;
		incluye_diseno: boolean;
		incluye_fresado: boolean;
	}

	function newDraftItem(): DraftItem {
		return {
			key: crypto.randomUUID(),
			piezas_dentales: [],
			tipo_trabajo: '',
			material: '',
			color: '',
			incluye_diseno: true,
			incluye_fresado: true
		};
	}

	function itemCost(row: DraftItem): number {
		if (!row.tipo_trabajo) return 0;
		return calcularCostoItem({
			tipo_trabajo: row.tipo_trabajo,
			material: row.material || null,
			piezas: itemPiezas(row),
			incluye_diseno: row.incluye_diseno,
			incluye_fresado: row.incluye_fresado
		});
	}

	function itemCostBreakdown(row: DraftItem): string {
		if (!row.tipo_trabajo) return '';
		const p = itemPiezas(row);
		const parts: string[] = [];
		if (row.incluye_diseno) parts.push(`Diseño ${formatCurrency(getPrecioDiseno(row.tipo_trabajo))}/pza`);
		if (row.incluye_fresado) parts.push(`Fresado ${formatCurrency(getPrecioFresado(row.tipo_trabajo))}/pza`);
		if (parts.length === 0) return 'Marca al menos un servicio';
		return `${parts.join(' + ')} × ${p} pza = ${formatCurrency(itemCost(row))}`;
	}

	let items = $state<DraftItem[]>([newDraftItem()]);
	let paciente_name = $state('');
	let fecha_entrega = $state(getDefaultDeliveryDateTime());
	let notas = $state('');
	let escaneoFiles = $state<File[]>([]);
	let disenoFiles = $state<File[]>([]);
	let loading = $state(false);
	let error = $state('');

	let profile = $derived(getClientProfile());
	let doctorLabel = $derived(profile.nombre.trim() || 'Completa tu perfil para identificarte como doctor');

	onMount(() => {
		initializeLabStorage({ linkClientPortal: true });
	});

	function itemPiezas(row: DraftItem): number {
		return Math.max(1, row.piezas_dentales.length);
	}

	let costoEstimado = $derived(items.reduce((sum, row) => sum + itemCost(row), 0));

	function addItem() {
		items = [...items, newDraftItem()];
	}

	function removeItem(key: string) {
		if (items.length <= 1) return;
		items = items.filter((row) => row.key !== key);
	}

	function handleSubmit(e: Event) {
		e.preventDefault();
		void submitCase();
	}

	async function submitCase() {
		if (!paciente_name.trim()) {
			error = 'El nombre del paciente es requerido';
			return;
		}
		if (!fecha_entrega) {
			error = 'La fecha de entrega es requerida';
			return;
		}

		const payloadItems: CreateCaseItemInput[] = [];
		for (let i = 0; i < items.length; i++) {
			const row = items[i];
			const n = i + 1;
			if (row.piezas_dentales.length === 0) {
				error = `Ítem ${n}: selecciona al menos un diente en el odontograma`;
				return;
			}
			if (!row.tipo_trabajo) {
				error = `Ítem ${n}: selecciona el tipo de trabajo`;
				return;
			}
			if (!row.incluye_diseno && !row.incluye_fresado) {
				error = `Ítem ${n}: marca Diseño y/o Fresado`;
				return;
			}
			payloadItems.push({
				piezas_dentales: row.piezas_dentales,
				tipo_trabajo: row.tipo_trabajo,
				material: row.material || null,
				color: row.color || null,
				piezas: itemPiezas(row),
				incluye_diseno: row.incluye_diseno,
				incluye_fresado: row.incluye_fresado
			});
		}

		const profile = getClientProfile();
		if (!profile.nombre.trim()) {
			error = 'Completa tu perfil antes de enviar un caso';
			return;
		}

		const fileErr = validateCaseFileBatch([...escaneoFiles, ...disenoFiles]);
		if (fileErr) {
			error = fileErr;
			return;
		}

		loading = true;
		error = '';

		try {
			const fechaISO = dateTimeLocalToISO(fecha_entrega);

			const archivos = [
				...(await filesToCaseFiles(escaneoFiles, 'escaneo')),
				...(await filesToCaseFiles(disenoFiles, 'diseno'))
			];

			const created = createCase({
				client_id: getClientId(),
				paciente_name: paciente_name.trim(),
				items: payloadItems,
				fecha_entrega: fechaISO,
				notas: notas.trim() || null,
				costo: costoEstimado,
				archivos
			});

			goto(`/client?sent=${encodeURIComponent(created.case_number)}`);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Error al enviar el caso';
			loading = false;
		}
	}
</script>

<div class="dash-page">
	<p class="dash-lead">
		Selecciona los dientes en el odontograma (FDI). El sistema clasifica incisivos, caninos,
		premolares y molares para las estadísticas del laboratorio.
	</p>

	{#if error}
		<div class="alert alert--error">{error}</div>
	{/if}

	<form class="case-form" onsubmit={handleSubmit}>
		<section class="dash-panel dash-panel--section">
			<h2 class="dash-panel__section-title">Paciente</h2>
			<div class="case-form__stack">
				<div>
					<label class="field-label" for="paciente">Paciente *</label>
					<input
						id="paciente"
						class="field-input"
						type="text"
						bind:value={paciente_name}
						required
					/>
				</div>
				<div class="case-form__doctor-note">
					<span class="field-label">Doctor</span>
					<p class="case-form__doctor-value">{doctorLabel}</p>
					<p class="type-fine-print">Se registrará automáticamente como la persona que envía el caso.</p>
				</div>
			</div>
		</section>

		<section class="dash-panel dash-panel--section">
			<h2 class="dash-panel__section-title">Piezas / trabajos</h2>
			<p class="type-fine-print case-items-editor__intro">
				Cada ítem = un trabajo sobre uno o más dientes. Ej. molar 16, carillas 11-21.
			</p>

			<div class="case-items-editor">
				{#each items as row, index (row.key)}
					<article class="case-item-draft">
						<div class="case-item-draft__head">
							<span class="case-item-draft__index">Ítem {index + 1}</span>
							{#if items.length > 1}
								<button
									type="button"
									class="text-link case-item-draft__remove"
									onclick={() => removeItem(row.key)}
								>
									Quitar
								</button>
							{/if}
						</div>

						<div class="case-form__grid">
							<div class="case-form__tooth-cell">
								<ToothSelectionField bind:selected={row.piezas_dentales} id="pieza-{row.key}" />
							</div>
							<div>
								<label class="field-label" for="tipo-{row.key}">Tipo de trabajo *</label>
								<select
									id="tipo-{row.key}"
									class="field-select"
									bind:value={row.tipo_trabajo}
									required
								>
									<option value="">Seleccionar</option>
									{#each TIPOS_TRABAJO as tipo}
										<option value={tipo.value}>{tipo.label}</option>
									{/each}
								</select>
							</div>
							<div>
								<label class="field-label">Cantidad</label>
								<p class="case-item-draft__qty-display">
									{itemPiezas(row)}
									{itemPiezas(row) === 1 ? 'pieza' : 'piezas'}
									<span class="type-fine-print">(según dientes seleccionados)</span>
								</p>
							</div>
							<div>
								<label class="field-label" for="mat-{row.key}">Material</label>
								<select id="mat-{row.key}" class="field-select" bind:value={row.material}>
									{#each MATERIALES as m}
										<option value={m.value}>{m.label}</option>
									{/each}
								</select>
							</div>
							<div>
								<label class="field-label" for="color-{row.key}">Color VITA</label>
								<select id="color-{row.key}" class="field-select" bind:value={row.color}>
									{#each COLORES_VITA as c}
										<option value={c.value}>{c.label}</option>
									{/each}
								</select>
							</div>
							<div class="case-item-draft__services">
								<span class="field-label">Servicios *</span>
								<div class="service-checks">
									<label class="service-check">
										<input type="checkbox" bind:checked={row.incluye_diseno} />
										<span>
											Diseño
											{#if row.tipo_trabajo}
												<span class="service-check__price">
													{formatCurrency(getPrecioDiseno(row.tipo_trabajo))}/pza
												</span>
											{/if}
										</span>
									</label>
									<label class="service-check">
										<input type="checkbox" bind:checked={row.incluye_fresado} />
										<span>
											Fresado
											{#if row.tipo_trabajo}
												<span class="service-check__price">
													{formatCurrency(getPrecioFresado(row.tipo_trabajo))}/pza
												</span>
											{/if}
										</span>
									</label>
								</div>
							</div>
							{#if row.tipo_trabajo && row.piezas_dentales.length > 0}
								<div class="case-item-draft__subtotal case-item-draft__subtotal--wide">
									<span class="type-fine-print">Subtotal ítem</span>
									<span class="case-item-draft__subtotal-value">{formatCurrency(itemCost(row))}</span>
									<span class="case-item-draft__subtotal-detail">{itemCostBreakdown(row)}</span>
								</div>
							{/if}
						</div>
					</article>
				{/each}

				<button type="button" class="case-item-draft case-item-draft--add" onclick={addItem}>
					<span class="case-item-draft--add__icon" aria-hidden="true">+</span>
					<span class="case-item-draft--add__label">Agregar otra pieza / ítem</span>
				</button>
			</div>

			{#if costoEstimado > 0}
				<div class="cost-banner" style="margin-top: 1rem;">
					<span class="type-body-strong">Costo estimado total ({items.length} ítem(s))</span>
					<span class="cost-banner__amount">{formatCurrency(costoEstimado)}</span>
				</div>
			{/if}
		</section>

		<section class="dash-panel dash-panel--section">
			<h2 class="dash-panel__section-title">Archivos del caso</h2>
			<p class="type-fine-print case-files-section__intro">
				Adjunta los escaneos intraorales o de modelo, y los diseños CAD si ya los tienes. Son
				opcionales, pero ayudan al laboratorio a iniciar más rápido.
			</p>
			<div class="case-files-section">
				<CaseFileDropzone
					id="escaneos"
					label="Escaneos"
					description="STL, PLY, OBJ, ZIP o imágenes del escaneo intraoral / modelo."
					bind:files={escaneoFiles}
				/>
				<CaseFileDropzone
					id="disenos"
					label="Diseños"
					description="Archivos de diseño CAD listos para fresado o revisión."
					bind:files={disenoFiles}
				/>
			</div>
		</section>

		<section class="dash-panel dash-panel--section">
			<h2 class="dash-panel__section-title">Entrega y notas</h2>
			<div class="case-form__stack">
				<DateTimeField id="entrega" bind:value={fecha_entrega} />
				<div>
					<label class="field-label" for="notas">Notas</label>
					<textarea
						id="notas"
						class="field-textarea"
						bind:value={notas}
						placeholder="Instrucciones especiales, referencias, etc."
					></textarea>
				</div>
			</div>
		</section>

		<footer class="case-form__footer">
			<button type="button" class="btn-pearl-capsule" onclick={() => goto('/client')}>Cancelar</button>
			<button type="submit" class="btn-primary" disabled={loading}>
				{loading ? 'Enviando...' : 'Enviar caso'}
			</button>
		</footer>
	</form>
</div>
