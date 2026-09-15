<script lang="ts">
	interface Props {
		title: string;
		subtitle?: string;
		detail?: string;
	}

	let { title, subtitle = '', detail = '' }: Props = $props();
</script>

<div class="fe-processing-overlay" role="status" aria-live="polite" aria-busy="true">
	<div class="fe-processing-overlay__panel">
		<div class="fe-processing-overlay__spinner" aria-hidden="true"></div>
		<p class="fe-processing-overlay__title">{title}</p>
		{#if subtitle}
			<p class="fe-processing-overlay__subtitle">{subtitle}</p>
		{/if}
		{#if detail}
			<p class="fe-processing-overlay__detail">{detail}</p>
		{/if}
	</div>
</div>

<style>
	.fe-processing-overlay {
		position: fixed;
		inset: 0;
		z-index: 200;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		background: rgb(15 23 42 / 40%);
		backdrop-filter: blur(2px);
	}

	.fe-processing-overlay__panel {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.65rem;
		padding: 1.75rem 2rem;
		min-width: min(20rem, calc(100vw - 2rem));
		max-width: 24rem;
		border-radius: 10px;
		background: var(--color-card, #fff);
		border: 1px solid var(--color-border, #e2e8f0);
		box-shadow: 0 20px 48px rgb(15 23 42 / 25%);
		text-align: center;
	}

	.fe-processing-overlay__spinner {
		width: 2.25rem;
		height: 2.25rem;
		border: 3px solid color-mix(in srgb, var(--color-border, #cbd5e1) 60%, transparent);
		border-top-color: var(--color-primary, #0f172a);
		border-radius: 50%;
		animation: fe-processing-spin 0.75s linear infinite;
	}

	.fe-processing-overlay__title {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
	}

	.fe-processing-overlay__subtitle {
		margin: 0;
		font-size: 0.875rem;
		font-weight: 500;
	}

	.fe-processing-overlay__detail {
		margin: 0;
		font-size: 0.8125rem;
		color: var(--color-muted-foreground, #64748b);
		line-height: 1.45;
	}

	@keyframes fe-processing-spin {
		to {
			transform: rotate(360deg);
		}
	}

	:global(.fe-processing-blocked) {
		opacity: 0.55;
		pointer-events: none;
		user-select: none;
		transition: opacity 0.15s ease;
	}
</style>
