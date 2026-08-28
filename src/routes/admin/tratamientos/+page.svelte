<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { ChevronDown, Plus, Search, Trash2, X } from '@lucide/svelte';
	import { formatColones, formatCurrency } from '$lib/lab/helpers';
	import {
		TOOTH_SELECTION_MODE_OPTIONS,
		defaultToothSelectionModeForCategory,
		toothSelectionModeLabel
	} from '$lib/lab/constants';
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
	import type { ToothSelectionMode } from '$lib/lab/tooth-selection-mode';
	import { FE_IMPUESTO_TARIFA_OPTIONS, FE_UNIDAD_MEDIDA_OPTIONS, isValidFeCabys } from '$lib/fe/constants';
	import { normalizeImpuestoTarifaForFe } from '$lib/fe/impuesto-tarifa';
	import CabysPicker from '$lib/components/cabys/components/cabys.svelte';
	import type { CabysCatalogEntry } from '$lib/cabys';
	import { cabysImpuestoToTarifa, cabysSuggestedUnidadMedida, normalizeCabys } from '$lib/cabys';

	interface DraftRow {
		label: string;
		categoria: TreatmentCategory;
		precio_diseno: string;
		precio_fresado: string;
		precio_crc_diseno: string;
		precio_crc_fresado: string;
		modo_seleccion_piezas: ToothSelectionMode;
		sobre_implante: boolean;
		fe_cabys: string;
		fe_unidad_medida: string;
		impuesto_tarifa: number;
	}

	let treatments = $state<LabTreatment[]>([]);
	let materialDrafts = $state<Record<string, TreatmentMaterialOption[]>>({});
	let materialsMode = $state<Record<string, boolean>>({});
	let materialsExpanded = $state<Record<string, boolean>>({});
	let expandedTreatments = $state<Record<string, boolean>>({});
	let collapsedCategories = $state<Record<string, boolean>>({});
	let feExpanded = $state<Record<string, boolean>>({});
	let searchQuery = $state('');
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
		modo_seleccion_piezas: 'ninguno',
		sobre_implante: false,
		fe_cabys: '',
		fe_unidad_medida: 'Sp',
		impuesto_tarifa: 13
	});

	let rowErrors = $state<Record<string, string>>({});

	function applyCabysToFe(entry: CabysCatalogEntry): {
		fe_cabys: string | null;
		impuesto_tarifa: number;
		fe_unidad_medida: string;
	} {
		return {
			fe_cabys: normalizeCabys(entry.codigo) || null,
			impuesto_tarifa: normalizeImpuestoTarifaForFe(cabysImpuestoToTarifa(entry.impuesto)),
			fe_unidad_medida: cabysSuggestedUnidadMedida(entry)
		};
	}

	function treatmentFeTarifa(t: LabTreatment): number {
		return normalizeImpuestoTarifaForFe(t.impuesto_tarifa ?? 13);
	}

	async function persistTreatmentFeFields(
		treatmentId: string,
		fe: { fe_cabys: string | null; impuesto_tarifa: number; fe_unidad_medida: string }
	) {
		try {
			const updated = await updateTreatment(treatmentId, {
				fe_cabys: fe.fe_cabys,
				impuesto_tarifa: fe.impuesto_tarifa,
				fe_unidad_medida: fe.fe_unidad_medida
			});
			patchTreatment(treatmentId, {
				fe_cabys: updated.fe_cabys,
				impuesto_tarifa: updated.impuesto_tarifa,
				fe_unidad_medida: updated.fe_unidad_medida
			});
			clearRowError(treatmentId);
		} catch (err) {
			setRowError(
				treatmentId,
				err instanceof Error ? err.message : 'No se pudo guardar CABYS / tarifa IVA.'
			);
		}
	}

	function onTreatmentCabysSelect(
		treatmentId: string,
		entry: CabysCatalogEntry,
		source: 'user' | 'hydrate'
	) {
		const fe = applyCabysToFe(entry);
		patchTreatment(treatmentId, fe);
		if (source === 'user') void persistTreatmentFeFields(treatmentId, fe);
	}

	let clientVisibleCount = $derived(treatments.filter((t) => t.activo).length);
	let grouped = $derived.by(() => {
		const q = searchQuery.trim().toLowerCase();
		const groups = new Map<TreatmentCategory, LabTreatment[]>();
		for (const t of treatments) {
			if (q) {
				const hay = `${t.label} ${t.value} ${t.fe_cabys ?? ''}`.toLowerCase();
				if (!hay.includes(q)) continue;
			}
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
	let visibleCount = $derived(grouped.reduce((n, g) => n + g.items.length, 0));

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

	function isCategoryOpen(categoria: TreatmentCategory): boolean {
		if (searchQuery.trim()) return true;
		return collapsedCategories[categoria] !== true;
	}

	function toggleCategory(categoria: TreatmentCategory) {
		if (searchQuery.trim()) return;
		collapsedCategories = {
			...collapsedCategories,
			[categoria]: isCategoryOpen(categoria)
		};
	}

	function isTreatmentExpanded(treatmentId: string): boolean {
		return expandedTreatments[treatmentId] === true;
	}

	function expandTreatment(treatmentId: string) {
		if (expandedTreatments[treatmentId]) return;
		expandedTreatments = { ...expandedTreatments, [treatmentId]: true };
	}

	function toggleTreatment(treatmentId: string) {
		expandedTreatments = {
			...expandedTreatments,
			[treatmentId]: !isTreatmentExpanded(treatmentId)
		};
	}

	function isFeExpanded(treatmentId: string): boolean {
		return feExpanded[treatmentId] === true;
	}

	function toggleFeExpanded(treatmentId: string) {
		feExpanded = { ...feExpanded, [treatmentId]: !isFeExpanded(treatmentId) };
	}

	function expandAllTreatments() {
		const next: Record<string, boolean> = {};
		for (const t of treatments) next[t.id] = true;
		expandedTreatments = next;
		collapsedCategories = {};
	}

	function collapseAllTreatments() {
		expandedTreatments = {};
		feExpanded = {};
		materialsExpanded = {};
	}

	function hasCabys(treatment: LabTreatment): boolean {
		return Boolean(treatment.fe_cabys?.trim());
	}

	function feSummary(treatment: LabTreatment): string {
		const cabys = treatment.fe_cabys?.trim() ?? '';
		const iva = treatmentFeTarifa(treatment);
		if (!cabys) return `Sin CABYS · IVA ${iva}%`;
		return `${cabys} · IVA ${iva}%`;
	}

	function treatmentPriceSummary(treatment: LabTreatment): string {
		if (usesMaterialsMode(treatment.id)) {
			const mats = materialList(treatment.id);
			if (mats.length === 0) return 'Sin materiales';
			const usds = mats.map((m) => Number(m.precio_usd)).filter((n) => Number.isFinite(n));
			if (usds.length === 0) return materialsCountLabel(treatment.id);
			const min = Math.min(...usds);
			const max = Math.max(...usds);
			const range =
				min === max ? formatCurrency(min) : `${formatCurrency(min)} – ${formatCurrency(max)}`;
			return `${materialsCountLabel(treatment.id)} · ${range}`;
		}
		if (isDisenoCategory(treatment.categoria)) {
			return `${formatCurrency(treatment.precio_diseno)} · ${formatColones(treatment.precio_crc_diseno)}`;
		}
		if (treatment.precio_diseno > 0 && treatment.precio_fresado > 0) {
			return `Diseño ${formatCurrency(treatment.precio_diseno)} · Fresado ${formatCurrency(treatment.precio_fresado)}`;
		}
		if (treatment.precio_fresado > 0) {
			return `${formatCurrency(treatment.precio_fresado)} · ${formatColones(treatment.precio_crc_fresado)}`;
		}
		return `${formatCurrency(treatment.precio_diseno)} · ${formatColones(treatment.precio_crc_diseno)}`;
	}

	function toggleMaterialsMode(treatment: LabTreatment) {
		const next = !usesMaterialsMode(treatment.id);
		materialsMode = { ...materialsMode, [treatment.id]: next };
		if (next) {
			expandTreatment(treatment.id);
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
			setRowError(treatment.id, 'Indica un nombre de material (mín. 2 caracteres).');
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
		initializeLabStorage({ treatments: true });
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
			modo_seleccion_piezas: defaultToothSelectionModeForCategory('otros'),
			sobre_implante: false,
			fe_cabys: '',
			fe_unidad_medida: 'Sp',
			impuesto_tarifa: 13
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

	function setRowError(id: string, message: string) {
		rowErrors = { ...rowErrors, [id]: message };
		expandTreatment(id);
	}

	async function saveRow(treatment: LabTreatment) {
		if (!treatment.label.trim()) {
			setRowError(treatment.id, 'El nombre es obligatorio.');
			return;
		}

		const materialsEnabled = usesMaterialsMode(treatment.id);
		const materials = materialsEnabled ? materialList(treatment.id) : [];
		const hasMaterials = materials.length > 0;

		if (materialsEnabled && !hasMaterials) {
			setRowError(
				treatment.id,
				'Agrega al menos un material o desactiva «Varios materiales» para usar precio base.'
			);
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
					setRowError(
						treatment.id,
						'Los precios de diseño deben ser números válidos (0 o más).'
					);
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
					setRowError(treatment.id, 'Los precios deben ser números válidos (0 o más).');
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
					setRowError(treatment.id, 'Revisa el precio de cada material.');
					return;
				}
				if (!m.label.trim()) {
					setRowError(treatment.id, 'Cada material necesita nombre.');
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

		const cabys = treatment.fe_cabys?.trim() ?? '';
		if (cabys && !isValidFeCabys(cabys)) {
			setRowError(treatment.id, 'CABYS debe tener exactamente 13 dígitos numéricos.');
			return;
		}

		try {
			await updateTreatment(treatment.id, {
				label: treatment.label,
				categoria: treatment.categoria,
				precio_diseno,
				precio_fresado,
				precio_crc_diseno,
				precio_crc_fresado,
				modo_seleccion_piezas: treatment.modo_seleccion_piezas,
				sobre_implante: treatment.sobre_implante,
				fe_cabys: cabys || null,
				fe_unidad_medida: treatment.fe_unidad_medida || 'Sp',
				impuesto_tarifa: treatment.impuesto_tarifa ?? 13
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
			setRowError(treatment.id, err instanceof Error ? err.message : 'No se pudo guardar.');
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
		const createCabys = form.fe_cabys.trim();
		if (createCabys && !isValidFeCabys(createCabys)) {
			error = 'CABYS debe tener exactamente 13 dígitos numéricos.';
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
					modo_seleccion_piezas: form.modo_seleccion_piezas,
					sobre_implante: form.sobre_implante,
					fe_cabys: createCabys || null,
					fe_unidad_medida: form.fe_unidad_medida || 'Sp',
					impuesto_tarifa: form.impuesto_tarifa
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
			setRowError(treatment.id, err instanceof Error ? err.message : 'No se pudo eliminar.');
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
		Cada fila muestra un resumen. Ábrela para editar precios, materiales o factura electrónica. Activa
		«Varios materiales» solo si el cliente debe elegir entre opciones (Zirconio, Resina, etc.).
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

	<div class="dash-toolbar treatments-toolbar">
		<label class="treatments-toolbar__search">
			<span class="treatments-toolbar__search-icon" aria-hidden="true">
				<Search size={16} strokeWidth={2} />
			</span>
			<input
				class="search-input treatments-toolbar__search-input"
				type="search"
				placeholder="Buscar por nombre, código o CABYS…"
				aria-label="Buscar tratamiento"
				bind:value={searchQuery}
			/>
		</label>
		<div class="treatments-toolbar__fold">
			<button type="button" class="text-link" onclick={expandAllTreatments}>Expandir todo</button>
			<span class="treatments-toolbar__sep" aria-hidden="true">·</span>
			<button type="button" class="text-link" onclick={collapseAllTreatments}>Contraer todo</button>
		</div>
		<button type="button" class="btn-primary" onclick={openModal}>
			<Plus size={16} strokeWidth={2} />
			Agregar tratamiento
		</button>
	</div>

	{#if searchQuery.trim()}
		<p class="type-caption treatments-filter-hint">
			Mostrando {visibleCount} de {treatments.length}
		</p>
	{/if}

	{#each grouped as group (group.categoria)}
		<section
			class="dash-panel treatments-category"
			class:treatments-category--open={isCategoryOpen(group.categoria)}
		>
			<button
				type="button"
				class="treatments-category__toggle"
				aria-expanded={isCategoryOpen(group.categoria)}
				aria-controls="treatments-cat-{group.categoria}"
				onclick={() => toggleCategory(group.categoria)}
			>
				<span
					class="treatment-card__chevron"
					class:treatment-card__chevron--open={isCategoryOpen(group.categoria)}
				>
					<ChevronDown size={18} />
				</span>
				<span class="dash-panel__title treatments-category__title">{group.label}</span>
				<span class="treatments-category__count type-caption">
					{group.items.length}
					{group.items.length === 1 ? 'tratamiento' : 'tratamientos'}
				</span>
			</button>

			{#if isCategoryOpen(group.categoria)}
				<div id="treatments-cat-{group.categoria}">
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
						<article
							class="treatment-card"
							class:treatment-card--open={isTreatmentExpanded(treatment.id)}
						>
							{#if !isTreatmentExpanded(treatment.id)}
								<button
									type="button"
									class="treatment-card__summary"
									aria-expanded="false"
									onclick={() => toggleTreatment(treatment.id)}
								>
									<span class="treatment-card__chevron">
										<ChevronDown size={16} />
									</span>
									<div class="treatment-card__summary-main">
										<p class="treatment-card__summary-name">{treatment.label}</p>
										<p class="treatment-card__summary-code type-fine-print">{treatment.value}</p>
										{#if rowErrors[treatment.id]}
											<p class="treatment-card__error" role="alert">{rowErrors[treatment.id]}</p>
										{/if}
									</div>
									<div class="treatment-card__chips">
										<span class="treatment-card__chip">
											{toothSelectionModeLabel(treatment.modo_seleccion_piezas)}
										</span>
										{#if treatment.sobre_implante}
											<span class="treatment-card__chip treatment-card__chip--accent">
												Sobre implante
											</span>
										{/if}
										{#if usesMaterialsMode(treatment.id)}
											<span class="treatment-card__chip">
												{materialsCountLabel(treatment.id)}
											</span>
										{/if}
										{#if !hasCabys(treatment)}
											<span class="treatment-card__chip treatment-card__chip--warn">Sin CABYS</span>
										{/if}
									</div>
									<p class="treatment-card__summary-price">{treatmentPriceSummary(treatment)}</p>
								</button>
							{:else}
								<header class="treatment-card__head">
									<button
										type="button"
										class="treatment-card__collapse"
										aria-expanded="true"
										aria-label="Contraer {treatment.label}"
										onclick={() => toggleTreatment(treatment.id)}
									>
										<span class="treatment-card__chevron treatment-card__chevron--open">
											<ChevronDown size={16} />
										</span>
									</button>
									<div class="treatment-card__identity">
										<input
											type="text"
											class="field-input treatment-card__name"
											value={treatment.label}
											aria-label="Nombre del tratamiento"
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
								</header>

								<div class="treatment-card__body">
									<section class="treatment-card__section">
										<h3 class="treatment-card__section-title">Configuración</h3>
										<div class="treatment-card__config">
											<label class="treatment-card__mode">
												<span class="treatment-card__mode-label">Selección de piezas</span>
												<select
													class="field-select treatment-card__mode-select"
													value={treatment.modo_seleccion_piezas}
													onchange={(e) =>
														patchTreatment(treatment.id, {
															modo_seleccion_piezas: (e.currentTarget as HTMLSelectElement)
																.value as ToothSelectionMode
														})}
												>
													{#each TOOTH_SELECTION_MODE_OPTIONS as option (option.value)}
														<option value={option.value}>{option.label}</option>
													{/each}
												</select>
											</label>
											<div class="treatment-card__flags">
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
													class:treatments-table__arcadas-btn--active={usesMaterialsMode(
														treatment.id
													)}
													aria-pressed={usesMaterialsMode(treatment.id)}
													title="Opcional: el cliente elige material al crear el caso"
													onclick={() => toggleMaterialsMode(treatment)}
												>
													Varios materiales
												</button>
											</div>
										</div>
									</section>

									{#if showFlatPrices(treatment)}
										<section class="treatment-card__section">
											<h3 class="treatment-card__section-title">
												{isDisenoCategory(treatment.categoria)
													? 'Precio base del servicio de diseño'
													: 'Precio base'}
											</h3>
											<div
												class="treatment-card__flat-prices"
												class:treatment-card__flat-prices--diseno={isDisenoCategory(
													treatment.categoria
												)}
											>
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
																precio_diseno: Number(
																	(e.currentTarget as HTMLInputElement).value
																)
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
																precio_crc_diseno: Number(
																	(e.currentTarget as HTMLInputElement).value
																)
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
																	precio_fresado: Number(
																		(e.currentTarget as HTMLInputElement).value
																	)
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
																	precio_crc_fresado: Number(
																		(e.currentTarget as HTMLInputElement).value
																	)
																})}
														/>
													</label>
												{/if}
											</div>
										</section>
									{/if}

									{#if usesMaterialsMode(treatment.id)}
										<section class="treatment-card__section treatment-card__section--flush">
											<button
												type="button"
												class="treatment-card__subtoggle"
												aria-expanded={isMaterialsExpanded(treatment.id)}
												aria-controls="materials-panel-{treatment.id}"
												onclick={() => toggleMaterialsExpanded(treatment.id)}
											>
												<span
													class="treatment-card__chevron"
													class:treatment-card__chevron--open={isMaterialsExpanded(
														treatment.id
													)}
												>
													<ChevronDown size={16} />
												</span>
												<span class="treatment-card__subtoggle-title">Materiales</span>
												<span class="treatment-card__subtoggle-meta type-caption">
													{materialsCountLabel(treatment.id)}
												</span>
											</button>

											{#if isMaterialsExpanded(treatment.id)}
												<div
													id="materials-panel-{treatment.id}"
													class="treatment-card__materials-panel data-table-wrap"
												>
													<p class="treatment-card__materials-lead type-caption">
														Agrega los materiales que el cliente podrá elegir. Cada uno con su
														precio por pieza.
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
																					label: (e.currentTarget as HTMLInputElement)
																						.value
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
																					precio_usd: Number(
																						(e.currentTarget as HTMLInputElement).value
																					)
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
																					precio_crc: Number(
																						(e.currentTarget as HTMLInputElement).value
																					)
																				})}
																		/>
																	</td>
																	<td>
																		<button
																			type="button"
																			class="treatment-materials-table__remove"
																			aria-label="Quitar material"
																			onclick={() =>
																				removeMaterialLocal(treatment.id, mat.key)}
																		>
																			<Trash2 size={14} />
																		</button>
																	</td>
																</tr>
															{:else}
																<tr>
																	<td
																		colspan="4"
																		class="type-caption treatment-materials-table__empty"
																	>
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
																	[treatment.id]: (
																		e.currentTarget as HTMLInputElement
																	).value
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
										</section>
									{/if}

									<section class="treatment-card__section treatment-card__section--flush">
										<button
											type="button"
											class="treatment-card__subtoggle"
											aria-expanded={isFeExpanded(treatment.id)}
											aria-controls="fe-panel-{treatment.id}"
											onclick={() => toggleFeExpanded(treatment.id)}
										>
											<span
												class="treatment-card__chevron"
												class:treatment-card__chevron--open={isFeExpanded(treatment.id)}
											>
												<ChevronDown size={16} />
											</span>
											<span class="treatment-card__subtoggle-title">Factura electrónica</span>
											<span
												class="treatment-card__subtoggle-meta type-caption"
												class:treatment-card__subtoggle-meta--warn={!hasCabys(treatment)}
											>
												{feSummary(treatment)}
											</span>
										</button>

										{#if isFeExpanded(treatment.id)}
											<div id="fe-panel-{treatment.id}" class="treatment-card__fe">
												<div class="treatment-card__price-field treatment-card__price-field--full">
													<CabysPicker
														codigo={treatment.fe_cabys ?? ''}
														label="CABYS (13 dígitos)"
														onSelect={(entry, source) =>
															onTreatmentCabysSelect(treatment.id, entry, source)}
													/>
												</div>
												<label class="treatment-card__price-field">
													<span class="field-label">Tarifa IVA (FE)</span>
													<select
														class="field-select"
														value={String(treatmentFeTarifa(treatment))}
														onchange={(e) =>
															patchTreatment(treatment.id, {
																impuesto_tarifa: normalizeImpuestoTarifaForFe(
																	Number((e.currentTarget as HTMLSelectElement).value)
																)
															})}
													>
														{#each FE_IMPUESTO_TARIFA_OPTIONS as opt (opt.value)}
															<option value={String(opt.value)}>{opt.label}</option>
														{/each}
													</select>
													<span class="type-fine-print">
														Se completa al elegir CABYS; puede ajustarla.
													</span>
												</label>
												<label class="treatment-card__price-field">
													<span class="field-label">Unidad de medida</span>
													<select
														class="field-select"
														value={treatment.fe_unidad_medida}
														onchange={(e) =>
															patchTreatment(treatment.id, {
																fe_unidad_medida: (e.currentTarget as HTMLSelectElement)
																	.value
															})}
													>
														{#each FE_UNIDAD_MEDIDA_OPTIONS as u (u.value)}
															<option value={u.value}>{u.label}</option>
														{/each}
													</select>
												</label>
											</div>
										{/if}
									</section>
								</div>
							{/if}
						</article>
					{/each}
				</div>
				</div>
			{/if}
		</section>
	{:else}
		<p class="type-caption">
			{#if searchQuery.trim() && treatments.length > 0}
				No hay tratamientos que coincidan con «{searchQuery.trim()}».
			{:else}
				No hay tratamientos en el catálogo.
			{/if}
		</p>
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
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
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
						<select id="treatment-categoria" class="field-select" bind:value={form.categoria} onchange={() => {
							form = {
								...form,
								modo_seleccion_piezas: defaultToothSelectionModeForCategory(form.categoria)
							};
						}}>
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

					<div class="treatments-form-mode">
						<label class="field-label" for="treatment-modo-piezas">Selección de piezas</label>
						<select
							id="treatment-modo-piezas"
							class="field-select"
							bind:value={form.modo_seleccion_piezas}
						>
							{#each TOOTH_SELECTION_MODE_OPTIONS as option (option.value)}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
						<p class="type-caption treatments-form-mode__hint">
							Define si el cliente elige arcadas, piezas en el odontograma o no necesita indicar piezas.
						</p>
					</div>

					<label class="service-check treatments-form-arcadas">
						<input type="checkbox" bind:checked={form.sobre_implante} />
						<span>Sobre implante (el cliente puede marcarlo y capturar datos del implante)</span>
					</label>

					<div class="treatments-form-fe">
						<p class="type-caption treatments-form-fe__lead">Factura electrónica (Hacienda)</p>
						<CabysPicker
							bind:codigo={form.fe_cabys}
							label="CABYS (13 dígitos)"
							onSelect={(entry, source) => {
								const fe = applyCabysToFe(entry);
								form.fe_cabys = fe.fe_cabys ?? '';
								form.impuesto_tarifa = fe.impuesto_tarifa;
								form.fe_unidad_medida = fe.fe_unidad_medida;
							}}
						/>
						<div class="treatments-form-grid">
							<div>
								<label class="field-label" for="treatment-fe-unidad">Unidad de medida</label>
								<select
									id="treatment-fe-unidad"
									class="field-select"
									bind:value={form.fe_unidad_medida}
								>
									{#each FE_UNIDAD_MEDIDA_OPTIONS as u (u.value)}
										<option value={u.value}>{u.label}</option>
									{/each}
								</select>
							</div>
							<div>
								<label class="field-label" for="treatment-fe-iva">Tarifa IVA (FE)</label>
								<select
									id="treatment-fe-iva"
									class="field-select"
									bind:value={form.impuesto_tarifa}
								>
									{#each FE_IMPUESTO_TARIFA_OPTIONS as opt (opt.value)}
										<option value={opt.value}>{opt.label}</option>
									{/each}
								</select>
							</div>
						</div>
					</div>

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

	.treatments-category__toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		margin: 0;
		padding: 0;
		border: none;
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.treatments-category--open .treatments-category__toggle {
		margin-bottom: 0.75rem;
	}

	.treatments-filter-hint {
		margin: -0.35rem 0 0.85rem;
	}

	.treatments-category__toggle:hover .treatments-category__title {
		color: var(--dash-accent, #2563eb);
	}

	.treatments-category__title {
		margin: 0;
		flex: 1 1 auto;
		min-width: 0;
	}

	.treatments-category__count {
		margin: 0;
		flex-shrink: 0;
		color: var(--dash-muted);
	}

	.treatments-toolbar {
		gap: 0.65rem 0.75rem;
	}

	.treatments-toolbar__search {
		position: relative;
		flex: 1 1 14rem;
		min-width: 0;
	}

	.treatments-toolbar__search-icon {
		position: absolute;
		top: 50%;
		left: 0.7rem;
		display: flex;
		color: var(--dash-muted);
		transform: translateY(-50%);
		pointer-events: none;
	}

	.treatments-toolbar__search-input {
		width: 100%;
		padding-left: 2.15rem;
	}

	.treatments-toolbar__fold {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-shrink: 0;
	}

	.treatments-toolbar__sep {
		color: var(--dash-muted);
	}

	.treatments-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.treatment-card {
		border: 1px solid var(--dash-border);
		border-radius: 0.75rem;
		background: var(--dash-card);
		overflow: hidden;
	}

	.treatment-card--open {
		box-shadow: 0 0 0 1px color-mix(in srgb, var(--dash-accent, #2563eb) 18%, transparent);
	}

	.treatment-card__chevron {
		display: inline-flex;
		flex-shrink: 0;
		color: var(--dash-muted);
		transition: transform 0.2s ease;
	}

	.treatment-card__chevron--open {
		transform: rotate(180deg);
	}

	.treatment-card__summary {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		grid-template-areas:
			'chevron main price'
			'chevron chips price';
		align-items: center;
		column-gap: 0.75rem;
		row-gap: 0.35rem;
		width: 100%;
		padding: 0.75rem 1rem;
		border: none;
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.treatment-card__summary:hover {
		background: color-mix(in srgb, var(--dash-border) 35%, transparent);
	}

	.treatment-card__summary .treatment-card__chevron {
		grid-area: chevron;
		align-self: start;
		margin-top: 0.15rem;
	}

	.treatment-card__summary-main {
		grid-area: main;
		min-width: 0;
	}

	.treatment-card__summary-name {
		margin: 0;
		font-weight: 600;
		font-size: 0.9375rem;
		line-height: 1.3;
	}

	.treatment-card__summary-code {
		margin: 0.15rem 0 0;
	}

	.treatment-card__chips {
		grid-area: chips;
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}

	.treatment-card__chip {
		display: inline-flex;
		align-items: center;
		padding: 0.15rem 0.5rem;
		border-radius: 999px;
		border: 1px solid var(--dash-border);
		background: color-mix(in srgb, var(--dash-border) 28%, transparent);
		font-size: 0.6875rem;
		font-weight: 600;
		color: var(--dash-muted);
		white-space: nowrap;
	}

	.treatment-card__chip--accent {
		border-color: var(--dash-accent, #2563eb);
		background: color-mix(in srgb, var(--dash-accent, #2563eb) 12%, transparent);
		color: var(--dash-text);
	}

	.treatment-card__chip--warn {
		border-color: color-mix(in srgb, #b45309 45%, var(--dash-border));
		background: color-mix(in srgb, #b45309 10%, transparent);
		color: #b45309;
	}

	.treatment-card__summary-price {
		grid-area: price;
		margin: 0;
		justify-self: end;
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--dash-text);
		white-space: nowrap;
	}

	.treatment-card__head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: 0.65rem 0.85rem;
		padding: 0.85rem 1rem;
		border-bottom: 1px solid var(--dash-border);
	}

	.treatment-card__collapse {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		margin: 0.2rem 0 0;
		padding: 0.2rem;
		border: none;
		border-radius: 0.35rem;
		background: transparent;
		color: inherit;
		cursor: pointer;
	}

	.treatment-card__collapse:hover {
		background: color-mix(in srgb, var(--dash-border) 45%, transparent);
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

	.treatment-card__actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem 0.65rem;
		align-items: center;
		justify-content: flex-end;
		margin-left: auto;
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

	.treatment-card__body {
		display: flex;
		flex-direction: column;
	}

	.treatment-card__section {
		padding: 0.85rem 1rem;
		border-bottom: 1px solid color-mix(in srgb, var(--dash-border) 80%, transparent);
	}

	.treatment-card__section:last-child {
		border-bottom: none;
	}

	.treatment-card__section--flush {
		padding: 0;
	}

	.treatment-card__section-title {
		margin: 0 0 0.65rem;
		font-size: 0.6875rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--dash-muted);
	}

	.treatment-card__config {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 0.75rem 1.25rem;
	}

	.treatment-card__flags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		align-items: center;
		padding-bottom: 0.1rem;
	}

	.treatment-card__subtoggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.75rem 1rem;
		border: none;
		background: color-mix(in srgb, var(--dash-border) 28%, transparent);
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.treatment-card__subtoggle:hover {
		background: color-mix(in srgb, var(--dash-border) 50%, transparent);
	}

	.treatment-card__subtoggle-title {
		font-weight: 600;
		font-size: 0.875rem;
	}

	.treatment-card__subtoggle-meta {
		margin: 0 0 0 auto;
		color: var(--dash-muted);
	}

	.treatment-card__subtoggle-meta--warn {
		color: #b45309;
		font-weight: 600;
	}

	.treatment-card__materials-panel {
		padding: 0 1rem 0.85rem;
	}

	.treatment-card__materials-lead {
		margin: 0.65rem 0 0.65rem;
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

	.treatment-card__fe {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
		padding: 0.15rem 1rem 0.95rem;
	}

	.treatment-card__flat-prices {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.75rem;
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

	.treatment-card__price-field--full {
		grid-column: 1 / -1;
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

	.treatment-card__mode {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 10rem;
	}

	.treatment-card__mode-label {
		font-size: 0.625rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--dash-muted);
	}

	.treatment-card__mode-select {
		min-width: 10rem;
		font-size: 0.8125rem;
	}

	.treatments-form-fe {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-top: 0.5rem;
		padding-top: 0.75rem;
		border-top: 1px solid color-mix(in srgb, var(--color-border) 55%, transparent);
	}

	.treatments-form-fe__lead {
		margin: 0;
		font-weight: 600;
	}

	.treatments-form-mode {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		margin-top: 0.25rem;
	}

	.treatments-form-mode__hint {
		margin: 0;
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

		.treatment-card__summary {
			grid-template-columns: auto minmax(0, 1fr);
			grid-template-areas:
				'chevron main'
				'chevron chips'
				'chevron price';
		}

		.treatment-card__summary-price {
			justify-self: start;
			white-space: normal;
		}

		.treatment-card__actions {
			width: 100%;
			margin-left: 0;
			justify-content: flex-start;
		}

		.treatment-card__fe {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 640px) {
		.treatments-form-grid,
		.treatment-card__flat-prices {
			grid-template-columns: 1fr;
		}

		.treatments-toolbar__fold {
			width: 100%;
			order: 3;
		}
	}
</style>
