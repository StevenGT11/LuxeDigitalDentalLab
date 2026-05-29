import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combines class names using clsx and tailwind-merge
 * @param {...(string | undefined | null | false)} inputs
 * @returns {string}
 */
export function cn(...inputs) {
	return twMerge(clsx(inputs));
}

/**
 * Type helper for components that accept element refs
 * @template {HTMLElement} T
 * @typedef {import('svelte').Snippet} Snippet
 * @typedef {Object} WithElementRef
 * @property {import('svelte').Snippet<[props: { ref: import('svelte').Snippet<[el: T]> }]>} [children]
 * @property {import('svelte').Snippet<[el: T]>} [ref]
 */

/**
 * Type helper for components that don't accept children
 * @template T
 * @typedef {Omit<T, 'children'>} WithoutChild
 */
