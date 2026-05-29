import { fontFamily } from "tailwindcss/defaultTheme";

/** @type {import('tailwindcss').Config} */
const config = {
	darkMode: ["class"],
	content: ["./src/**/*.{html,js,svelte,ts}"],
	safelist: ["dark"],
	theme: {
		container: {
			center: true,
			padding: "2rem",
			screens: {
				"2xl": "1400px"
			}
		},
		extend: {
			colors: {
				border: "hsl(var(--border) / <alpha-value>)",
				input: "hsl(var(--input) / <alpha-value>)",
				ring: "hsl(var(--ring) / <alpha-value>)",
				background: "hsl(var(--background) / <alpha-value>)",
				foreground: "hsl(var(--foreground) / <alpha-value>)",
				primary: {
					DEFAULT: "#B3A17D", // Warm brown
					light: "#B3A17D", // Light warm brown
					lighter: "#D4C7AB", // Very light warm brown
					foreground: "#FFFFFF" // White
				},
				secondary: {
					DEFAULT: "#5C4D2E", // Dark warm brown
					light: "#86744E", // Warm brown
					lighter: "#B3A17D", // Light warm brown
					foreground: "#FFFFFF" // White
				},
				destructive: {
					DEFAULT: "#dc2626", // Red
					light: "#fecaca", // Light red
					foreground: "#FFFFFF" // White
				},
				warning: {
					DEFAULT: "#f59e0b", // Orange
					light: "#fef3c7", // Very light orange
				},
				success: {
					DEFAULT: "#86744E", // Warm brown
					light: "#D4C7AB", // Very light warm brown
				},
				info: {
					DEFAULT: "#3b82f6", // Blue
					light: "#dbeafe", // Very light blue
				},
				muted: {
					DEFAULT: "#B3A17D", // Light warm brown
					foreground: "#5C4D2E" // Dark warm brown
				},
				accent: {
					DEFAULT: "#D4C7AB", // Very light warm brown
					foreground: "#5C4D2E" // Dark warm brown
				},
				popover: {
					DEFAULT: "#FFFFFF", // White
					foreground: "#5C4D2E" // Dark warm brown
				},
				card: {
					DEFAULT: "#FFFFFF", // White
					foreground: "#5C4D2E" // Dark warm brown
				},
				neutral: {
					darkest: "#5C4D2E", // Dark warm brown
					dark: "#86744E", // Warm brown
					DEFAULT: "#B3A17D", // Light warm brown
					light: "#D4C7AB", // Very light warm brown
					lighter: "#F5F0E6", // Off-white
					lightest: "#FFFFFF" // White
				}
			},
			borderRadius: {
				lg: "var(--radius)",
				md: "calc(var(--radius) - 2px)",
				sm: "calc(var(--radius) - 4px)"
			},
			fontFamily: {
				sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif', 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji']
			}
		}
	},
};

export default config;
