<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { logout } from '$lib/auth/session.svelte';
	import ThemeToggle from '$lib/components/ui/ThemeToggle.svelte';
	import { ClipboardList, LogOut, PlusCircle, User } from '@lucide/svelte';

	interface NavItem {
		href: string;
		label: string;
		exact?: boolean;
		icon: typeof ClipboardList;
	}

	const navItems: NavItem[] = [
		{ href: '/client', label: 'Mis casos', icon: ClipboardList, exact: true },
		{ href: '/client/nuevo', label: 'Enviar caso', icon: PlusCircle },
		{ href: '/client/perfil', label: 'Mi perfil', icon: User }
	];

	const pageTitles: Record<string, string> = {
		'/client': 'Mis casos',
		'/client/nuevo': 'Enviar nuevo caso',
		'/client/perfil': 'Mi perfil'
	};

	let { children } = $props();

	let pageTitle = $derived(
		Object.entries(pageTitles).find(([path]) => {
			if (path === '/client') return $page.url.pathname === '/client';
			return $page.url.pathname.startsWith(path);
		})?.[1] ?? 'Portal cliente'
	);

	function isActive(href: string, exact = false): boolean {
		const path = $page.url.pathname;
		if (exact) return path === href || path === href + '/';
		return path === href || path.startsWith(href + '/');
	}
</script>

<div class="dash-layout">
	<aside class="dash-sidebar">
		<div class="dash-sidebar__brand">
			<div class="dash-sidebar__mark dash-sidebar__mark--client" aria-hidden="true">
				<svg viewBox="0 0 32 32" fill="none">
					<path
						d="M16 6c-4 0-7 3-7 7v2H7v12h18V15h-2v-2c0-4-3-7-7-7zm0 3c2.2 0 4 1.8 4 4v2h-8v-2c0-2.2 1.8-4 4-4z"
						fill="currentColor"
					/>
				</svg>
			</div>
			<div>
				<p class="dash-sidebar__name">Luxe Digital</p>
				<p class="dash-sidebar__sub">Portal cliente</p>
			</div>
		</div>

		<nav class="dash-sidebar__nav">
			{#each navItems as item}
				{@const Icon = item.icon}
				<a
					href={item.href}
					class="dash-sidebar__link"
					class:is-active={isActive(item.href, item.exact)}
				>
					<span class="dash-sidebar__link-icon"><Icon size={18} strokeWidth={1.75} /></span>
					{item.label}
				</a>
			{/each}
		</nav>

		<div class="dash-sidebar__footer">
			<button
				type="button"
				class="dash-sidebar__logout"
				onclick={() => {
					logout();
					goto('/');
				}}
			>
				<LogOut size={16} strokeWidth={1.75} />
				Cerrar sesión
			</button>
		</div>
	</aside>

	<div class="dash-main">
		<header class="dash-topbar">
			<div class="dash-topbar__titles">
				<p class="dash-topbar__eyebrow">Portal del cliente</p>
				<h1 class="dash-topbar__title">{pageTitle}</h1>
			</div>
			<ThemeToggle />
		</header>
		<main class="dash-content">
			{@render children()}
		</main>
	</div>
</div>
