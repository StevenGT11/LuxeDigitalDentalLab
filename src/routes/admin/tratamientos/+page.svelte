<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { ChevronDown, Plus, Trash2, X } from '@lucide/svelte';
	import { formatColones, formatCurrency } from '$lib/lab/helpers';
	import { initializeLabStorage } from '$lib/lab/store';
	import {
		GUIA_PRECIOS_POR_IMPLANTES,
		IMPLANTES_GUIA_OPTIONS
	} from '$lib/lab/surgical-guide';
	import {
		TREATMENT_CATEGORY_LABELS,
		TREATMENT_CATEGORY_ORDER,
		createTreatment,
		deleteTreatment,
		deleteTreatmentMaterialInDb,
		getAllTreatments,
		getTreatmentMaterials,
		hydrateTreatmentsCatalogOnce,
		slugifyMaterialKey,
		updateTreatment,
		upsertTreatmentMaterialInDb,
		type LabTreatment,
		type TreatmentCategory,
		type TreatmentMaterialOption
	} from '$lib/lab/treatments';

	interface DraftRow {
		label: string;
		categoria: TreatmentCategory;
		precio_diseno: string;
		precio_fresado: string;
		precio_crc_diseno: string;
		precio_crc_fresado: string;
		por_arcadas: boolean;
		sobre_implante: boolean;
	}

	let treatments = $state<LabTreatment[]>([]);
	let materialDrafts = $state<Record<string, TreatmentMaterialOption[]>>({});
	let materialsMode = $state<Record<string, boolean>>({});
	let materialsExpanded = $state<Record<string, boolean>>({});
	let newMaterialNames = $state<Record<string, string>>({});
	let modalOpen = $state(false);
	let saving = $state(false);
	let loading = $state(true);
	let error = $state('');
	let deletingId = $state<string | null>(null);

	let form = $state<DraftRow>({
		label: '',
		categoria: 'otros',
		precio_diseno: '',
		precio_fresado: '',
		precio_crc_diseno: '',
		precio_crc_fresado: '',
		por_arcadas: false,
		sobre_implante: false
	});

	let rowErrors = $state<Record<string, string>>({});

	let clientVisibleCount = $derived(treatments.filter((t) => t.activo).length);
	let grouped = $derived.by(() => {
		const groups = new Map<TreatmentCategory, LabTreatment[]>();
		for (const t of treatments) {
			const list = groups.get(t.categoria) ?? [];
			list.push(t);
			groups.set(t.categoria, list);
		}
		return TREATMENT_CATEGORY_ORDER.filter((c) => groups.has(c)).map((categoria) => ({
			categoria,
			label: TREATMENT_CATEGORY_LABELS[categoria],
			items: groups.get(categoria) ?? []
		}));
	});

	onMount(() => refresh());
	afterNavigate(() => refresh());

	function syncMaterialDrafts(list: LabTreatment[]) {
		const nextDrafts: Record<string, TreatmentMaterialOption[]> = {};
		const nextMode: Record<string, boolean> = {};
		for (const t of list) {
			const materials = structuredClone(getTreatmentMaterials(t.value));
			nextDrafts[t.id] = materials;
			nextMode[t.id] = materials.length > 0;
		}
		materialDrafts = nextDrafts;
		materialsMode = nextMode;
	}

	function usesMaterialsMode(treatmentId: string): boolean {
		return materialsMode[treatmentId] === true;
	}

	function isMaterialsExpanded(treatmentId: string): boolean {
		return materialsExpanded[treatmentId] === true;
	}

	function toggleMaterialsExpanded(treatmentId: string) {
		materialsExpanded = {
			...materialsExpanded,
			[treatmentId]: !isMaterialsExpanded(treatmentId)
		};
	}

	function materialsCountLabel(treatmentId: string): string {
		const n = materialList(treatmentId).length;
		if (n === 0) return 'Sin materiales';
		return n === 1 ? '1 material' : `${n} materiales`;
	}

	function toggleMaterialsMode(treatment: LabTreatment) {
		const next = !usesMaterialsMode(treatment.id);
		materialsMode = { ...materialsMode, [treatment.id]: next };
		if (next) {
			materialsExpanded = { ...materialsExpanded, [treatment.id]: true };
		} else {
			materialDrafts = { ...materialDrafts, [treatment.id]: [] };
		}
		clearRowError(treatment.id);
	}

	function materialList(treatmentId: string): TreatmentMaterialOption[] {
		return materialDrafts[treatmentId] ?? [];
	}

	function patchMaterialOption(
		treatmentId: string,
		materialKey: string,
		patch: Partial<TreatmentMaterialOption>
	) {
		materialDrafts = {
			...materialDrafts,
			[treatmentId]: materialList(treatmentId).map((m) =>
				m.key === materialKey ? { ...m, ...patch } : m
			)
		};
		clearRowError(treatmentId);
	}

	function addCustomMaterial(treatment: LabTreatment) {
		const label = (newMaterialNames[treatment.id] ?? '').trim();
		if (label.length < 2) {
			rowErrors = {
				...rowErrors,
				[treatment.id]: 'Indica un nombre de material (mín. 2 caracteres).'
			};
			return;
		}
		const existing = new Set(materialList(treatment.id).map((m) => m.key));
		const key = slugifyMaterialKey(label, existing);
		const refUsd = treatment.precio_fresado || treatment.precio_diseno || 0;
		const refCrc = treatment.precio_crc_fresado || treatment.precio_crc_diseno || 0;
		materialDrafts = {
			...materialDrafts,
			[treatment.id]: [
				...materialList(treatment.id),
				{ key, label, precio_usd: refUsd, precio_crc: refCrc }
			]
		};
		newMaterialNames = { ...newMaterialNames, [treatment.id]: '' };
		clearRowError(treatment.id);
	}

	function removeMaterialLocal(treatmentId: string, materialKey: string) {
		materialDrafts = {
			...materialDrafts,
			[treatmentId]: materialList(treatmentId).filter((m) => m.key !== materialKey)
		};
		clearRowError(treatmentId);
	}

	async function refresh() {
		if (!browser) return;
		initializeLabStorage();
		loading = true;
		try {
			await hydrateTreatmentsCatalogOnce();
			treatments = getAllTreatments();
			syncMaterialDrafts(treatments);
		} catch (err) {
			error = err instanceof Error ? err.message : 'No se pudo cargar el catálogo';
			treatments = getAllTreatments();
			syncMaterialDrafts(treatments);
		} finally {
			loading = false;
		}
	}

	function parsePrice(value: string | number, decimals = 2): number | null {
		const n = Number.parseFloat(String(value).replace(',', '.'));
		if (!Number.isFinite(n) || n < 0) return null;
		const factor = 10 ** decimals;
		return Math.round(n * factor) / factor;
	}

	function openModal() {
		error = '';
		form = {
			label: '',
			categoria: 'otros',
			precio_diseno: '',
			precio_fresado: '',
			precio_crc_diseno: '',
			precio_crc_fresado: '',
			por_arcadas: false,
			sobre_implante: false
		};
		modalOpen = true;
	}

	function closeModal() {
		if (saving) return;
		modalOpen = false;
		error = '';
	}

	function onModalKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') closeModal();
	}

	function clearRowError(id: string) {
		if (!rowErrors[id]) return;
		const next = { ...rowErrors };
		delete next[id];
		rowErrors = next;
	}

	async function saveRow(treatment: LabTreatment) {
		if (!treatment.label.trim()) {
			rowErrors = { ...rowErrors, [treatment.id]: 'El nombre es obligatorio.' };
			return;
		}

		const materialsEnabled = usesMaterialsMode(treatment.id);
		const materials = materialsEnabled ? materialList(treatment.id) : [];
		const hasMaterials = materials.length > 0;

		if (materialsEnabled && !hasMaterials) {
			rowErrors = {
				...rowErrors,
				[treatment.id]:
					'Agrega al menos un material o desactiva «Varios materiales» para usar precio base.'
			};
			return;
		}

		let precio_diseno = treatment.precio_diseno;
		let precio_fresado = treatment.precio_fresado;
		let precio_crc_diseno = treatment.precio_crc_diseno;
		let precio_crc_fresado = treatment.precio_crc_fresado;

		if (!hasMaterials) {
			const d = parsePrice(String(treatment.precio_diseno));
			const dc = parsePrice(String(treatment.precio_crc_diseno), 0);
			if (isDisenoCategory(treatment.categoria)) {
				if (d === null || dc === null) {
					rowErrors = {
						...rowErrors,
						[treatment.id]: 'Los precios de diseño deben ser números válidos (0 o más).'
					};
					return;
				}
				precio_diseno = d;
				precio_fresado = 0;
				precio_crc_diseno = dc;
				precio_crc_fresado = 0;
			} else {
				const f = parsePrice(String(treatment.precio_fresado));
				const fc = parsePrice(String(treatment.precio_crc_fresado), 0);
				if (d === null || f === null || dc === null || fc === null) {
					rowErrors = {
						...rowErrors,
						[treatment.id]: 'Los precios deben ser números válidos (0 o más).'
					};
					return;
				}
				precio_diseno = d;
				precio_fresado = f;
				precio_crc_diseno = dc;
				precio_crc_fresado = fc;
			}
		} else {
			for (const m of materials) {
				if (parsePrice(m.precio_usd) === null || parsePrice(m.precio_crc, 0) === null) {
					rowErrors = {
						...rowErrors,
						[treatment.id]: 'Revisa el precio de cada material.'
					};
					return;
				}
				if (!m.label.trim()) {
					rowErrors = { ...rowErrors, [treatment.id]: 'Cada material necesita nombre.' };
					return;
				}
			}
			const first = materials[0];
			const firstUsd = parsePrice(first.precio_usd)!;
			const firstCrc = parsePrice(first.precio_crc, 0)!;
			if (isDisenoCategory(treatment.categoria)) {
				precio_diseno = firstUsd;
				precio_fresado = 0;
				precio_crc_diseno = firstCrc;
				precio_crc_fresado = 0;
			} else {
				precio_diseno = 0;
				precio_fresado = firstUsd;
				precio_crc_diseno = 0;
				precio_crc_fresado = firstCrc;
			}
		}

		try {
			await updateTreatment(treatment.id, {
				label: treatment.label,
				categoria: treatment.categoria,
				precio_diseno,
				precio_fresado,
				precio_crc_diseno,
				precio_crc_fresado,
				por_arcadas: treatment.por_arcadas,
				sobre_implante: treatment.sobre_implante
			});

			const dbMaterials = getTreatmentMaterials(treatment.value);
			const dbKeys = new Set(dbMaterials.map((m) => m.key));
			const draftKeys = new Set(materials.map((m) => m.key));

			for (const key of dbKeys) {
				if (!draftKeys.has(key)) {
					await deleteTreatmentMaterialInDb(treatment.id, key);
				}
			}

			for (const m of materials) {
				await upsertTreatmentMaterialInDb(treatment.id, {
					key: m.key,
					label: m.label.trim(),
					precio_usd: parsePrice(m.precio_usd)!,
					precio_crc: parsePrice(m.precio_crc, 0)!
				});
			}

			clearRowError(treatment.id);
			await refresh();
		} catch (err) {
			rowErrors = {
				...rowErrors,
				[treatment.id]: err instanceof Error ? err.message : 'No se pudo guardar.'
			};
		}
	}

	async function handleCreate(e: Event) {
		e.preventDefault();
		const isRestauracion = form.categoria === 'restauracion';
		const isDiseno = form.categoria === 'diseno';

		let precio_diseno: number | null;
		let precio_fresado: number | null;
		let precio_crc_diseno: number | null;
		let precio_crc_fresado: number | null;

		if (isRestauracion) {
			precio_diseno = 0;
			precio_fresado = parsePrice(form.precio_fresado);
			precio_crc_diseno = 0;
			precio_crc_fresado = parsePrice(form.precio_crc_fresado, 0);
		} else if (isDiseno) {
			precio_diseno = parsePrice(form.precio_diseno);
			precio_fresado = 0;
			precio_crc_diseno = parsePrice(form.precio_crc_diseno, 0);
			precio_crc_fresado = 0;
		} else {
			precio_diseno = parsePrice(form.precio_diseno);
			precio_fresado = parsePrice(form.precio_fresado);
			precio_crc_diseno = parsePrice(form.precio_crc_diseno, 0);
			precio_crc_fresado = parsePrice(form.precio_crc_fresado, 0);
		}

		if (!form.label.trim()) {
			error = 'Indica el nombre del tratamiento.';
			return;
		}
		if (isDiseno) {
			if (precio_diseno === null || precio_crc_diseno === null) {
				error = 'Los precios de diseño deben ser números válidos (0 o más).';
				return;
			}
		} else if (isRestauracion) {
			if (precio_fresado === null || precio_crc_fresado === null) {
				error = 'Los precios deben ser números válidos (0 o más).';
				return;
			}
		} else if (
			precio_diseno === null ||
			precio_fresado === null ||
			precio_crc_diseno === null ||
			precio_crc_fresado === null
		) {
			error = 'Los precios deben ser números válidos (0 o más).';
			return;
		}

		saving = true;
		error = '';
		try {
			const slugs = new Set(getAllTreatments().map((t) => t.value));
			await createTreatment(
				{
					label: form.label,
					categoria: form.categoria,
					precio_diseno,
					precio_fresado,
					precio_crc_diseno,
					precio_crc_fresado,
					por_arcadas: form.por_arcadas,
					sobre_implante: form.sobre_implante
				},
				slugs
			);
			modalOpen = false;
			await refresh();
		} catch (err) {
			error = err instanceof Error ? err.message : 'No se pudo crear el tratamiento.';
		} finally {
			saving = false;
		}
	}

	async function removeTreatment(treatment: LabTreatment) {
		const ok = confirm(
			`¿Eliminar «${treatment.label}» del catálogo?\n\nYa no aparecerá al crear casos. Los casos existentes conservan su historial.`
		);
		if (!ok) return;

		deletingId = treatment.id;
		clearRowError(treatment.id);
		try {
			await deleteTreatment(treatment.id);
			await refresh();
		} catch (err) {
			rowErrors = {
				...rowErrors,
				[treatment.id]: err instanceof Error ? err.message : 'No se pudo eliminar.'
			};
		} finally {
			deletingId = null;
		}
	}

	function patchTreatment(id: string, patch: Partial<LabTreatment>) {
		treatments = treatments.map((t) => (t.id === id ? { ...t, ...patch } : t));
		clearRowError(id);
	}

	function onAddMaterialSelect(treatment: LabTreatment) {
		addCustomMaterial(treatment);
	}

	function showFlatPrices(treatment: LabTreatment): boolean {
		return !usesMaterialsMode(treatment.id);
	}

	function isDisenoCategory(categoria: TreatmentCategory): boolean {
		return categoria === 'diseno';
	}
