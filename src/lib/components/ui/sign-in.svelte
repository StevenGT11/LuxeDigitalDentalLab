<script lang="ts">
	import { onMount } from 'svelte';
	import { Eye, EyeOff } from '@lucide/svelte';
	import LuxeLogo from '$lib/components/ui/LuxeLogo.svelte';

	export interface Testimonial {
		initials: string;
		name: string;
		role: string;
		text: string;
	}

	interface Props {
		title?: import('svelte').Snippet;
		description?: string;
		testimonials?: Testimonial[];
		errorMessage?: string;
		submitting?: boolean;
		onsignin?: (data: { username: string; password: string; rememberMe: boolean }) => void;
		onresetpassword?: () => void;
	}

	let {
		description = 'Gestiona casos, escaneos CAD y entregas desde el portal del laboratorio',
		testimonials = [],
		errorMessage = '',
		submitting = false,
		onsignin,
		onresetpassword
	}: Props = $props();

	let showPassword = $state(false);
	let username = $state('');
	let password = $state('');
	let rememberMe = $state(false);
	let activeTestimonial = $state(0);

	onMount(() => {
		if (testimonials.length <= 1) return;
		const timer = setInterval(() => {
			activeTestimonial = (activeTestimonial + 1) % testimonials.length;
		}, 7000);
		return () => clearInterval(timer);
	});

	const currentTestimonial = $derived(testimonials[activeTestimonial] ?? testimonials[0]);

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		onsignin?.({ username, password, rememberMe });
	}
</script>

{#snippet titleSnippet()}
	<span class="luxe-sign-in__eyebrow">Luxe Digital Dental Lab</span>
	<span class="luxe-sign-in__title">Inicia sesión</span>
{/snippet}

<div class="luxe-sign-in flex h-[100dvh] w-[100dvw] flex-col md:flex-row">
	<section class="flex flex-1 items-center justify-center p-8">
		<div class="w-full max-w-md">
			<div class="flex flex-col gap-6">
				<LuxeLogo surface="auto" size={68} class="luxe-sign-in__logo animate-element animate-delay-50" />
				<h1
					class="animate-element animate-delay-100 luxe-sign-in__heading text-4xl leading-tight font-semibold md:text-5xl"
				>
					{@render titleSnippet()}
				</h1>
				<p class="animate-element animate-delay-200 text-muted-foreground">{description}</p>

				{#if errorMessage}
					<p
						class="animate-element animate-delay-250 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600"
						role="alert"
					>
						{errorMessage}
					</p>
				{/if}

				<form class="space-y-5" onsubmit={handleSubmit}>
					<div class="animate-element animate-delay-300">
						<label class="text-sm font-medium text-muted-foreground" for="username"
							>Correo electrónico</label
						>
						<div
							class="luxe-sign-in__input-wrap"
						>
							<input
								id="username"
								name="username"
								type="email"
								autocomplete="email"
								bind:value={username}
								placeholder="tu@clinica.com"
								class="w-full rounded-2xl bg-transparent p-4 text-sm focus:outline-none"
								required
							/>
						</div>
					</div>

					<div class="animate-element animate-delay-400">
						<label class="text-sm font-medium text-muted-foreground" for="password"
							>Contraseña</label
						>
						<div
							class="luxe-sign-in__input-wrap"
						>
							<div class="relative">
								<input
									id="password"
									name="password"
									type={showPassword ? 'text' : 'password'}
									autocomplete="current-password"
									bind:value={password}
									placeholder="Ingresa tu contraseña"
									class="w-full rounded-2xl bg-transparent p-4 pr-12 text-sm focus:outline-none"
									required
								/>
								<button
									type="button"
									class="absolute inset-y-0 right-3 flex items-center"
									onclick={() => (showPassword = !showPassword)}
									aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
								>
									{#if showPassword}
										<EyeOff
											class="h-5 w-5 text-muted-foreground transition-colors hover:text-foreground"
										/>
									{:else}
										<Eye
											class="h-5 w-5 text-muted-foreground transition-colors hover:text-foreground"
										/>
									{/if}
								</button>
							</div>
						</div>
					</div>

					<div
						class="animate-element animate-delay-500 flex items-center justify-between text-sm"
					>
						<label class="flex cursor-pointer items-center gap-3">
							<input type="checkbox" name="rememberMe" class="custom-checkbox" bind:checked={rememberMe} />
							<span class="text-foreground/90">Mantener sesión iniciada</span>
						</label>
						<button
							type="button"
							class="luxe-sign-in__link"
							onclick={() => onresetpassword?.()}
						>
							Restablecer contraseña
						</button>
					</div>

					<button
						type="submit"
						disabled={submitting}
						class="luxe-sign-in__submit animate-element animate-delay-600 w-full rounded-2xl py-4 font-medium transition-colors disabled:opacity-60"
					>
						{submitting ? 'Entrando…' : 'Iniciar sesión'}
					</button>
				</form>
			</div>
		</div>
	</section>

	<section class="luxe-sign-in__hero relative hidden flex-1 p-4 md:block">
		<div class="luxe-sign-in__hero-panel animate-slide-right animate-delay-300">
			<div class="luxe-sign-in__hero-glow" aria-hidden="true"></div>
			<div class="luxe-sign-in__hero-grid" aria-hidden="true"></div>

			<div class="luxe-sign-in__hero-content">
				<LuxeLogo surface="dark" size={80} class="luxe-sign-in__hero-logo" />
				<p class="luxe-sign-in__hero-eyebrow">Laboratorio dental digital</p>
				<h2 class="luxe-sign-in__hero-headline">
					Precisión CAD/CAM,<br />seguimiento en tiempo real
				</h2>
				<ul class="luxe-sign-in__hero-features">
					<li>Casos y piezas por estado</li>
					<li>Escaneos STL y diseño integrado</li>
					<li>Calendario de entregas</li>
				</ul>
			</div>

			{#if currentTestimonial}
				<div class="luxe-sign-in__quote-wrap animate-testimonial animate-delay-1000">
					<figure class="luxe-sign-in__quote">
						<blockquote class="luxe-sign-in__quote-text">“{currentTestimonial.text}”</blockquote>
						<figcaption class="luxe-sign-in__quote-author">
							<span class="luxe-sign-in__quote-avatar" aria-hidden="true">
								{currentTestimonial.initials}
							</span>
							<span class="luxe-sign-in__quote-meta">
								<span class="luxe-sign-in__quote-name">{currentTestimonial.name}</span>
								<span class="luxe-sign-in__quote-role">{currentTestimonial.role}</span>
							</span>
						</figcaption>
					</figure>
					{#if testimonials.length > 1}
						<div class="luxe-sign-in__quote-dots" role="tablist" aria-label="Reseñas">
							{#each testimonials as _, index (index)}
								<button
									type="button"
									class="luxe-sign-in__quote-dot"
									class:is-active={index === activeTestimonial}
									aria-label="Ver reseña {index + 1}"
									onclick={() => (activeTestimonial = index)}
								></button>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</section>
</div>
