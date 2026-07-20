<script lang="ts">
	import {
		getActiveTreatmentsByCategory,
		getTreatmentByValue,
		getTreatmentMaterials,
		TREATMENT_CATEGORY_LABELS,
		type TreatmentCategory
	} from '$lib/lab/treatments';
	import { getTreatmentMaterialLabel, treatmentHasMaterials } from '$lib/lab/treatment-materials';
	import { isSobreImplanteTreatment } from '$lib/lab/sobre-implante';

	type PickerStep = 'categoria' | 'tratamiento' | 'material';

	interface Props {
		id: string;
		selectedValue?: string;
		selectedCategory?: TreatmentCategory | '';
		selectedMaterial?: string;
		coronaSobreImplante?: boolean;
		oncategorychange?: (categoria: TreatmentCategory) => void;
		ontreatmentchange?: (value: string) => void;
		onmaterialchange?: (material: string) => void;
		oncoronaimplantechange?: (activo: boolean) => void;
	}

	let {
		id,
		selectedValue = '',
		selectedCategory = '',
		selectedMaterial = '',
		coronaSobreImplante = false,
		oncategorychange,
		ontreatmentchange,
		onmaterialchange,
		oncoronaimplantechange
	}: Props = $props();

	let manualStep = $state<PickerStep | null>(null);

	const catalog = $derived(getActiveTreatmentsByCategory());

	const activeCategory = $derived.by(() => {
		if (selectedCategory) return selectedCategory;
		const t = selectedValue ? getTreatmentByValue(selectedValue) : undefined;
		return t?.categoria ?? '';
	});

	const categoryLabel = $derived(
		activeCategory ? TREATMENT_CATEGORY_LABELS[activeCategory] : ''
	);

	const treatmentLabel = $derived(
		selectedValue ? (getTreatmentByValue(selectedValue)?.label ?? selectedValue) : ''
	);

	const materialLabel = $derived(
		selectedValue && selectedMaterial
			? getTreatmentMaterialLabel(selectedValue, selectedMaterial)
			: ''
	);

	const optionsInCategory = $derived(
		catalog.find((g) => g.categoria === activeCategory)?.items ?? []
	);

	const materialesDisponibles = $derived(
		selectedValue ? getTreatmentMaterials(selectedValue) : []
	);

	const needsMaterial = $derived(
		selectedValue ? treatmentHasMaterials(selectedValue) && materialesDisponibles.length > 0 : false
	);

	const autoStep = $derived.by((): PickerStep | null => {
		if (!activeCategory) return 'categoria';
		if (!selectedValue) return 'tratamiento';
		if (needsMaterial && !selectedMaterial) return 'material';
		return null;
	});

	const openStep = $derived(manualStep ?? autoStep);

	const showSobreImplanteAddon = $derived.by(() => {
		if (!selectedValue || !isSobreImplanteTreatment(selectedValue) || openStep !== null) {
			return false;
		}
		if (needsMaterial) return !!selectedMaterial;
		return true;
	});

	function selectCategory(categoria: TreatmentCategory) {
		manualStep = null;
		oncategorychange?.(categoria);
	}

	function selectTreatment(value: string) {
		manualStep = null;
		ontreatmentchange?.(value);
	}

	function selectMaterial(material: string) {
		manualStep = null;
		onmaterialchange?.(material);
	}

	function editStep(step: PickerStep) {
		manualStep = step;
	}
</script>

<div class="treatment-picker" id="{id}-picker">
	{#if activeCategory && openStep !== 'categoria'}
		<div class="treatment-picker__summary">
			<span class="treatment-picker__summary-label">Categoría</span>
			<span class="treatment-picker__summary-value">{categoryLabel}</span>
			<button type="button" class="treatment-picker__summary-edit" onclick={() => editStep('categoria')}>
				Cambiar
			</button>
		</div>
	{/if}

	{#if openStep === 'categoria'}
		<fieldset class="treatment-picker__fieldset">
			<legend class="field-label">Categoría *</legend>
			<div class="treatment-picker__categories" role="tablist" aria-label="Categorías de tratamiento">
				{#each catalog as group (group.categoria)}
					<button
						type="button"
						role="tab"
						id="{id}-cat-{group.categoria}"
						class="treatment-picker__cat-btn"
						class:is-active={activeCategory === group.categoria}
						aria-selected={activeCategory === group.categoria}
						aria-controls="{id}-options-{group.categoria}"
						onclick={() => selectCategory(group.categoria)}
					>
						{group.label}
					</button>
				{/each}
			</div>
		</fieldset>
	{/if}

	{#if selectedValue && openStep !== 'tratamiento'}
		<div class="treatment-picker__summary">
			<span class="treatment-picker__summary-label">Tratamiento</span>
			<span class="treatment-picker__summary-value">{treatmentLabel}</span>
			<button type="button" class="treatment-picker__summary-edit" onclick={() => editStep('tratamiento')}>
				Cambiar
			</button>
		</div>
	{/if}

	{#if openStep === 'tratamiento' && activeCategory}
		<fieldset class="treatment-picker__fieldset">
			<legend class="field-label">Tratamiento *</legend>
			<div
				class="treatment-picker__options"
				id="{id}-options-{activeCategory}"
				role="tabpanel"
				aria-labelledby="{id}-cat-{activeCategory}"
			>
				{#each optionsInCategory as treatment (treatment.id)}
					<button
						type="button"
						class="treatment-picker__option"
						class:is-selected={selectedValue === treatment.value}
						aria-pressed={selectedValue === treatment.value}
						onclick={() => selectTreatment(treatment.value)}
					>
						<span class="treatment-picker__option-name">{treatment.label}</span>
					</button>
				{/each}
			</div>
		</fieldset>
	{/if}

	{#if needsMaterial && selectedMaterial && openStep !== 'material'}
		<div class="treatment-picker__summary">
			<span class="treatment-picker__summary-label">Material</span>
			<span class="treatment-picker__summary-value">{materialLabel}</span>
			<button type="button" class="treatment-picker__summary-edit" onclick={() => editStep('material')}>
				Cambiar
			</button>
		</div>
	{/if}

	{#if openStep === 'material'}
		<fieldset class="treatment-picker__fieldset">
			<legend class="field-label">Material *</legend>
			<div class="treatment-picker__categories" role="group" aria-label="Material">
				{#each materialesDisponibles as m (m.key)}
					<button
						type="button"
						class="treatment-picker__cat-btn"
						class:is-active={selectedMaterial === m.key}
						aria-pressed={selectedMaterial === m.key}
						onclick={() => selectMaterial(m.key)}
					>
						{m.label}
					</button>
				{/each}
			</div>
		</fieldset>
	{/if}

	{#if showSobreImplanteAddon}
		<div class="treatment-picker__implante-addons">
			<span class="field-label">¿Este trabajo va sobre implante?</span>
			<button
				type="button"
				class="treatment-picker__implante-toggle"
				class:is-active={coronaSobreImplante}
				aria-pressed={coronaSobreImplante}
				onclick={() => oncoronaimplantechange?.(!coronaSobreImplante)}
			>
				Sobre implante
			</button>
		</div>
	{/if}

	{#if !activeCategory && openStep === null}
		<div class="alert alert--info alert--compact treatment-picker__hint" role="status">
			Elige una categoría para continuar.
		</div>
	{/if}
</div>
