<script lang="ts">
	import { goto } from '$app/navigation';
	import CaseFileDropzone from '$lib/components/lab/CaseFileDropzone.svelte';
	import DateTimeField from '$lib/components/lab/DateTimeField.svelte';
	import ToothSelectionField from '$lib/components/lab/ToothSelectionField.svelte';
	import ImplantCrownFields from '$lib/components/lab/ImplantCrownFields.svelte';
	import TreatmentCategoryPicker from '$lib/components/lab/TreatmentCategoryPicker.svelte';
	import { validateCaseFileBatch } from '$lib/lab/attachments';
	import {
		ARCADA_SCOPE_OPTIONS,
		COLORES_VITA,
		IMPLANTES_GUIA_OPTIONS,
		calcularCostoItem,
		getMaterialesRestauracion,
		getPrecioDiseno,
		getPrecioFresado,
		isArcadaScopeTreatment,
		isCoronaRestauracion,
		isGuiaQuirurgica,
		isRestauracionTipoTrabajo,
		treatmentRequiresTeeth
	} from '$lib/lab/constants';
	import type { MaterialRestauracion } from '$lib/lab/restoration-pricing';
	import { getTreatmentByValue, type TreatmentCategory } from '$lib/lab/treatments';
	import {
		getCachedDoctors,
		hydrateClientSession,
		reloadDoctors
	} from '$lib/lab/client-session';
	import {
		createCase,
		getClientId,
		getClientProfile,
		initializeLabStorage,
		updateCase
	} from '$lib/lab/store';
	import { requestNewCaseAdminNotification } from '$lib/lab/notify-client';
	import type { DbDoctor } from '$lib/lab/clients-db';
	import type { CreateCaseItemInput } from '$lib/lab/store';
	import {
		dateTimeLocalToISO,
		formatCurrency,
		formatLastEditedLine,
		getDefaultDeliveryDateTime,
		isoToDateTimeLocal
	} from '$lib/lab/helpers';
	import {
		labCaseItemsToDraft,
		newCaseDraftItem,
		type CaseDraftItem
	} from '$lib/lab/client-case-draft';
	import type { LabCase } from '$lib/lab/types';
	import { onMount } from 'svelte';

	interface Props {
		mode?: 'create' | 'edit';
		editCase?: LabCase;
	}

	let { mode = 'create', editCase }: Props = $props();

	type DraftItem = CaseDraftItem;

	function newDraftItem(): DraftItem {
		return newCaseDraftItem();
	}

	function restOpts(row: DraftItem) {
		return { corona_sobre_implante: row.corona_sobre_implante };
	}

	function isGuiaRow(row: DraftItem): boolean {
		return isGuiaQuirurgica(row.tipo_trabajo);
	}

	function isArcadaScopeRow(row: DraftItem): boolean {
		return isArcadaScopeTreatment(row.tipo_trabajo);
	}

	function patchRow(key: string, patch: Partial<DraftItem>) {
		items = items.map((row) => (row.key === key ? { ...row, ...patch } : row));
	}

	function onCategoryChange(key: string, categoria: TreatmentCategory) {
		const row = items.find((r) => r.key === key);
		const current = row?.tipo_trabajo ? getTreatmentByValue(row.tipo_trabajo) : undefined;
		if (current?.categoria === categoria) {
			patchRow(key, { categoria_seleccionada: categoria });
			return;
		}
		patchRow(key, {
			categoria_seleccionada: categoria,
			tipo_trabajo: '',
			implantes_guia: null,
			material: '',
			corona_sobre_implante: false,
			implante_marca: '',
			implante_plataforma: '',
			alcance_arcada: null
		});
	}

	function isRestauracionRow(row: DraftItem): boolean {
		if (row.categoria_seleccionada === 'restauracion') return true;
		return row.tipo_trabajo ? isRestauracionTipoTrabajo(row.tipo_trabajo) : false;
	}

	function itemRequiresTeeth(row: DraftItem): boolean {
		if (isGuiaRow(row)) return false;
		const cat =
			row.categoria_seleccionada ||
			(row.tipo_trabajo ? getTreatmentByValue(row.tipo_trabajo)?.categoria : '');
		return treatmentRequiresTeeth(cat ?? '');
	}

	function isTreatmentPickerComplete(row: DraftItem): boolean {
		if (!row.categoria_seleccionada || !row.tipo_trabajo) return false;
		if (isGuiaRow(row)) return true;
		if (isRestauracionRow(row)) {
			const mats = getMaterialesRestauracion(row.tipo_trabajo);
			if (mats.length > 0 && !row.material) return false;
		}
		return true;
	}

	function onTreatmentSelect(key: string, value: string) {
		const treatment = getTreatmentByValue(value);
		if (!treatment) return;

		if (isGuiaQuirurgica(value)) {
			patchRow(key, {
				categoria_seleccionada: treatment.categoria,
				tipo_trabajo: value,
				implantes_guia: 1,
				piezas_dentales: [],
				incluye_diseno: true,
				incluye_fresado: false,
				material: '',
				color: '',
				corona_sobre_implante: false,
				implante_marca: '',
				implante_plataforma: '',
				alcance_arcada: null
			});
			return;
		}

		const incluye_diseno = treatment.precio_diseno > 0;
		const incluye_fresado = treatment.precio_fresado > 0;
		const sinDientes = !treatmentRequiresTeeth(treatment.categoria);
		const arcadaScope = isArcadaScopeTreatment(value);
		patchRow(key, {
			categoria_seleccionada: treatment.categoria,
			tipo_trabajo: value,
			implantes_guia: null,
			piezas_dentales: sinDientes ? [] : items.find((r) => r.key === key)?.piezas_dentales ?? [],
			incluye_diseno,
			incluye_fresado,
			material: '',
			corona_sobre_implante: false,
			implante_marca: '',
			implante_plataforma: '',
			alcance_arcada: arcadaScope ? 'ambas' : null
		});
	}

	function onMaterialChange(key: string, material: MaterialRestauracion) {
		patchRow(key, { material });
	}

	function itemCost(row: DraftItem): number {
		if (!row.tipo_trabajo) return 0;
		return calcularCostoItem({
			tipo_trabajo: row.tipo_trabajo,
			material: row.material || null,
			piezas: itemPiezas(row),
			incluye_diseno: row.incluye_diseno,
			incluye_fresado: row.incluye_fresado,
			implantes_guia: row.implantes_guia,
			alcance_arcada: row.alcance_arcada,
			corona_sobre_implante: row.corona_sobre_implante
		});
	}

	function rowIsComplete(row: DraftItem): boolean {
		if (!row.tipo_trabajo) return false;
		if (isGuiaRow(row)) return row.implantes_guia !== null && row.implantes_guia >= 1;
		if (isArcadaScopeRow(row)) return !!row.alcance_arcada && (row.incluye_diseno || row.incluye_fresado);
		if (isRestauracionRow(row) && !row.material) return false;
		if (
			isCoronaRestauracion(row.tipo_trabajo) &&
			row.corona_sobre_implante &&
			(!row.implante_marca.trim() || !row.implante_plataforma.trim())
		) {
			return false;
		}
		if (!itemRequiresTeeth(row)) return row.incluye_diseno || row.incluye_fresado;
		return row.piezas_dentales.length > 0;
	}

	let items = $state<DraftItem[]>([newDraftItem()]);
	let paciente_name = $state('');
	let fecha_entrega = $state(getDefaultDeliveryDateTime());
	let notas = $state('');
	let escaneoFiles = $state<File[]>([]);
	let disenoFiles = $state<File[]>([]);
	let loading = $state(false);
	let error = $state('');

	let doctors = $state<DbDoctor[]>(getCachedDoctors());
	let selectedDoctorId = $state('');
	let sessionReady = $state(false);

	const isEdit = $derived(mode === 'edit' && !!editCase);
	const lastEditedLine = $derived(editCase ? formatLastEditedLine(editCase) : null);

	function populateFromCase(caso: LabCase) {
		paciente_name = caso.paciente_name;
		fecha_entrega = isoToDateTimeLocal(caso.fecha_entrega);
		notas = caso.notas ?? '';
		items = labCaseItemsToDraft(caso.items);
		selectedDoctorId = caso.doctor_id;
	}

	onMount(async () => {
		initializeLabStorage({ linkClientPortal: true });
		try {
			await hydrateClientSession();
			doctors = await reloadDoctors();
			if (isEdit && editCase) {
				populateFromCase(editCase);
				if (editCase.doctor_id && doctors.some((d) => d.id === editCase.doctor_id)) {
					selectedDoctorId = editCase.doctor_id;
				} else if (doctors.length > 0) {
					selectedDoctorId = doctors[0].id;
				}
			} else if (doctors.length > 0 && !selectedDoctorId) {
				selectedDoctorId = doctors[0].id;
			}
		} catch {
			if (isEdit && editCase) populateFromCase(editCase);
		} finally {
			sessionReady = true;
		}
	});

	function itemPiezas(row: DraftItem): number {
		if (!itemRequiresTeeth(row)) return 1;
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
			if (!row.categoria_seleccionada) {
				error = `Ítem ${n}: selecciona una categoría de tratamiento`;
				return;
			}
			if (!row.tipo_trabajo) {
				error = `Ítem ${n}: selecciona el tratamiento`;
				return;
			}
			if (isGuiaRow(row)) {
				if (!row.implantes_guia || row.implantes_guia < 1 || row.implantes_guia > 6) {
					error = `Ítem ${n}: indica la cantidad de implantes (1 a 6)`;
					return;
				}
			} else if (isArcadaScopeRow(row)) {
				if (!row.alcance_arcada) {
					error = `Ítem ${n}: selecciona una o ambas arcadas`;
					return;
				}
			} else if (itemRequiresTeeth(row) && row.piezas_dentales.length === 0) {
				error = `Ítem ${n}: selecciona al menos un diente en el odontograma`;
				return;
			}
			if (!row.incluye_diseno && !row.incluye_fresado) {
				error = `Ítem ${n}: marca Diseño y/o Fresado`;
				return;
			}
			if (
				isCoronaRestauracion(row.tipo_trabajo) &&
				row.corona_sobre_implante &&
				(!row.implante_marca.trim() || !row.implante_plataforma.trim())
			) {
				error = `Ítem ${n}: indica marca y tamaño de plataforma del implante`;
				return;
			}
			payloadItems.push({
				piezas_dentales: itemRequiresTeeth(row) ? row.piezas_dentales : [],
				tipo_trabajo: row.tipo_trabajo,
				material: row.material || null,
				color: row.color || null,
				piezas: itemPiezas(row),
				incluye_diseno: row.incluye_diseno,
				incluye_fresado: row.incluye_fresado,
				implantes_guia: isGuiaRow(row) ? row.implantes_guia : null,
				alcance_arcada: isArcadaScopeRow(row) ? row.alcance_arcada : null,
				corona_sobre_implante: isCoronaRestauracion(row.tipo_trabajo)
					? row.corona_sobre_implante
					: false,
				implante_marca:
					isCoronaRestauracion(row.tipo_trabajo) && row.corona_sobre_implante
						? row.implante_marca.trim()
						: null,
				implante_plataforma:
					isCoronaRestauracion(row.tipo_trabajo) && row.corona_sobre_implante
						? row.implante_plataforma.trim()
						: null
			});
		}

		const profile = getClientProfile();
		if (!profile.nombre.trim()) {
			error = isEdit
				? 'Completa tu perfil antes de guardar cambios'
				: 'Completa tu perfil antes de enviar un caso';
			return;
		}
		if (!selectedDoctorId) {
			error = 'Selecciona el doctor responsable del caso';
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
			const payload = {
				client_id: getClientId(),
				doctor_id: selectedDoctorId,
				paciente_name: paciente_name.trim(),
				items: payloadItems,
				fecha_entrega: fechaISO,
				notas: notas.trim() || null,
				costo: costoEstimado,
				escaneoFiles,
				disenosFiles: disenoFiles
			};

			if (isEdit && editCase) {
				const updated = await updateCase(editCase.id, payload);
				goto(`/client?updated=${encodeURIComponent(updated.case_number)}`);
				return;
			}

			const created = await createCase(payload);
			requestNewCaseAdminNotification(created.id);
			goto(`/client?sent=${encodeURIComponent(created.case_number)}`);
		} catch (err) {
			error = err instanceof Error ? err.message : isEdit ? 'Error al guardar cambios' : 'Error al enviar el caso';
			loading = false;
		}
	}
