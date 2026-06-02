<script lang="ts">
	import { goto } from '$app/navigation';
	import { getHomePathForRole } from '$lib/auth/auth';

	let { data } = $props();

	$effect(() => {
		if (data.session && data.profile?.activo) {
			goto(getHomePathForRole(data.profile.role), { replaceState: true });
		}
	});
</script>

<!-- Redirige al portal según rol cuando ya hay sesión -->
