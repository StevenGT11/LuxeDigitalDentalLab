<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { Plus, X } from '@lucide/svelte';
	import { formatColones, formatCurrency } from '$lib/lab/helpers';
	import { initializeLabStorage } from '$lib/lab/store';
	import {
		GUIA_PRECIOS_POR_IMPLANTES,
		IMPLANTES_GUIA_OPTIONS
	} from '$lib/lab/surgical-guide';
	import {
		TREATMENT_CATEGORY_LABELS,
		TREATMENT_CATEGORY_ORDER,
		createTreatment,
		getAllTreatments,
		hydrateTreatmentsCatalogOnce,
		setTreatmentActive,
		updateTreatment,
		type LabTreatment,
		type TreatmentCategory
	} from '$lib/lab/treatments';

	interface DraftRow {
		label: string;
		categoria: TreatmentCategory;
		precio_diseno: string;
		precio_fresado: string;
		precio_crc_diseno: string;
		precio_crc_fresado: string;
		por_arcadas: boolean;
	}

	let treatments = $state<LabTreatment[]>([]);
	let modalOpen = $state(false);
	let saving = $state(false);
	let loading = $state(true);
	let error = $state('');
	let rowErrors = $state<Record<string, string>>({});

	let form = $state<DraftRow>({
		label: '',
		categoria: 'otros',
		precio_diseno: '',
		precio_fresado: '',
		precio_crc_diseno: '',
		precio_crc_fresado: '',
		por_arcadas: false
	});

	let activeCount = $derived(treatments.filter((t) => t.activo).length);
	let grouped = $derived.by(() => {
		const groups = new Map<TreatmentCategory, LabTreatment[]>();
		for (const t of treatments) {
			const list = groups.get(t.categoria) ?? [];
			list.push(t);
			groups.set(t.categoria, list);
		}
		return TREATMENT_CATEGORY_ORDER.filter((c) => groups.has(c)).map((categoria) => ({
			categoria,
			label: TREATMENT_CATEGORY_LABELS[categoria],
			items: groups.get(categoria) ?? []
		}));
	});

	onMount(() => refresh());
	afterNavigate(() => refresh());

	async function refresh() {
		if (!browser) return;
		initializeLabStorage();
		loading = true;
		try {
			await hydrateTreatmentsCatalogOnce();
			treatments = getAllTreatments();
		} catch (err) {
			error = err instanceof Error ? err.message : 'No se pudo cargar el catálogo';
			treatments = getAllTreatments();
		} finally {
			loading = false;
		}
	}

	function parsePrice(value: string, decimals = 2): number | null {
		const n = Number.parseFloat(String(value).replace(',', '.'));
		if (!Number.isFinite(n) || n < 0) return null;
		const factor = 10 ** decimals;
		return Math.round(n * factor) / factor;
	}

	function openModal() {
		error = '';
		form = {
			label: '',
			categoria: 'otros',
			precio_diseno: '',
			precio_fresado: '',
			precio_crc_diseno: '',
			precio_crc_fresado: '',
			por_arcadas: false
		};
		modalOpen = true;
	}

	function closeModal() {
		if (saving) return;
		modalOpen = false;
		error = '';
	}

	function onModalKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') closeModal();
	}

	function clearRowError(id: string) {
		if (!rowErrors[id]) return;
		const next = { ...rowErrors };
		delete next[id];
		rowErrors = next;
	}

	async function saveRow(treatment: LabTreatment) {
		const precio_diseno = parsePrice(String(treatment.precio_diseno));
		const precio_fresado = parsePrice(String(treatment.precio_fresado));
		const precio_crc_diseno = parsePrice(String(treatment.precio_crc_diseno), 0);
		const precio_crc_fresado = parsePrice(String(treatment.precio_crc_fresado), 0);
		if (
			precio_diseno === null ||
			precio_fresado === null ||
			precio_crc_diseno === null ||
			precio_crc_fresado === null
		) {
			rowErrors = {
				...rowErrors,
				[treatment.id]: 'Los precios deben ser números válidos (0 o más).'
			};
			return;
		}
		if (!treatment.label.trim()) {
			rowErrors = { ...rowErrors, [treatment.id]: 'El nombre es obligatorio.' };
			return;
		}

		try {
			await updateTreatment(treatment.id, {
				label: treatment.label,
				categoria: treatment.categoria,
				precio_diseno,
				precio_fresado,
				precio_crc_diseno,
				precio_crc_fresado,
				por_arcadas: treatment.por_arcadas
			});
			clearRowError(treatment.id);
			await refresh();
		} catch (err) {
			rowErrors = {
				...rowErrors,
				[treatment.id]: err instanceof Error ? err.message : 'No se pudo guardar.'
			};
		}
	}

	async function handleCreate(e: Event) {
		e.preventDefault();
		const precio_diseno = parsePrice(form.precio_diseno);
		const precio_fresado = parsePrice(form.precio_fresado);
		const precio_crc_diseno = parsePrice(form.precio_crc_diseno, 0);
		const precio_crc_fresado = parsePrice(form.precio_crc_fresado, 0);
		if (!form.label.trim()) {
			error = 'Indica el nombre del tratamiento.';
			return;
		}
		if (
			precio_diseno === null ||
			precio_fresado === null ||
			precio_crc_diseno === null ||
			precio_crc_fresado === null
		) {
			error = 'Los precios deben ser números válidos (0 o más).';
			return;
		}

		saving = true;
		error = '';
		try {
			const slugs = new Set(getAllTreatments().map((t) => t.value));
			await createTreatment(
				{
					label: form.label,
					categoria: form.categoria,
					precio_diseno,
					precio_fresado,
					precio_crc_diseno,
					precio_crc_fresado,
					por_arcadas: form.por_arcadas
				},
				slugs
			);
			modalOpen = false;
			await refresh();
		} catch (err) {
			error = err instanceof Error ? err.message : 'No se pudo crear el tratamiento.';
		} finally {
			saving = false;
		}
	}

	async function toggleActive(treatment: LabTreatment) {
		try {
			await setTreatmentActive(treatment.id, !treatment.activo);
			await refresh();
		} catch (err) {
			rowErrors = {
				...rowErrors,
				[treatment.id]: err instanceof Error ? err.message : 'No se pudo actualizar.'
			};
		}
	}

	function patchTreatment(id: string, patch: Partial<LabTreatment>) {
		treatments = treatments.map((t) => (t.id === id ? { ...t, ...patch } : t));
		clearRowError(id);
	}