</script>

<svelte:window onkeydown={modalOpen ? onModalKeydown : undefined} />

<div class="dash-page">
	<p class="dash-lead">
		Por defecto cada tratamiento usa un <strong>precio base</strong>. Activa «Varios materiales» solo si quieres
		que el cliente elija entre opciones (Zirconio, Resina, etc.) con precio distinto por material.
	</p>

	{#if loading}
		<p class="type-caption">Cargando catálogo desde Supabase…</p>
	{/if}

	<div class="dash-stat-grid dash-stat-grid--compact">
		<div class="dash-stat">
			<p class="dash-stat__label">Visibles al cliente</p>
			<p class="dash-stat__value">{clientVisibleCount}</p>
		</div>
		<div class="dash-stat">
			<p class="dash-stat__label">En catálogo</p>
			<p class="dash-stat__value">{treatments.length}</p>
		</div>
	</div>

	<div class="dash-toolbar">
		<p class="treatments-toolbar__hint type-caption" style="margin: 0; flex: 1;">
			{clientVisibleCount} visibles al cliente · {treatments.length} en catálogo · USD (diseño / fresado) y CRC
		</p>
		<button type="button" class="btn-primary" onclick={openModal}>
			<Plus size={16} strokeWidth={2} />
			Agregar tratamiento
		</button>
	</div>

	{#each grouped as group (group.categoria)}
		<section class="dash-panel treatments-category">
			<h2 class="dash-panel__title">{group.label}</h2>
			{#if group.categoria === 'guias'}
				<p class="type-caption treatments-guia-lead">
					Un solo servicio «Guía quirúrgica». El precio depende de la cantidad de implantes (1–6) al
					crear el caso.
				</p>
				<div class="treatments-guia-tiers data-table-wrap">
					<table class="data-table">
						<thead>
							<tr>
								<th>Implantes</th>
								<th>USD</th>
								<th>CRC</th>
							</tr>
						</thead>
						<tbody>
							{#each IMPLANTES_GUIA_OPTIONS as n (n)}
								<tr>
									<td>{n} {n === 1 ? 'implante' : 'implantes'}</td>
									<td>{formatCurrency(GUIA_PRECIOS_POR_IMPLANTES[n].usd)}</td>
									<td>{formatColones(GUIA_PRECIOS_POR_IMPLANTES[n].crc)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}

			<div class="treatments-list">
				{#each group.items as treatment (treatment.id)}
					<article class="treatment-card">
						<header class="treatment-card__head">
							<div class="treatment-card__identity">
								<input
									type="text"
									class="field-input treatment-card__name"
									value={treatment.label}
									oninput={(e) =>
										patchTreatment(treatment.id, {
											label: (e.currentTarget as HTMLInputElement).value
										})}
								/>
								<p class="treatment-card__code type-fine-print">{treatment.value}</p>
								{#if rowErrors[treatment.id]}
									<p class="treatment-card__error" role="alert">{rowErrors[treatment.id]}</p>
								{/if}
							</div>

							<div class="treatment-card__flags">
								<button
									type="button"
									class="treatments-table__arcadas-btn"
									class:treatments-table__arcadas-btn--active={treatment.por_arcadas}
									aria-pressed={treatment.por_arcadas}
									title="Sin odontograma: el cliente elige arcada superior, inferior o ambas"
									onclick={() =>
										patchTreatment(treatment.id, {
											por_arcadas: !treatment.por_arcadas
										})}
								>
									Por arcadas
								</button>
								<button
									type="button"
									class="treatments-table__arcadas-btn"
									class:treatments-table__arcadas-btn--active={treatment.sobre_implante}
									aria-pressed={treatment.sobre_implante}
									title="El cliente puede marcar «sobre implante» y capturar datos del implante"
									onclick={() =>
										patchTreatment(treatment.id, {
											sobre_implante: !treatment.sobre_implante
										})}
								>
									Sobre implante
								</button>
								<button
									type="button"
									class="treatments-table__arcadas-btn"
									class:treatments-table__arcadas-btn--active={usesMaterialsMode(treatment.id)}
									aria-pressed={usesMaterialsMode(treatment.id)}
									title="Opcional: el cliente elige material al crear el caso"
									onclick={() => toggleMaterialsMode(treatment)}
								>
									Varios materiales
								</button>
							</div>

							<div class="treatment-card__meta">
								<div class="treatment-card__actions">
									<button
										type="button"
										class="btn-pearl-capsule"
										onclick={() => saveRow(treatment)}
									>
										Guardar
									</button>
									<button
										type="button"
										class="text-link treatment-card__delete"
										disabled={deletingId === treatment.id}
										onclick={() => removeTreatment(treatment)}
									>
										{deletingId === treatment.id ? 'Eliminando…' : 'Eliminar'}
									</button>
								</div>
							</div>
						</header>

						{#if usesMaterialsMode(treatment.id)}
						<div class="treatment-card__materials">
							<button
								type="button"
								class="treatment-card__materials-toggle"
								aria-expanded={isMaterialsExpanded(treatment.id)}
								aria-controls="materials-panel-{treatment.id}"
								onclick={() => toggleMaterialsExpanded(treatment.id)}
							>
								<span
									class="treatment-card__materials-chevron"
									class:treatment-card__materials-chevron--open={isMaterialsExpanded(
										treatment.id
									)}
								>
									<ChevronDown size={16} />
								</span>
								<span class="treatment-card__materials-toggle-title">Lista de materiales</span>
								<span class="treatment-card__materials-toggle-meta type-caption">
									{materialsCountLabel(treatment.id)}
								</span>
							</button>

							{#if isMaterialsExpanded(treatment.id)}
								<div
									id="materials-panel-{treatment.id}"
									class="treatment-card__materials-panel data-table-wrap"
								>
									<p class="treatment-card__materials-lead type-caption">
										Agrega los materiales que el cliente podrá elegir. Cada uno con su precio por pieza.
									</p>
									<table class="data-table treatment-materials-table">
								<thead>
									<tr>
										<th>Material</th>
										<th>Precio USD/pza</th>
										<th>Precio CRC/pza</th>
										<th></th>
									</tr>
								</thead>
								<tbody>
									{#each materialList(treatment.id) as mat (mat.key)}
										<tr>
											<td>
												<input
													type="text"
													class="field-input treatment-materials-table__name"
													value={mat.label}
													oninput={(e) =>
														patchMaterialOption(treatment.id, mat.key, {
															label: (e.currentTarget as HTMLInputElement).value
														})}
												/>
											</td>
											<td>
												<input
													type="number"
													class="field-input treatments-table__price"
													min="0"
													step="0.01"
													value={mat.precio_usd}
													oninput={(e) =>
														patchMaterialOption(treatment.id, mat.key, {
															precio_usd: Number((e.currentTarget as HTMLInputElement).value)
														})}
												/>
											</td>
											<td>
												<input
													type="number"
													class="field-input treatments-table__price treatments-table__price--crc"
													min="0"
													step="1"
													value={mat.precio_crc}
													oninput={(e) =>
														patchMaterialOption(treatment.id, mat.key, {
															precio_crc: Number((e.currentTarget as HTMLInputElement).value)
														})}
												/>
											</td>
											<td>
												<button
													type="button"
													class="treatment-materials-table__remove"
													aria-label="Quitar material"
													onclick={() => removeMaterialLocal(treatment.id, mat.key)}
												>
													<Trash2 size={14} />
												</button>
											</td>
										</tr>
									{:else}
										<tr>
											<td colspan="4" class="type-caption treatment-materials-table__empty">
												Aún no hay materiales — agrega al menos uno abajo.
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
								<div class="treatment-card__add-material">
									<input
										type="text"
										class="field-input treatment-card__add-name"
										placeholder="Nombre del material (ej. Zirconio, Resina PEI)"
										value={newMaterialNames[treatment.id] ?? ''}
										oninput={(e) =>
											(newMaterialNames = {
												...newMaterialNames,
												[treatment.id]: (e.currentTarget as HTMLInputElement).value
											})}
									/>
									<button
										type="button"
										class="btn-pearl-capsule"
										onclick={() => onAddMaterialSelect(treatment)}
									>
										<Plus size={14} />
										Agregar material
									</button>
								</div>
								</div>
							{/if}
						</div>
						{/if}

						{#if showFlatPrices(treatment)}
							<div
								class="treatment-card__flat-prices"
								class:treatment-card__flat-prices--diseno={isDisenoCategory(treatment.categoria)}
							>
								<p class="type-caption treatment-card__flat-lead">
									{isDisenoCategory(treatment.categoria)
										? 'Precio base del servicio de diseño'
										: 'Precio base del tratamiento'}
								</p>
								<label class="treatment-card__price-field">
									<span class="field-label">Diseño USD</span>
									<input
										type="number"
										class="field-input treatments-table__price"
										min="0"
										step="0.01"
										value={treatment.precio_diseno}
										oninput={(e) =>
											patchTreatment(treatment.id, {
												precio_diseno: Number((e.currentTarget as HTMLInputElement).value)
											})}
									/>
								</label>
								<label class="treatment-card__price-field">
									<span class="field-label">Diseño CRC</span>
									<input
										type="number"
										class="field-input treatments-table__price treatments-table__price--crc"
										min="0"
										step="1"
										value={treatment.precio_crc_diseno}
										disabled={treatment.precio_diseno <= 0}
										oninput={(e) =>
											patchTreatment(treatment.id, {
												precio_crc_diseno: Number((e.currentTarget as HTMLInputElement).value)
											})}
									/>
								</label>
								{#if !isDisenoCategory(treatment.categoria)}
								<label class="treatment-card__price-field">
									<span class="field-label">Fresado USD</span>
									<input
										type="number"
										class="field-input treatments-table__price"
										min="0"
										step="0.01"
										value={treatment.precio_fresado}
										oninput={(e) =>
											patchTreatment(treatment.id, {
												precio_fresado: Number((e.currentTarget as HTMLInputElement).value)
											})}
									/>
								</label>
								<label class="treatment-card__price-field">
									<span class="field-label">Fresado CRC</span>
									<input
										type="number"
										class="field-input treatments-table__price treatments-table__price--crc"
										min="0"
										step="1"
										value={treatment.precio_crc_fresado}
										disabled={treatment.precio_fresado <= 0}
										oninput={(e) =>
											patchTreatment(treatment.id, {
												precio_crc_fresado: Number((e.currentTarget as HTMLInputElement).value)
											})}
									/>
								</label>
								{/if}
							</div>
						{/if}
					</article>
				{/each}
			</div>
		</section>
	{:else}
		<p class="type-caption">No hay tratamientos en el catálogo.</p>
	{/each}
</div>

{#if modalOpen}
	<div
		class="case-file-modal-backdrop"
		role="presentation"
		onclick={(e) => e.target === e.currentTarget && closeModal()}
	>
		<div
			class="case-file-modal case-file-modal--form"
			role="dialog"
			aria-modal="true"
			aria-labelledby="add-treatment-title"
			onclick={(e) => e.stopPropagation()}
		>
			<div class="case-file-modal__header">
				<div>
					<p class="case-file-modal__eyebrow">Catálogo</p>
					<h2 id="add-treatment-title" class="case-file-modal__title">Nuevo tratamiento</h2>
				</div>
				<button type="button" class="case-file-modal__close" aria-label="Cerrar" onclick={closeModal}>
					<X size={20} />
				</button>
			</div>

			<form class="case-file-modal__body" onsubmit={handleCreate}>
				<div class="case-file-modal__fields">
					{#if error}
						<p class="alert alert--error" role="alert">{error}</p>
					{/if}

					<div>
						<label class="field-label" for="treatment-label">Nombre del tratamiento *</label>
						<input
							id="treatment-label"
							class="field-input"
							type="text"
							placeholder="Ej. Carilla, Barra híbrida"
							bind:value={form.label}
							required
						/>
					</div>

					<div>
						<label class="field-label" for="treatment-categoria">Categoría *</label>
						<select id="treatment-categoria" class="field-select" bind:value={form.categoria}>
							{#each TREATMENT_CATEGORY_ORDER as cat (cat)}
								<option value={cat}>{TREATMENT_CATEGORY_LABELS[cat]}</option>
							{/each}
						</select>
					</div>

					<p class="type-caption">
						{#if form.categoria === 'restauracion'}
							Precio por pieza (diseño incluido). Después puedes activar «Varios materiales» si lo necesitas.
						{:else if form.categoria === 'diseno'}
							Precio del servicio de diseño. «Varios materiales» es opcional en cada tratamiento.
						{:else}
							Precio del servicio (diseño y/o fresado). «Varios materiales» es opcional en cada tratamiento.
						{/if}
					</p>

					{#if form.categoria === 'restauracion'}
						<div class="treatments-form-grid">
							<div>
								<label class="field-label" for="treatment-precio">Precio (USD/pza) *</label>
								<input
									id="treatment-precio"
									class="field-input"
									type="number"
									min="0"
									step="0.01"
									placeholder="98"
									bind:value={form.precio_fresado}
									required
								/>
							</div>
							<div>
								<label class="field-label" for="treatment-precio-crc">Precio (CRC/pza)</label>
								<input
									id="treatment-precio-crc"
									class="field-input"
									type="number"
									min="0"
									step="1"
									placeholder="49000"
									bind:value={form.precio_crc_fresado}
								/>
							</div>
						</div>
					{:else if form.categoria === 'diseno'}
						<div class="treatments-form-grid">
							<div>
								<label class="field-label" for="treatment-diseno">Diseño (USD/pza) *</label>
								<input
									id="treatment-diseno"
									class="field-input"
									type="number"
									min="0"
									step="0.01"
									placeholder="30"
									bind:value={form.precio_diseno}
									required
								/>
							</div>
							<div>
								<label class="field-label" for="treatment-crc-diseno">Diseño (CRC/pza)</label>
								<input
									id="treatment-crc-diseno"
									class="field-input"
									type="number"
									min="0"
									step="1"
									placeholder="4000"
									bind:value={form.precio_crc_diseno}
								/>
							</div>
						</div>
					{:else}
						<div class="treatments-form-grid">
							<div>
								<label class="field-label" for="treatment-diseno">Diseño (USD/pza) *</label>
								<input
									id="treatment-diseno"
									class="field-input"
									type="number"
									min="0"
									step="0.01"
									placeholder="30"
									bind:value={form.precio_diseno}
									required
								/>
							</div>
							<div>
								<label class="field-label" for="treatment-crc-diseno">Diseño (CRC/pza)</label>
								<input
									id="treatment-crc-diseno"
									class="field-input"
									type="number"
									min="0"
									step="1"
									placeholder="4000"
									bind:value={form.precio_crc_diseno}
								/>
							</div>
							<div>
								<label class="field-label" for="treatment-fresado">Fresado (USD/pza) *</label>
								<input
									id="treatment-fresado"
									class="field-input"
									type="number"
									min="0"
									step="0.01"
									placeholder="90"
									bind:value={form.precio_fresado}
									required
								/>
							</div>
							<div>
								<label class="field-label" for="treatment-crc-fresado">Fresado (CRC/pza)</label>
								<input
									id="treatment-crc-fresado"
									class="field-input"
									type="number"
									min="0"
									step="1"
									placeholder="45000"
									bind:value={form.precio_crc_fresado}
								/>
							</div>
						</div>
					{/if}

					<label class="service-check treatments-form-arcadas">
						<input type="checkbox" bind:checked={form.por_arcadas} />
						<span>Por arcadas (sin odontograma; el cliente elige superior, inferior o ambas)</span>
					</label>

					<label class="service-check treatments-form-arcadas">
						<input type="checkbox" bind:checked={form.sobre_implante} />
						<span>Sobre implante (el cliente puede marcarlo y capturar datos del implante)</span>
					</label>

					<p class="type-caption">
						Deja en 0 el precio que no aplique (solo diseño o solo fresado). El identificador interno se
						genera automáticamente.
					</p>
				</div>

				<div class="case-file-modal__footer">
					<button type="button" class="btn-pearl-capsule" onclick={closeModal} disabled={saving}>
						Cancelar
					</button>
					<button type="submit" class="btn-primary" disabled={saving}>
						{saving ? 'Guardando…' : 'Agregar tratamiento'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<style>
	.treatments-guia-lead {
		margin: 0 0 1rem;
	}

	.treatments-guia-tiers {
		margin-bottom: 1rem;
		max-width: 28rem;
	}

	.treatments-category {
		margin-bottom: 1rem;
	}

	.treatments-category:last-child {
		margin-bottom: 0;
	}

	.treatments-toolbar__hint {
		align-self: center;
		color: var(--dash-muted);
	}

	.treatments-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.treatment-card {
		border: 1px solid var(--dash-border);
		border-radius: 0.75rem;
		background: var(--dash-card);
		overflow: hidden;
	}

	.treatment-card__head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: 0.75rem 1rem;
		padding: 0.85rem 1rem;
		border-bottom: 1px solid var(--dash-border);
	}

	.treatment-card__identity {
		flex: 1 1 12rem;
		min-width: 0;
	}

	.treatment-card__name {
		width: 100%;
		min-width: 10rem;
		font-weight: 600;
	}

	.treatment-card__code {
		margin: 0.35rem 0 0;
	}

	.treatment-card__error {
		margin: 0.35rem 0 0;
		font-size: 0.75rem;
		color: #b91c1c;
	}

	.treatment-card__flags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		align-items: center;
	}

	.treatment-card__meta {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.5rem;
		margin-left: auto;
	}

	.treatment-card__actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem 0.65rem;
		justify-content: flex-end;
	}

	.treatment-card__delete {
		color: #b91c1c;
	}

	.treatment-card__delete:hover:not(:disabled) {
		color: #991b1b;
	}

	.treatment-card__delete:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.treatment-card__materials {
		padding: 0;
		border-bottom: 1px solid var(--dash-border);
	}

	.treatment-card__materials-toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.75rem 1rem;
		border: none;
		background: color-mix(in srgb, var(--dash-border) 35%, transparent);
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.treatment-card__materials-toggle:hover {
		background: color-mix(in srgb, var(--dash-border) 55%, transparent);
	}

	.treatment-card__materials-toggle-title {
		font-weight: 600;
		font-size: 0.875rem;
	}

	.treatment-card__materials-toggle-meta {
		margin-left: auto;
		color: var(--dash-muted);
	}

	.treatment-card__materials-chevron {
		display: inline-flex;
		flex-shrink: 0;
		color: var(--dash-muted);
		transition: transform 0.2s ease;
	}

	.treatment-card__materials-chevron--open {
		transform: rotate(180deg);
	}

	.treatment-card__materials-panel {
		padding: 0 1rem 0.75rem;
	}

	.treatment-card__materials-lead {
		margin: 0.65rem 0 0.65rem;
		color: var(--dash-muted);
	}

	.treatment-card__flat-lead {
		grid-column: 1 / -1;
		margin: 0 0 0.25rem;
		color: var(--dash-muted);
	}

	.treatment-materials-table__name {
		min-width: 10rem;
		font-weight: 600;
	}

	.treatment-card__add-material {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		padding: 0.65rem 0 0.25rem;
		align-items: center;
	}

	.treatment-card__add-name {
		flex: 1 1 14rem;
		min-width: 10rem;
	}

	.treatment-materials-table__label {
		font-weight: 600;
		white-space: nowrap;
	}

	.treatment-materials-table__empty {
		padding: 0.75rem 0;
		color: var(--dash-muted);
	}

	.treatment-materials-table__remove {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.35rem;
		border: none;
		background: transparent;
		color: var(--dash-muted);
		cursor: pointer;
		border-radius: 0.35rem;
	}

	.treatment-materials-table__remove:hover:not(:disabled) {
		color: #b91c1c;
		background: color-mix(in srgb, #b91c1c 8%, transparent);
	}

	.treatment-materials-table__remove:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.treatment-card__add-material {
		padding: 0.65rem 0 0.25rem;
	}

	.treatment-card__add-select {
		max-width: 16rem;
	}

	.treatment-card__flat-prices {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.75rem;
		padding: 0.85rem 1rem 1rem;
	}

	.treatment-card__flat-prices--diseno {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.treatment-card__price-field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 0;
	}

	.treatments-table__price--crc {
		width: 100%;
		min-width: 5.5rem;
	}

	.treatments-table__arcadas-btn {
		padding: 0.35rem 0.65rem;
		font-size: 0.75rem;
		font-weight: 600;
		border-radius: 999px;
		border: 1px solid var(--dash-border);
		background: var(--dash-card);
		color: var(--dash-muted);
		cursor: pointer;
		white-space: nowrap;
	}

	.treatments-table__arcadas-btn--active {
		border-color: var(--dash-accent, #2563eb);
		background: color-mix(in srgb, var(--dash-accent, #2563eb) 12%, transparent);
		color: var(--dash-text);
	}

	.treatments-table__arcadas-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.treatments-form-arcadas {
		margin-top: 0.25rem;
	}

	.treatments-table__price {
		width: 100%;
		min-width: 5rem;
	}

	.treatments-form-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
	}

	@media (max-width: 900px) {
		.treatment-card__flat-prices {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.treatment-card__meta {
			width: 100%;
			flex-direction: row;
			align-items: center;
			justify-content: space-between;
			margin-left: 0;
		}
	}

	@media (max-width: 640px) {
		.treatments-form-grid,
		.treatment-card__flat-prices {
			grid-template-columns: 1fr;
		}
	}
</style>
