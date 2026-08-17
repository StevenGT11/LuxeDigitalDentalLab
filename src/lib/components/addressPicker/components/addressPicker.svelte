<script lang="ts">
	import codes from '../utils/costa-rica-codes.json';

	interface Props {
		showAddressInput?: boolean;
		address?: string;
		province?: number;
		canton?: number;
		district?: number;
		provinceError?: string;
		cantonError?: string;
		districtError?: string;
		required?: boolean;
	}

	let {
		showAddressInput = true,
		address = $bindable(''),
		province = $bindable(0),
		canton = $bindable(0),
		district = $bindable(0),
		provinceError = '',
		cantonError = '',
		districtError = '',
		required = false
	}: Props = $props();

	const placeholder = '— Seleccione —';

	const provinceOptions = Object.entries(codes.provinces).map(([code, name]) => ({
		value: Number(code),
		label: name as string
	}));

	const cantonOptions = $derived(
		province > 0
			? Object.entries(codes.cantons)
					.filter(([, v]) => (v as { province: number }).province === province)
					.map(([code, v]) => ({
						value: Number(code) - province * 100,
						label: (v as { name: string }).name
					}))
					.sort((a, b) => a.value - b.value)
			: []
	);

	const districtOptions = $derived(
		province > 0 && canton > 0
			? (() => {
					const fullCanton = province * 100 + canton;
					return Object.entries(codes.districts)
						.filter(([, v]) => (v as { canton: number }).canton === fullCanton)
						.map(([code, v]) => ({
							value: Number(code) - fullCanton * 100,
							label: (v as { name: string }).name
						}))
						.sort((a, b) => a.value - b.value);
				})()
			: []
	);

	function onProvinceChange() {
		canton = 0;
		district = 0;
	}

	function onCantonChange() {
		district = 0;
	}
</script>

<div class="ap-root">
	<div class="ap-row">
		<label class="field ap-field">
			<span class="field-label">Provincia{#if required}<span aria-hidden="true"> *</span>{/if}</span>
			<select
				class="field-select"
				class:field-select--error={Boolean(provinceError)}
				bind:value={province}
				onchange={onProvinceChange}
				{required}
				aria-invalid={provinceError ? 'true' : undefined}
				aria-describedby={provinceError ? 'ap-province-error' : undefined}
			>
				<option value={0} disabled={required}>{placeholder}</option>
				{#each provinceOptions as opt (opt.value)}
					<option value={opt.value}>{opt.label}</option>
				{/each}
			</select>
			{#if provinceError}
				<span class="ap-error type-caption" id="ap-province-error" role="alert">{provinceError}</span>
			{/if}
		</label>

		<label class="field ap-field">
			<span class="field-label">Cantón{#if required}<span aria-hidden="true"> *</span>{/if}</span>
			<select
				class="field-select"
				class:field-select--error={Boolean(cantonError)}
				bind:value={canton}
				onchange={onCantonChange}
				disabled={province === 0}
				required={required && province > 0}
				aria-invalid={cantonError ? 'true' : undefined}
				aria-describedby={cantonError ? 'ap-canton-error' : undefined}
			>
				<option value={0} disabled={required}>{placeholder}</option>
				{#each cantonOptions as opt (opt.value)}
					<option value={opt.value}>{opt.label}</option>
				{/each}
			</select>
			{#if cantonError}
				<span class="ap-error type-caption" id="ap-canton-error" role="alert">{cantonError}</span>
			{/if}
		</label>

		<label class="field ap-field">
			<span class="field-label">Distrito{#if required}<span aria-hidden="true"> *</span>{/if}</span>
			<select
				class="field-select"
				class:field-select--error={Boolean(districtError)}
				bind:value={district}
				disabled={canton === 0}
				required={required && canton > 0}
				aria-invalid={districtError ? 'true' : undefined}
				aria-describedby={districtError ? 'ap-district-error' : undefined}
			>
				<option value={0} disabled={required}>{placeholder}</option>
				{#each districtOptions as opt (opt.value)}
					<option value={opt.value}>{opt.label}</option>
				{/each}
			</select>
			{#if districtError}
				<span class="ap-error type-caption" id="ap-district-error" role="alert">{districtError}</span>
			{/if}
		</label>
	</div>

	{#if showAddressInput}
		<label class="field ap-field ap-field--full">
			<span class="field-label">Otras señas</span>
			<input
				type="text"
				class="field-input"
				bind:value={address}
				placeholder="Descripción de dirección adicional…"
				autocomplete="street-address"
			/>
		</label>
	{/if}
</div>

<style>
	.ap-root {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md, 0.75rem);
		width: 100%;
	}

	.ap-row {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--spacing-md, 0.75rem);
	}

	@media (min-width: 640px) {
		.ap-row {
			grid-template-columns: repeat(3, 1fr);
		}
	}

	.ap-field {
		min-width: 0;
	}

	.ap-field--full {
		grid-column: 1 / -1;
		width: 100%;
	}

	.field-select--error {
		border-color: var(--color-danger, #c0392b);
	}

	.ap-error {
		color: var(--color-danger, #c0392b);
		margin-top: 0.25rem;
	}
</style>
