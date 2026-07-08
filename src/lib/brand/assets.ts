export const BRAND_NAME = 'Luxe Digital Dental Lab';
export const BRAND_SHORT = 'Luxe Digital';

/** Icono oscuro — para fondos claros */
export const LOGO_FOR_LIGHT_BG = '/LUXE_NEGRO_ICONO.png';

/** Icono claro — para fondos oscuros */
export const LOGO_FOR_DARK_BG = '/LUXE_BLANCO_ICONO.png';

export const FAVICON_FOR_LIGHT_THEME = '/favicon-light.png';
export const FAVICON_FOR_DARK_THEME = '/favicon-dark.png';
export const APPLE_TOUCH_ICON = '/apple-touch-icon.png';

export function logoForTheme(theme: 'light' | 'dark'): string {
	return theme === 'dark' ? LOGO_FOR_DARK_BG : LOGO_FOR_LIGHT_BG;
}

export function faviconForTheme(theme: 'light' | 'dark'): string {
	return theme === 'dark' ? FAVICON_FOR_DARK_THEME : FAVICON_FOR_LIGHT_THEME;
}
