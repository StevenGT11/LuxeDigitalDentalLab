<script lang="ts">
	import { invoicePdfFilename, invoicePdfHref } from '$lib/lab/invoice-pdf';
	import { untrack } from 'svelte';

	interface Props {
		open?: boolean;
		invoiceId: string;
		invoiceNumber: string;
	}

	type PreviewPage = { src: string; width: number; height: number };

	let { open = $bindable(false), invoiceId, invoiceNumber }: Props = $props();

	let dialogEl = $state<HTMLDialogElement | null>(null);

	const downloadHref = $derived(invoiceId ? invoicePdfHref(invoiceId, { download: true }) : '');
	const downloadName = $derived(invoicePdfFilename(invoiceNumber || 'factura'));
	const previewPromise = $derived(
		open && invoiceId ? loadPreviewPages(invoicePdfHref(invoiceId)) : null
	);

	function close() {
		open = false;
	}

	async function loadPreviewPages(url: string): Promise<PreviewPage[]> {
		const pdfjs = await import('pdfjs-dist');
		const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
		pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

		const res = await fetch(url);
		if (!res.ok) throw new Error('No se pudo cargar el PDF.');
		const data = await res.arrayBuffer();
		const doc = await pdfjs.getDocument({ data }).promise;
		const rendered: PreviewPage[] = [];
		for (let n = 1; n <= doc.numPages; n++) {
			const page = await doc.getPage(n);
			const viewport = page.getViewport({ scale: 1.45 });
			const canvas = document.createElement('canvas');
			canvas.width = viewport.width;
			canvas.height = viewport.height;
			const ctx = canvas.getContext('2d');
			if (!ctx) throw new Error('No se pudo dibujar la vista previa.');
			await page.render({ canvas, canvasContext: ctx, viewport }).promise;
			rendered.push({
				src: canvas.toDataURL('image/png'),
				width: viewport.width,
				height: viewport.height
			});
		}
		return rendered;
	}

	$effect(() => {
		if (open) {
			untrack(() => dialogEl?.showModal());
		} else {
			untrack(() => dialogEl?.close());
		}
	});
</script>

<dialog
	bind:this={dialogEl}
	class="invoice-pdf-dialog"
	onclick={(e) => e.target === dialogEl && close()}
>
	<div class="invoice-pdf-dialog__panel">
		<header class="invoice-pdf-dialog__header">
			<div>
				<h2 class="invoice-pdf-dialog__title">Vista previa</h2>
				<p class="invoice-pdf-dialog__subtitle">{invoiceNumber || 'Factura'}</p>
			</div>
			<div class="invoice-pdf-dialog__actions">
				<a
					class="btn-primary invoice-pdf-dialog__download"
					href={downloadHref}
					download={downloadName}
				>
					Descargar
				</a>
				<button type="button" class="invoice-pdf-dialog__close" aria-label="Cerrar" onclick={close}>
					×
				</button>
			</div>
		</header>
		<div class="invoice-pdf-dialog__body">
			{#if previewPromise}
				{#await previewPromise}
					<p class="invoice-pdf-dialog__status">Generando vista previa…</p>
				{:then pages}
					{#each pages as page, i (i)}
						<img
							class="invoice-pdf-dialog__page"
							src={page.src}
							alt="Página {i + 1} de {invoiceNumber}"
							width={page.width}
							height={page.height}
						/>
					{/each}
				{:catch err}
					<p class="invoice-pdf-dialog__status invoice-pdf-dialog__status--error">
						{err instanceof Error ? err.message : 'No se pudo mostrar la vista previa.'}
					</p>
				{/await}
			{/if}
		</div>
	</div>
</dialog>

<style>
	.invoice-pdf-dialog {
		margin: auto;
		padding: 0;
		border: none;
		max-width: min(52rem, calc(100vw - 1.5rem));
		width: 100%;
		height: min(90vh, 52rem);
		background: transparent;
		color: var(--dash-text);
	}

	.invoice-pdf-dialog::backdrop {
		background: color-mix(in srgb, var(--dash-sidebar-bg) 55%, transparent);
	}

	.invoice-pdf-dialog__panel {
		display: flex;
		flex-direction: column;
		height: min(90vh, 52rem);
		background: var(--dash-card);
		color: var(--dash-text);
		border: 1px solid var(--dash-border);
		border-radius: var(--dash-radius-lg);
		overflow: hidden;
		box-shadow: var(--dash-shadow-hover);
	}

	.invoice-pdf-dialog__header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		padding: 0.85rem 1.1rem;
		border-bottom: 1px solid var(--dash-border);
	}

	.invoice-pdf-dialog__title {
		margin: 0;
		font-size: 1.05rem;
		font-weight: 600;
	}

	.invoice-pdf-dialog__subtitle {
		margin: 0.15rem 0 0;
		font-size: 0.8125rem;
		color: var(--dash-muted);
	}

	.invoice-pdf-dialog__actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.invoice-pdf-dialog__download {
		font-size: 0.8125rem;
		text-decoration: none;
	}

	.invoice-pdf-dialog__close {
		border: none;
		background: transparent;
		font-size: 1.5rem;
		line-height: 1;
		cursor: pointer;
		color: var(--dash-muted);
	}

	.invoice-pdf-dialog__body {
		flex: 1;
		overflow: auto;
		padding: 1rem;
		background: #d6d3d1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.85rem;
	}

	.invoice-pdf-dialog__page {
		width: min(100%, 48rem);
		height: auto;
		background: #fff;
		box-shadow: 0 8px 24px rgb(0 0 0 / 18%);
	}

	.invoice-pdf-dialog__status {
		margin: 2rem 0;
		color: #334155;
		font-size: 0.9rem;
	}

	.invoice-pdf-dialog__status--error {
		color: #b91c1c;
	}
</style>
