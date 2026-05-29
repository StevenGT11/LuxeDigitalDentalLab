<script lang="ts">
	import { Download } from '@lucide/svelte';
	import { downloadCaseFile, formatFileSize, groupCaseFiles } from '$lib/lab/attachments';
	import type { CaseFile } from '$lib/lab/types';

	interface Props {
		archivos?: CaseFile[];
		emptyMessage?: string;
	}

	let { archivos = [], emptyMessage = 'Sin archivos adjuntos' }: Props = $props();

	const grouped = $derived(groupCaseFiles(archivos));
	const hasFiles = $derived(archivos.length > 0);
</script>

{#if !hasFiles}
	<p class="case-files-empty">{emptyMessage}</p>
{:else}
	<div class="case-files-grid">
		<div class="case-files-group">
			<h4 class="case-files-group__title">Escaneos</h4>
			{#if grouped.escaneos.length === 0}
				<p class="case-files-group__empty">Ningún escaneo</p>
			{:else}
				<ul class="case-files-list">
					{#each grouped.escaneos as file (file.id)}
						<li class="case-files-list__item">
							<div>
								<p class="case-files-list__name">{file.name}</p>
								<p class="case-files-list__meta">{formatFileSize(file.size)}</p>
							</div>
							<button
								type="button"
								class="case-files-list__download"
								onclick={() => downloadCaseFile(file)}
							>
								<Download size={15} strokeWidth={1.75} />
								Descargar
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		<div class="case-files-group">
			<h4 class="case-files-group__title">Diseños</h4>
			{#if grouped.disenos.length === 0}
				<p class="case-files-group__empty">Ningún diseño</p>
			{:else}
				<ul class="case-files-list">
					{#each grouped.disenos as file (file.id)}
						<li class="case-files-list__item">
							<div>
								<p class="case-files-list__name">{file.name}</p>
								<p class="case-files-list__meta">{formatFileSize(file.size)}</p>
							</div>
							<button
								type="button"
								class="case-files-list__download"
								onclick={() => downloadCaseFile(file)}
							>
								<Download size={15} strokeWidth={1.75} />
								Descargar
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</div>
{/if}
