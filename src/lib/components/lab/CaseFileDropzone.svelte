<script lang="ts">
	import { FileUp, Trash2, X } from '@lucide/svelte';
	import {
		CASE_FILE_ACCEPT,
		formatFileSize,
		reviewIncomingFiles,
		type PendingFileReview
	} from '$lib/lab/attachments';

	interface Props {
		id: string;
		label: string;
		description: string;
		files?: File[];
	}

	let { id, label, description, files = $bindable([]) }: Props = $props();

	let inputEl = $state<HTMLInputElement | null>(null);
	let dragOver = $state(false);
	let zoneError = $state('');
	let modalOpen = $state(false);
	let pendingReview = $state<PendingFileReview[]>([]);
	let pendingErrors = $state<string[]>([]);

	const pendingValid = $derived(pendingReview.filter((item) => item.valid && !item.duplicate));
	const pendingTotalBytes = $derived(pendingValid.reduce((sum, item) => sum + item.file.size, 0));
	const canConfirm = $derived(pendingValid.length > 0);

	function openReview(incoming: FileList | File[]) {
		zoneError = '';
		const review = reviewIncomingFiles(incoming, files);
		pendingReview = review.items;
		pendingErrors = review.errors;

		if (review.items.length === 0) {
			zoneError = review.errors[0] ?? 'No se seleccionaron archivos.';
			return;
		}

		modalOpen = true;
	}

	function closeModal() {
		modalOpen = false;
		pendingReview = [];
		pendingErrors = [];
	}

	function confirmUpload() {
		const toAdd = pendingValid.map((item) => item.file);
		if (toAdd.length === 0) return;

		files = [...files, ...toAdd];
		if (pendingErrors.length > 0) {
			zoneError = pendingErrors.join(' ');
		} else {
			zoneError = '';
		}
		closeModal();
	}

	function onInputChange(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		if (input.files?.length) openReview(input.files);
		input.value = '';
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		if (e.dataTransfer?.files?.length) openReview(e.dataTransfer.files);
	}

	function removeFile(index: number) {
		files = files.filter((_, i) => i !== index);
		zoneError = '';
	}

	function onModalKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') closeModal();
	}
</script>

<svelte:window onkeydown={modalOpen ? onModalKeydown : undefined} />

<div class="case-file-zone">
	<span class="field-label" id="{id}-label">{label}</span>
	<p class="case-file-zone__desc">{description}</p>

	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		class="case-file-zone__drop"
		class:case-file-zone__drop--active={dragOver}
		role="group"
		aria-labelledby="{id}-label"
		ondragover={(e) => {
			e.preventDefault();
			dragOver = true;
		}}
		ondragleave={() => (dragOver = false)}
		ondrop={onDrop}
	>
		<FileUp size={22} strokeWidth={1.75} aria-hidden="true" />
		<p class="case-file-zone__drop-text">
			Arrastra varios archivos aquí o
			<button type="button" class="text-link case-file-zone__browse" onclick={() => inputEl?.click()}>
				selecciónalos de una vez
			</button>
		</p>
		<p class="case-file-zone__formats">STL, PLY, OBJ, ZIP, PDF, JPG, PNG</p>
		<input
			bind:this={inputEl}
			{id}
			class="case-file-zone__input"
			type="file"
			multiple
			accept={CASE_FILE_ACCEPT}
			onchange={onInputChange}
		/>
	</div>

	{#if zoneError}
		<p class="case-file-zone__error">{zoneError}</p>
	{/if}

	{#if files.length > 0}
		<ul class="case-file-zone__list">
			{#each files as file, index (file.name + file.size + index)}
				<li class="case-file-zone__item">
					<div class="case-file-zone__item-info">
						<span class="case-file-zone__item-name">{file.name}</span>
						<span class="case-file-zone__item-size">{formatFileSize(file.size)}</span>
					</div>
					<button
						type="button"
						class="case-file-zone__remove"
						aria-label="Quitar {file.name}"
						onclick={() => removeFile(index)}
					>
						<Trash2 size={15} strokeWidth={1.75} />
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

{#if modalOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="case-file-modal__backdrop" onclick={closeModal} role="presentation"></div>
	<div
		class="case-file-modal"
		role="dialog"
		aria-modal="true"
		aria-labelledby="{id}-modal-title"
		tabindex="-1"
	>
		<header class="case-file-modal__header">
			<div>
				<p class="case-file-modal__eyebrow">{label}</p>
				<h3 class="case-file-modal__title" id="{id}-modal-title">Resumen de archivos</h3>
			</div>
			<button type="button" class="case-file-modal__close" aria-label="Cerrar" onclick={closeModal}>
				<X size={18} strokeWidth={1.75} />
			</button>
		</header>

		<p class="case-file-modal__lead">
			Revisa los archivos antes de agregarlos al caso. Puedes seleccionar todos los que necesites de
			una sola vez.
		</p>

		<ul class="case-file-modal__list">
			{#each pendingReview as item (item.file.name + item.file.size + item.file.lastModified)}
				<li
					class="case-file-modal__item"
					class:case-file-modal__item--invalid={!item.valid}
					class:case-file-modal__item--duplicate={item.duplicate}
				>
					<div class="case-file-modal__item-main">
						<span class="case-file-modal__item-name">{item.file.name}</span>
						<span class="case-file-modal__item-size">{formatFileSize(item.file.size)}</span>
					</div>
					{#if item.duplicate}
						<span class="case-file-modal__item-tag case-file-modal__item-tag--warn">Duplicado</span>
					{:else if !item.valid}
						<span class="case-file-modal__item-tag case-file-modal__item-tag--error">
							{item.error}
						</span>
					{:else}
						<span class="case-file-modal__item-tag case-file-modal__item-tag--ok">Listo</span>
					{/if}
				</li>
			{/each}
		</ul>

		<div class="case-file-modal__summary">
			<div>
				<span class="case-file-modal__summary-label">Se agregarán</span>
				<strong>{pendingValid.length} archivo(s)</strong>
			</div>
			<div>
				<span class="case-file-modal__summary-label">Tamaño total</span>
				<strong>{formatFileSize(pendingTotalBytes)}</strong>
			</div>
		</div>

		{#if pendingErrors.length > 0}
			<p class="case-file-modal__errors">
				{pendingErrors.length} archivo(s) no se incluirán por formato o tamaño inválido.
			</p>
		{/if}

		<footer class="case-file-modal__footer">
			<button type="button" class="btn-pearl-capsule" onclick={closeModal}>Cancelar</button>
			<button type="button" class="btn-primary" disabled={!canConfirm} onclick={confirmUpload}>
				Agregar {pendingValid.length} archivo(s)
			</button>
		</footer>
	</div>
{/if}