</script>

<div class="dash-page">
	<p class="dash-lead">
		{#if isEdit}
			Modifica los datos del caso {editCase?.case_number}. Solo puedes editar casos en estado pendiente.
		{:else}
			Selecciona los dientes en el odontograma (notación FDI) para cada trabajo del caso.
		{/if}
	</p>

	{#if lastEditedLine}
		<p class="type-fine-print case-edit-meta">{lastEditedLine}</p>
	{/if}

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
				<div>
					<label class="field-label" for="doctor">Doctor responsable *</label>
					{#if !sessionReady}
						<p class="type-fine-print">Cargando doctores…</p>
					{:else if doctors.length === 0}
						<p class="type-fine-print">
							<a href="/client/perfil" class="text-link">Agrega doctores en tu perfil</a> antes de enviar el caso.
						</p>
					{:else}
						<select
							id="doctor"
							class="field-input"
							bind:value={selectedDoctorId}
							required
						>
							{#each doctors as doc (doc.id)}
								<option value={doc.id}>{doc.nombre}</option>
							{/each}
						</select>
					{/if}
				</div>
			</div>
		</section>

		<section class="dash-panel dash-panel--section">
			<h2 class="dash-panel__section-title">Piezas / trabajos</h2>
			<p class="type-fine-print case-items-editor__intro">
				Cada ítem = un trabajo sobre uno o más dientes. Ej. corona 16, carillas 11-21.
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
							<div class="case-form__treatment-cell">
								<TreatmentCategoryPicker
									id="tratamiento-{row.key}"
									selectedValue={row.tipo_trabajo}
									selectedCategory={row.categoria_seleccionada}
									selectedMaterial={row.material}
									oncategorychange={(categoria) => onCategoryChange(row.key, categoria)}
									ontreatmentchange={(value) => onTreatmentSelect(row.key, value)}
									onmaterialchange={(material) => onMaterialChange(row.key, material)}
									coronaSobreImplante={row.corona_sobre_implante}
									oncoronaimplantechange={(activo) =>
										patchRow(row.key, {
											corona_sobre_implante: activo,
											implante_marca: activo ? row.implante_marca : '',
											implante_plataforma: activo ? row.implante_plataforma : ''
										})}
								/>
							</div>

							{#if isTreatmentPickerComplete(row) && isCoronaRestauracion(row.tipo_trabajo) && row.corona_sobre_implante}
								<ImplantCrownFields
									id="implante-{row.key}"
									bind:marca={row.implante_marca}
									bind:plataforma={row.implante_plataforma}
								/>
							{/if}

							{#if isTreatmentPickerComplete(row) && isGuiaRow(row)}
								<div>
									<label class="field-label" for="implantes-{row.key}">Cantidad de implantes *</label>
									<select
										id="implantes-{row.key}"
										class="field-select"
										value={row.implantes_guia ?? ''}
										required
										onchange={(e) =>
											patchRow(row.key, {
												implantes_guia: Number((e.currentTarget as HTMLSelectElement).value)
											})}
									>
										<option value="">Seleccionar (1–6)</option>
										{#each IMPLANTES_GUIA_OPTIONS as n}
											<option value={n}>{n} {n === 1 ? 'implante' : 'implantes'}</option>
										{/each}
									</select>
								</div>
								<div class="case-item-draft__guia-note">
									<span class="field-label">Servicio</span>
									<p class="type-body">Diseño de guía quirúrgica (precio según implantes).</p>
								</div>
							{:else if isTreatmentPickerComplete(row) && isArcadaScopeRow(row)}
								<div>
									<span class="field-label">Arcadas *</span>
									<div class="service-checks" role="radiogroup" aria-label="Arcadas">
										{#each ARCADA_SCOPE_OPTIONS as option (option.value)}
											<label class="service-check">
												<input
													type="radio"
													name="arcada-{row.key}"
													value={option.value}
													checked={row.alcance_arcada === option.value}
													onchange={() => patchRow(row.key, { alcance_arcada: option.value })}
												/>
												<span>{option.label}</span>
											</label>
										{/each}
									</div>
								</div>
								<div>
									<span class="field-label">Cantidad</span>
									<p class="case-item-draft__qty-display">1 servicio</p>
								</div>
							{:else if isTreatmentPickerComplete(row) && !itemRequiresTeeth(row)}
								<div class="case-item-draft__guia-note">
									<span class="field-label">Alcance</span>
									<p class="type-body">Servicio por caso (no requiere selección de dientes en el odontograma).</p>
								</div>
								<div>
									<span class="field-label">Cantidad</span>
									<p class="case-item-draft__qty-display">1 servicio</p>
								</div>
							{:else if isTreatmentPickerComplete(row)}
								<div class="case-form__tooth-cell">
									<ToothSelectionField bind:selected={row.piezas_dentales} id="pieza-{row.key}" />
								</div>
								<div>
									<span class="field-label">Cantidad</span>
									<p class="case-item-draft__qty-display">
										{itemPiezas(row)}
										{itemPiezas(row) === 1 ? 'pieza' : 'piezas'}
										<span class="type-fine-print">(según dientes seleccionados)</span>
									</p>
								</div>
								{#if !isRestauracionRow(row)}
									<div>
										<span class="field-label">Material</span>
										<p class="type-fine-print case-item-draft__qty-display">Opcional (otras categorías)</p>
									</div>
								{/if}
							{/if}

							{#if isTreatmentPickerComplete(row) && !isGuiaRow(row)}
								<div>
									<label class="field-label" for="color-{row.key}">Color VITA</label>
									<select id="color-{row.key}" class="field-select" bind:value={row.color}>
										{#each COLORES_VITA as c}
											<option value={c.value}>{c.label}</option>
										{/each}
									</select>
								</div>
								{@const treatment = row.tipo_trabajo ? getTreatmentByValue(row.tipo_trabajo) : undefined}
								{@const mat = row.material || null}
								{@const rowRestOpts = restOpts(row)}
								{@const precioDiseno = row.tipo_trabajo
									? getPrecioDiseno(row.tipo_trabajo, mat, rowRestOpts)
									: 0}
								{@const precioFresado = row.tipo_trabajo
									? getPrecioFresado(row.tipo_trabajo, mat, rowRestOpts)
									: 0}
								{#if treatment && (precioDiseno > 0 || precioFresado > 0) && (!isRestauracionRow(row) || row.material)}
									<div class="case-item-draft__services">
										<span class="field-label">Servicios *</span>
										<div class="service-checks">
											{#if precioDiseno > 0}
												<label class="service-check">
													<input type="checkbox" bind:checked={row.incluye_diseno} />
													<span>Diseño</span>
												</label>
											{/if}
											{#if precioFresado > 0}
												<label class="service-check">
													<input type="checkbox" bind:checked={row.incluye_fresado} />
													<span>Fresado</span>
												</label>
											{/if}
										</div>
									</div>
								{/if}
							{/if}

							{#if rowIsComplete(row)}
								<div class="case-item-draft__subtotal case-item-draft__subtotal--wide">
									<span class="type-fine-print">Subtotal ítem</span>
									<span class="case-item-draft__subtotal-value">{formatCurrency(itemCost(row))}</span>
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
				{#if loading}
					{isEdit ? 'Guardando...' : 'Enviando...'}
				{:else}
					{isEdit ? 'Guardar cambios' : 'Enviar caso'}
				{/if}
			</button>
		</footer>
	</form>
</div>
