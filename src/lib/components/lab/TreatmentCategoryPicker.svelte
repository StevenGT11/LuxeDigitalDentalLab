<script lang="ts">
	import {
		getActiveTreatmentsByCategory,
		getMaterialesRestauracion,
		getTreatmentByValue,
		TREATMENT_CATEGORY_LABELS,
		type TreatmentCategory
	} from '$lib/lab/treatments';
	import {
		getMaterialRestauracionLabel,
		isCoronaRestauracion,
		MATERIALES_RESTAURACION,
		type MaterialRestauracion
	} from '$lib/lab/restoration-pricing';

	type PickerStep = 'categoria' | 'tratamiento' | 'material';

	interface Props {
		id: string;
		selectedValue?: string;
		selectedCategory?: TreatmentCategory | '';
		selectedMaterial?: string;
		coronaSobreImplante?: boolean;
		oncategorychange?: (categoria: TreatmentCategory) => void;
		ontreatmentchange?: (value: string) => void;
		onmaterialchange?: (material: MaterialRestauracion) => void;
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
		selectedMaterial ? getMaterialRestauracionLabel(selectedMaterial) : ''
	);

	const optionsInCategory = $derived(
		catalog.find((g) => g.categoria === activeCategory)?.items ?? []
	);

	const isRestauracion = $derived(activeCategory === 'restauracion');

	const materialesDisponibles = $derived(
		selectedValue ? getMaterialesRestauracion(selectedValue) : []
	);

	const materialLabels = $derived(
		MATERIALES_RESTAURACION.filter((m) => materialesDisponibles.includes(m.value))
	);

	const needsMaterial = $derived(isRestauracion && materialLabels.length > 0);

	const autoStep = $derived.by((): PickerStep | null => {
		if (!activeCategory) return 'categoria';
		if (!selectedValue) return 'tratamiento';
		if (needsMaterial && !selectedMaterial) return 'material';
		return null;
	});

	const openStep = $derived(manualStep ?? autoStep);

	const showCoronaAddon = $derived(
		isRestauracion &&
			isCoronaRestauracion(selectedValue) &&
			!!selectedMaterial &&
			openStep === null
	);

	function selectCategory(categoria: TreatmentCategory) {
		manualStep = null;
		oncategorychange?.(categoria);
	}

	function selectTreatment(value: string) {
		manualStep = null;
		ontreatmentchange?.(value);
	}

	function selectMaterial(material: MaterialRestauracion) {
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
			<div class="treatment-picker__categories" role="group" aria-label="Material de restauración">
				{#each materialLabels as m (m.value)}
					<button
						type="button"
						class="treatment-picker__cat-btn"
						class:is-active={selectedMaterial === m.value}
						aria-pressed={selectedMaterial === m.value}
						onclick={() => selectMaterial(m.value)}
					>
						{m.label}
					</button>
				{/each}
			</div>
		</fieldset>
	{/if}

	{#if showCoronaAddon}
		<div class="treatment-picker__addon-inline">
			<label class="service-check">
				<input
					type="checkbox"
					checked={coronaSobreImplante}
					onchange={(e) => oncoronaimplantechange?.((e.currentTarget as HTMLInputElement).checked)}
				/>
				<span>Corona sobre implante</span>
			</label>
		</div>
	{/if}

	{#if !activeCategory && openStep === null}
		<p class="treatment-picker__hint type-fine-print">Elige una categoría para continuar.</p>
	{/if}
</div>
