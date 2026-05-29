<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { logout } from '$lib/auth/session.svelte';

	interface NavLink {
		href: string;
		label: string;
		exact?: boolean;
	}

	interface Props {
		mode: 'admin' | 'client';
		subnavTitle: string;
		links: NavLink[];
		primaryCta?: { href: string; label: string };
	}

	let { mode, subnavTitle, links, primaryCta }: Props = $props();

	function isActive(href: string, exact = false): boolean {
		const path = $page.url.pathname;
		if (exact) return path === href;
		return path === href || path.startsWith(href + '/');
	}
</script>

<div class="app-shell">
	<header class="global-nav">
		<div class="global-nav__inner">
			<button
				type="button"
				class="global-nav__brand"
				onclick={() => goto(mode === 'admin' ? '/admin' : '/client')}
			>
				Luxe Dental Lab
			</button>
			<nav class="global-nav__links global-nav__links--hide-mobile">
				{#if mode === 'admin'}
					<a href="/admin" class="global-nav__link" class:is-active={isActive('/admin', true) || isActive('/admin/')}>
						Admin
					</a>
				{:else}
					<a href="/client" class="global-nav__link" class:is-active={isActive('/client', true)}>
						Cliente
					</a>
				{/if}
				<button type="button" class="global-nav__link" onclick={() => goto('/')}>Inicio</button>
			</nav>
			<button
				type="button"
				class="btn-dark-utility"
				onclick={() => {
					logout();
					goto('/');
				}}
			>
				Salir
			</button>
		</div>
	</header>

	<div class="sub-nav-frosted">
		<div class="sub-nav-frosted__inner">
			<h2 class="sub-nav-frosted__title">{subnavTitle}</h2>
			<nav class="sub-nav-frosted__links sub-nav-frosted__links--hide-mobile">
				{#each links as link}
					<a
						href={link.href}
						class="sub-nav-frosted__link"
						class:is-active={isActive(link.href, link.exact)}
					>
						{link.label}
					</a>
				{/each}
			</nav>
			{#if primaryCta}
				<a href={primaryCta.href} class="btn-primary">{primaryCta.label}</a>
			{/if}
		</div>
	</div>

	<main class="flex-1">
		<slot />
	</main>

	<footer class="site-footer">
		<div class="site-footer__inner">
			<p class="site-footer__legal">© Luxe Digital Dental Lab · Laboratorio dental digital</p>
		</div>
	</footer>
</div>
