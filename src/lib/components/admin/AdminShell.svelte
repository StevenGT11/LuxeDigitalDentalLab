<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { logout } from '$lib/auth/session.svelte';
	import ThemeToggle from '$lib/components/ui/ThemeToggle.svelte';
	import {
		BarChart3,
		CalendarDays,
		ClipboardList,
		FileText,
		LayoutDashboard,
		LogOut,
		Users
	} from '@lucide/svelte';

	interface NavItem {
		href: string;
		label: string;
		exact?: boolean;
		icon: typeof LayoutDashboard;
	}

	const navItems: NavItem[] = [
		{ href: '/admin', label: 'Resumen', icon: LayoutDashboard, exact: true },
		{ href: '/admin/casos', label: 'Casos recibidos', icon: ClipboardList },
		{ href: '/admin/calendario', label: 'Calendario', icon: CalendarDays },
		{ href: '/admin/clientes', label: 'Clientes', icon: Users },
		{ href: '/admin/facturas', label: 'Facturas', icon: FileText },
		{ href: '/admin/estadisticas', label: 'Estadísticas', icon: BarChart3 }
	];

	const pageTitles: Record<string, string> = {
		'/admin': 'Resumen del laboratorio',
		'/admin/casos': 'Casos recibidos',
		'/admin/calendario': 'Calendario de entregas',
		'/admin/clientes': 'Clientes',
		'/admin/facturas': 'Facturas',
		'/admin/estadisticas': 'Estadísticas de producción'
	};

	let { children } = $props();

	let pageTitle = $derived(
		Object.entries(pageTitles).find(([path]) => {
			if (path === '/admin') return $page.url.pathname === '/admin';
			return $page.url.pathname.startsWith(path);
		})?.[1] ?? 'Administración'
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
			<div class="dash-sidebar__mark" aria-hidden="true">
				<svg viewBox="0 0 32 32" fill="none">
					<path
						d="M8 24V12l8-6 8 6v12l-8 6-8-6z"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linejoin="round"
					/>
					<path d="M16 6v20M8 12l16 12M24 12L8 24" stroke="currentColor" stroke-width="1.5" />
				</svg>
			</div>
			<div>
				<p class="dash-sidebar__name">Luxe Digital</p>
				<p class="dash-sidebar__sub">Dental Lab</p>
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
				<p class="dash-topbar__eyebrow">Panel de administración</p>
				<h1 class="dash-topbar__title">{pageTitle}</h1>
			</div>
			<ThemeToggle />
		</header>
		<main class="dash-content">
			{@render children()}
		</main>
	</div>
</div>
