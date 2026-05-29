<script lang="ts">
	import '../app.css';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import SignIn from '$lib/components/ui/sign-in.svelte';
	import type { Testimonial } from '$lib/components/ui/sign-in.svelte';
	import {
		getHomePathForRole,
		hydrateAuth,
		isAuthHydrated,
		isAuthenticated,
		login
	} from '$lib/auth/session.svelte';
	import { hydrateTheme } from '$lib/theme/theme.svelte';
	import ThemeToggle from '$lib/components/ui/ThemeToggle.svelte';

	let { children } = $props();

	let loginError = $state('');

	const testimonials: Testimonial[] = [
		{
			initials: 'EM',
			name: 'Dra. Elena Martínez',
			role: 'Prostodoncista · Clínica Sonrisa',
			text: 'Veo el avance de cada corona sin tener que llamar al laboratorio.'
		},
		{
			initials: 'AG',
			name: 'Dr. Andrés García',
			role: 'Director clínico · Integral Dental',
			text: 'Subimos escaneos y el equipo responde con fechas claras de entrega.'
		},
		{
			initials: 'CL',
			name: 'Dr. Carlos López',
			role: 'Odontología general',
			text: 'Historial, facturas y archivos CAD del paciente en un solo portal.'
		}
	];

	$effect(() => {
		if (browser) {
			hydrateTheme();
			hydrateAuth();
		}
	});

	function handleSignIn(data: { username: string; password: string; rememberMe: boolean }) {
		loginError = '';
		const authRole = login(data.username, data.password);
		if (authRole) {
			goto(getHomePathForRole(authRole));
			return;
		}
		loginError = 'Usuario o contraseña incorrectos. Prueba admin / admin o client / client.';
	}

</script>

<svelte:head>
	<title>Luxe Digital Dental Lab</title>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

{#if !browser || !isAuthHydrated()}
	<div class="luxe-loading flex h-[100dvh] items-center justify-center">
		<p class="text-muted-foreground">Cargando…</p>
	</div>
{:else if !isAuthenticated()}
	<div class="luxe-auth-wrap">
		<div class="luxe-auth-wrap__theme">
			<ThemeToggle />
		</div>
		<SignIn
			description="Accede al portal para dar seguimiento a casos, escaneos y entregas."
			{testimonials}
			errorMessage={loginError}
			onsignin={handleSignIn}
			onresetpassword={() => {
				loginError = 'Contacta al administrador para restablecer tu contraseña.';
			}}
			oncreateaccount={() => {
				loginError = 'El registro estará disponible próximamente.';
			}}
			ongoogle={() => {
				loginError = 'Inicio con Google no está configurado aún.';
			}}
		/>
	</div>
{:else}
	{@render children()}
{/if}
