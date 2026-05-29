<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import DeliveryCalendar from '$lib/components/admin/DeliveryCalendar.svelte';
	import { getAllCases, initializeLabStorage } from '$lib/lab/store';
	import type { LabCase } from '$lib/lab/types';

	let casos = $state<LabCase[]>([]);

	function refresh() {
		if (!browser) return;
		initializeLabStorage();
		casos = getAllCases();
	}

	onMount(() => refresh());

	afterNavigate(() => refresh());
</script>

<div class="dash-page dash-page--calendar">
	<p class="dash-lead dash-lead--compact">
		Planifica entregas por día y hora. Selecciona un día en el calendario para ver la agenda completa.
	</p>

	<DeliveryCalendar cases={casos} />
</div>