</script>

<svelte:window onkeydown={modalOpen ? onModalKeydown : undefined} />

<div class="dash-page">
	<p class="dash-lead">
		Tarifario Luxe Digital. Las restauraciones (corona, carilla, puente, inlay, onlay, etc.) incluyen diseño
		$8/pza (unidad de restauración) + fresado según material. El CRC es referencia local.
	</p>

	{#if loading}
		<p class="type-caption">Cargando catálogo desde Supabase…</p>
	{/if}

	<div class="dash-stat-grid dash-stat-grid--compact">
		<div class="dash-stat">
			<p class="dash-stat__label">Tratamientos activos</p>
			<p class="dash-stat__value">{activeCount}</p>
		</div>
		<div class="dash-stat">
			<p class="dash-stat__label">En catálogo</p>
			<p class="dash-stat__value">{treatments.length}</p>
		</div>
	</div>

	<div class="dash-toolbar">
		<p class="treatments-toolbar__hint type-caption" style="margin: 0; flex: 1;">
			{activeCount} servicios activos · USD (diseño / fresado) y colones (CRC)
		</p>
		<button type="button" class="btn-primary" onclick={openModal}>
			<Plus size={16} strokeWidth={2} />
			Agregar tratamiento
		</button>
	</div>

	{#each grouped as group (group.categoria)}
		<section class="dash-panel treatments-category">
			<h2 class="dash-panel__title">{group.label}</h2>
			{#if group.categoria === 'guias'}
				<p class="type-caption treatments-guia-lead">
					Un solo servicio «Guía quirúrgica». El precio depende de la cantidad de implantes (1–6) al
					crear el caso.
				</p>
				<div class="treatments-guia-tiers data-table-wrap">
					<table class="data-table">
						<thead>
							<tr>
								<th>Implantes</th>
								<th>USD</th>
								<th>CRC</th>
							</tr>
						</thead>
						<tbody>
							{#each IMPLANTES_GUIA_OPTIONS as n}
								<tr>
									<td>{n} {n === 1 ? 'implante' : 'implantes'}</td>
									<td>{formatCurrency(GUIA_PRECIOS_POR_IMPLANTES[n].usd)}</td>
									<td>{formatColones(GUIA_PRECIOS_POR_IMPLANTES[n].crc)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
			<div class="data-table-wrap">
				<table class="data-table treatments-table">
					<thead>
						<tr>
							<th>Servicio</th>
							<th>Diseño USD</th>
							<th>Diseño CRC</th>
							<th>Fresado USD</th>
							<th>Fresado CRC</th>
							<th>Arcadas</th>
							<th>Estado</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						{#each group.items as treatment (treatment.id)}
							<tr class:treatments-table__row--inactive={!treatment.activo}>
								<td>
									<input
										type="text"
										class="field-input treatments-table__name"
										value={treatment.label}
										disabled={!treatment.activo}
										oninput={(e) =>
											patchTreatment(treatment.id, {
												label: (e.currentTarget as HTMLInputElement).value
											})}
									/>
									<p class="treatments-table__code type-fine-print">{treatment.value}</p>
									{#if rowErrors[treatment.id]}
										<p class="treatments-table__error" role="alert">{rowErrors[treatment.id]}</p>
									{/if}
								</td>
								<td>
									<input
										type="number"
										class="field-input treatments-table__price"
										min="0"
										step="0.01"
										value={treatment.precio_diseno}
										disabled={!treatment.activo}
										oninput={(e) =>
											patchTreatment(treatment.id, {
												precio_diseno: Number((e.currentTarget as HTMLInputElement).value)
											})}
									/>
								</td>
								<td>
									<input
										type="number"
										class="field-input treatments-table__price treatments-table__price--crc"
										min="0"
										step="1"
										value={treatment.precio_crc_diseno}
										disabled={!treatment.activo || treatment.precio_diseno <= 0}
										oninput={(e) =>
											patchTreatment(treatment.id, {
												precio_crc_diseno: Number((e.currentTarget as HTMLInputElement).value)
											})}
									/>
									{#if treatment.precio_crc_diseno > 0}
										<p class="treatments-table__crc-hint type-fine-print">
											{formatColones(treatment.precio_crc_diseno)}
										</p>
									{/if}
								</td>
								<td>
									<input
										type="number"
										class="field-input treatments-table__price"
										min="0"
										step="0.01"
										value={treatment.precio_fresado}
										disabled={!treatment.activo}
										oninput={(e) =>
											patchTreatment(treatment.id, {
												precio_fresado: Number((e.currentTarget as HTMLInputElement).value)
											})}
									/>
								</td>
								<td>
									<input
										type="number"
										class="field-input treatments-table__price treatments-table__price--crc"
										min="0"
										step="1"
										value={treatment.precio_crc_fresado}
										disabled={!treatment.activo || treatment.precio_fresado <= 0}
										oninput={(e) =>
											patchTreatment(treatment.id, {
												precio_crc_fresado: Number((e.currentTarget as HTMLInputElement).value)
											})}
									/>
									{#if treatment.precio_crc_fresado > 0}
										<p class="treatments-table__crc-hint type-fine-print">
											{formatColones(treatment.precio_crc_fresado)}
										</p>
									{/if}
								</td>
								<td>
									<button
										type="button"
										class="treatments-table__arcadas-btn"
										class:treatments-table__arcadas-btn--active={treatment.por_arcadas}
										disabled={!treatment.activo}
										aria-pressed={treatment.por_arcadas}
										title="Sin odontograma: el cliente elige arcada superior, inferior o ambas"
										onclick={() =>
											patchTreatment(treatment.id, {
												por_arcadas: !treatment.por_arcadas
											})}
									>
										Por arcadas
									</button>
								</td>
								<td>
									<span
										class="status-chip"
										class:status-chip--finalizado={treatment.activo}
										class:status-chip--pendiente={!treatment.activo}
									>
										{treatment.activo ? 'Activo' : 'Inactivo'}
									</span>
								</td>
								<td class="treatments-table__actions">
									{#if treatment.activo}
										<button
											type="button"
											class="btn-pearl-capsule"
											onclick={() => saveRow(treatment)}
										>
											Guardar
										</button>
										<button
											type="button"
											class="text-link"
											onclick={() => toggleActive(treatment)}
										>
											Desactivar
										</button>
									{:else}
										<button
											type="button"
											class="btn-pearl-capsule"
											onclick={() => toggleActive(treatment)}
										>
											Activar
										</button>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	{:else}
		<p class="type-caption">No hay tratamientos en el catálogo.</p>
	{/each}
</div>

{#if modalOpen}
	<div
		class="case-file-modal-backdrop"
		role="presentation"
		onclick={(e) => e.target === e.currentTarget && closeModal()}
	>
		<div
			class="case-file-modal case-file-modal--form"
			role="dialog"
			aria-modal="true"
			aria-labelledby="add-treatment-title"
			onclick={(e) => e.stopPropagation()}
		>
			<div class="case-file-modal__header">
				<div>
					<p class="case-file-modal__eyebrow">Catálogo</p>
					<h2 id="add-treatment-title" class="case-file-modal__title">Nuevo tratamiento</h2>
				</div>
				<button type="button" class="case-file-modal__close" aria-label="Cerrar" onclick={closeModal}>
					<X size={20} />
				</button>
			</div>

			<form class="case-file-modal__body" onsubmit={handleCreate}>
				<div class="case-file-modal__fields">
				{#if error}
					<p class="alert alert--error" role="alert">{error}</p>
				{/if}

				<div>
					<label class="field-label" for="treatment-label">Nombre del tratamiento *</label>
					<input
						id="treatment-label"
						class="field-input"
						type="text"
						placeholder="Ej. Carilla, Barra híbrida"
						bind:value={form.label}
						required
					/>
				</div>

				<div>
					<label class="field-label" for="treatment-categoria">Categoría *</label>
					<select id="treatment-categoria" class="field-select" bind:value={form.categoria}>
						{#each TREATMENT_CATEGORY_ORDER as cat}
							<option value={cat}>{TREATMENT_CATEGORY_LABELS[cat]}</option>
						{/each}
					</select>
				</div>

				<div class="treatments-form-grid">
					<div>
						<label class="field-label" for="treatment-diseno">Diseño (USD/pza) *</label>
						<input
							id="treatment-diseno"
							class="field-input"
							type="number"
							min="0"
							step="0.01"
							placeholder="30"
							bind:value={form.precio_diseno}
							required
						/>
					</div>
					<div>
						<label class="field-label" for="treatment-crc-diseno">Diseño (CRC/pza)</label>
						<input
							id="treatment-crc-diseno"
							class="field-input"
							type="number"
							min="0"
							step="1"
							placeholder="4000"
							bind:value={form.precio_crc_diseno}
						/>
					</div>
					<div>
						<label class="field-label" for="treatment-fresado">Fresado (USD/pza) *</label>
						<input
							id="treatment-fresado"
							class="field-input"
							type="number"
							min="0"
							step="0.01"
							placeholder="90"
							bind:value={form.precio_fresado}
							required
						/>
					</div>
					<div>
						<label class="field-label" for="treatment-crc-fresado">Fresado (CRC/pza)</label>
						<input
							id="treatment-crc-fresado"
							class="field-input"
							type="number"
							min="0"
							step="1"
							placeholder="45000"
							bind:value={form.precio_crc_fresado}
						/>
					</div>
				</div>

				<label class="service-check treatments-form-arcadas">
					<input type="checkbox" bind:checked={form.por_arcadas} />
					<span>Por arcadas (sin odontograma; el cliente elige superior, inferior o ambas)</span>
				</label>

				<p class="type-caption">
					Deja en 0 el precio que no aplique (solo diseño o solo fresado). El identificador interno se
					genera automáticamente.
				</p>
				</div>

				<div class="case-file-modal__footer">
					<button type="button" class="btn-pearl-capsule" onclick={closeModal} disabled={saving}>
						Cancelar
					</button>
					<button type="submit" class="btn-primary" disabled={saving}>
						{saving ? 'Guardando…' : 'Agregar tratamiento'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<style>
	.treatments-guia-lead {
		margin: 0 0 1rem;
	}

	.treatments-guia-tiers {
		margin-bottom: 1rem;
		max-width: 28rem;
	}

	.treatments-category {
		margin-bottom: 1rem;
	}

	.treatments-category:last-child {
		margin-bottom: 0;
	}

	.treatments-toolbar__hint {
		align-self: center;
		color: var(--dash-muted);
	}

	.treatments-table__price--crc {
		width: 8rem;
	}

	.treatments-table__crc-hint {
		margin: 0.25rem 0 0;
	}

	.treatments-table__arcadas-btn {
		padding: 0.35rem 0.65rem;
		font-size: 0.75rem;
		font-weight: 600;
		border-radius: 999px;
		border: 1px solid var(--dash-border);
		background: var(--dash-card);
		color: var(--dash-muted);
		cursor: pointer;
		white-space: nowrap;
	}

	.treatments-table__arcadas-btn--active {
		border-color: var(--dash-accent, #2563eb);
		background: color-mix(in srgb, var(--dash-accent, #2563eb) 12%, transparent);
		color: var(--dash-text);
	}

	.treatments-table__arcadas-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.treatments-form-arcadas {
		margin-top: 0.25rem;
	}

	.treatments-table__name {
		min-width: 12rem;
	}

	.treatments-table__price {
		width: 7rem;
		min-width: 5.5rem;
	}

	.treatments-table__code {
		margin: 0.35rem 0 0;
	}

	.treatments-table__total {
		font-weight: 600;
		white-space: nowrap;
	}

	.treatments-table__actions {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.35rem;
		white-space: nowrap;
	}

	.treatments-table__error {
		margin: 0.35rem 0 0;
		font-size: 0.75rem;
		color: #b91c1c;
	}

	.treatments-table__row--inactive td {
		opacity: 0.72;
	}

	.treatments-form-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
	}

	@media (max-width: 640px) {
		.treatments-form-grid {
			grid-template-columns: 1fr;
		}

		.treatments-table__actions {
			flex-direction: row;
			flex-wrap: wrap;
		}
	}
</style>
