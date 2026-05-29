import { browser } from '$app/environment';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'luxe-theme';

let theme = $state<Theme>('light');
let hydrated = $state(false);

function applyTheme(value: Theme) {
	if (!browser) return;
	document.documentElement.setAttribute('data-theme', value);
	document.documentElement.style.colorScheme = value;
}

export function getTheme(): Theme {
	return theme;
}

export function isThemeHydrated(): boolean {
	return hydrated;
}

export function setTheme(value: Theme) {
	theme = value;
	if (browser) {
		localStorage.setItem(STORAGE_KEY, value);
		applyTheme(value);
	}
}

export function toggleTheme() {
	setTheme(theme === 'light' ? 'dark' : 'light');
}

export function hydrateTheme() {
	if (!browser) return;
	const stored = localStorage.getItem(STORAGE_KEY);
	if (stored === 'light' || stored === 'dark') {
		theme = stored;
	} else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
		theme = 'dark';
	}
	applyTheme(theme);
	hydrated = true;
}

/** Evita flash incorrecto antes de hidratar en el cliente */
export function getThemeScript(): string {
	return `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');var d=t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',d?'dark':'light');document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){}})();`;
}
