<script lang="ts">
	import AddressPicker from '$lib/components/addressPicker/components/addressPicker.svelte';
	import { pickerValuesFromHacienda } from '$lib/components/addressPicker/hacienda-location';
	import type { ClientFeAddress } from '$lib/fe/client-fiscal-address';

	let {
		address = $bindable(),
		required = false,
		showHiddenInputs = true,
		inputPrefix = 'fe'
	}: {
		address: ClientFeAddress;
		required?: boolean;
		/** Hidden inputs for form POST (disable when parent binds fields manually). */
		showHiddenInputs?: boolean;
		inputPrefix?: string;
	} = $props();

	let pickProvince = $state(0);
	let pickCanton = $state(0);
	let pickDistrict = $state(0);
	let hydratedKey = $state('');

	function syncPickerFromAddress() {
		const key = [
			address.fe_provincia ?? '',
			address.fe_canton,
			address.fe_distrito,
			address.fe_otras_senas
		].join('|');
		if (key === hydratedKey) return;
		hydratedKey = key;
		if (address.fe_provincia) {
			const pick = pickerValuesFromHacienda(
				address.fe_provincia,
				address.fe_canton || '01',
				address.fe_distrito || '01'
			);
			pickProvince = pick.province;
			pickCanton = pick.canton;
			pickDistrict = pick.district;
		} else {
			pickProvince = 0;
			pickCanton = 0;
			pickDistrict = 0;
		}
	}

	$effect(() => {
		syncPickerFromAddress();
	});

	$effect(() => {
		if (pickProvince > 0) address.fe_provincia = pickProvince;
		if (pickCanton > 0) address.fe_canton = String(pickCanton).padStart(2, '0');
		if (pickDistrict > 0) address.fe_distrito = String(pickDistrict).padStart(2, '0');
	});
</script>

<div class="client-fe-address">
	<p class="type-caption client-fe-address__hint">
		Provincia, cantón y distrito con códigos Hacienda (catálogo oficial CR).
	</p>
	<AddressPicker
		bind:address={address.fe_otras_senas}
		bind:province={pickProvince}
		bind:canton={pickCanton}
		bind:district={pickDistrict}
		{required}
	/>
	{#if showHiddenInputs}
		<input type="hidden" name="{inputPrefix}_provincia" value={address.fe_provincia ?? ''} />
		<input type="hidden" name="{inputPrefix}_canton" value={address.fe_canton} />
		<input type="hidden" name="{inputPrefix}_distrito" value={address.fe_distrito} />
		<input type="hidden" name="{inputPrefix}_otras_senas" value={address.fe_otras_senas} />
	{/if}
</div>

<style>
	.client-fe-address__hint {
		margin: 0 0 var(--spacing-sm);
		color: var(--color-muted-foreground, #64748b);
	}

	.client-fe-address :global(.ap-root) {
		margin-top: 0;
	}
</style>
