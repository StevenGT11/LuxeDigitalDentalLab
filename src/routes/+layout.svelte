<script lang="ts">
	import '../app.css';
	import { browser } from '$app/environment';
	import { goto, invalidateAll } from '$app/navigation';
	import SignIn from '$lib/components/ui/sign-in.svelte';
	import type { Testimonial } from '$lib/components/ui/sign-in.svelte';
	import { getHomePathForRole, signInWithEmail } from '$lib/auth/auth';
	import { hydrateLabDataOnce } from '$lib/lab/store';
	import { hydrateTreatmentsCatalogOnce } from '$lib/lab/treatments';
	import { hydrateTheme } from '$lib/theme/theme.svelte';
	import ThemeToggle from '$lib/components/ui/ThemeToggle.svelte';
	import { faviconForTheme } from '$lib/brand/assets';
	import { getTheme } from '$lib/theme/theme.svelte';

	let { children, data } = $props();

	let loginError = $state('');
	let signingIn = $state(false);

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

	const isLoggedIn = $derived(Boolean(data.session && data.profile?.activo));

	$effect(() => {
		if (browser) hydrateTheme();
	});

	$effect(() => {
		if (!browser) return;
		const href = faviconForTheme(getTheme());
		const link = document.querySelector<HTMLLinkElement>('link#luxe-favicon');
		if (link && link.href !== new URL(href, window.location.origin).href) {
			link.href = href;
		}
	});

	$effect(() => {
		if (browser && data.session && data.profile?.activo) {
			void hydrateTreatmentsCatalogOnce();
			void hydrateLabDataOnce();
		}
	});

	async function handleSignIn(payload: { username: string; password: string; rememberMe: boolean }) {
		loginError = '';
		signingIn = true;
		const result = await signInWithEmail(payload.username, payload.password);
		signingIn = false;

		if ('error' in result) {
			loginError = result.error;
			return;
		}

		await invalidateAll();
		goto(getHomePathForRole(result.role));
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

{#if !isLoggedIn}
	<div class="luxe-auth-wrap">
		<div class="luxe-auth-wrap__theme">
			<ThemeToggle />
		</div>
		<SignIn
			description="Accede con tu correo y contraseña del laboratorio."
			{testimonials}
			errorMessage={loginError}
			submitting={signingIn}
			onsignin={handleSignIn}
			onresetpassword={() => {
				loginError = 'Contacta al administrador para restablecer tu contraseña.';
			}}
		/>
	</div>
{:else}
	{@render children()}
{/if}
