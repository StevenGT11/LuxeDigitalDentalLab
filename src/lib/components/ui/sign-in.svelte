<script lang="ts">
	import { onMount } from 'svelte';
	import { Eye, EyeOff } from '@lucide/svelte';

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
		ongoogle?: () => void;
		onresetpassword?: () => void;
		oncreateaccount?: () => void;
	}

	let {
		description = 'Gestiona casos, escaneos CAD y entregas desde el portal del laboratorio',
		testimonials = [],
		errorMessage = '',
		submitting = false,
		onsignin,
		ongoogle,
		onresetpassword,
		oncreateaccount
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

				<div class="animate-element animate-delay-700 relative flex items-center justify-center">
					<span class="w-full border-t border-border"></span>
					<span class="absolute px-4 text-sm text-muted-foreground luxe-sign-in__divider-label"
						>O continúa con</span
					>
				</div>

				<button
					type="button"
					class="animate-element animate-delay-800 flex w-full items-center justify-center gap-3 rounded-2xl border border-border py-4 transition-colors hover:bg-secondary"
					onclick={() => ongoogle?.()}
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 48 48" aria-hidden="true">
						<path
							fill="#FFC107"
							d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s12-5.373 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-2.641-.21-5.236-.611-7.743z"
						/>
						<path
							fill="#FF3D00"
							d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
						/>
						<path
							fill="#4CAF50"
							d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
						/>
						<path
							fill="#1976D2"
							d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C42.022 35.026 44 30.038 44 24c0-2.641-.21-5.236-.611-7.743z"
						/>
					</svg>
					Continuar con Google
				</button>

				<p class="animate-element animate-delay-900 text-center text-sm text-muted-foreground">
					¿Nuevo en la plataforma?
					<button
						type="button"
						class="luxe-sign-in__link transition-colors hover:underline"
						onclick={() => oncreateaccount?.()}
					>
						Crear cuenta
					</button>
				</p>
			</div>
		</div>
	</section>

	<section class="luxe-sign-in__hero relative hidden flex-1 p-4 md:block">
		<div class="luxe-sign-in__hero-panel animate-slide-right animate-delay-300">
			<div class="luxe-sign-in__hero-glow" aria-hidden="true"></div>
			<div class="luxe-sign-in__hero-grid" aria-hidden="true"></div>

			<div class="luxe-sign-in__hero-content">
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
