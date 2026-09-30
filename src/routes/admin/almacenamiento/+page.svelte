<script lang="ts">
	import { enhance } from '$app/forms';
	import {
		AlertTriangle,
		CheckCircle2,
		Database,
		FileBox,
		HardDrive,
		Info,
		Layers,
		Trash2
	} from '@lucide/svelte';
	import { formatFileSize } from '$lib/lab/attachments';
	import { formatDate } from '$lib/lab/helpers';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let stats = $derived(data.stats);

	let selectedScope = $state<'30' | '60' | '90' | 'all' | null>(null);
	let confirmModalOpen = $state(false);
	let submitting = $state(false);

	let scopeLabel = $derived.by(() => {
		if (selectedScope === '30') return 'casos finalizados con más de 30 días de antigüedad';
		if (selectedScope === '60') return 'casos finalizados con más de 60 días de antigüedad';
		if (selectedScope === '90') return 'casos finalizados con más de 90 días de antigüedad';
		if (selectedScope === 'all') return 'todos los casos finalizados del sistema';
		return '';
	});

	let scopeStats = $derived.by(() => {
		if (!stats) return null;
		if (selectedScope === '30') return stats.finalized.over30;
		if (selectedScope === '60') return stats.finalized.over60;
		if (selectedScope === '90') return stats.finalized.over90;
		if (selectedScope === 'all') return stats.finalized.total;
		return null;
	});

	function openPurgeModal(scope: '30' | '60' | '90' | 'all') {
		selectedScope = scope;
		confirmModalOpen = true;
	}

	function closeModal() {
		confirmModalOpen = false;
		selectedScope = null;
	}
</script>

<div class="dash-page">
	<div class="dash-page__header">
		<div>
			<h1 class="dash-title">Gestión de Almacenamiento</h1>
			<p class="dash-lead">
				Monitorea el espacio consumido por escaneos 3D y libera almacenamiento de casos finalizados de forma segura.
			</p>
		</div>
	</div>

	{#if form?.message}
		<div
			class="alert"
			class:alert--success={form.success}
			class:alert--error={!form.success}
			role="status"
			style="margin-bottom: var(--spacing-lg);"
		>
			{#if form.success}
				<CheckCircle2 size={18} />
			{:else}
				<AlertTriangle size={18} />
			{/if}
			<span>{form.message}</span>
		</div>
	{/if}

	{#if data.error || !stats}
		<div class="alert alert--error" role="alert">
			<AlertTriangle size={18} />
			<span>{data.error || 'No se pudieron cargar los datos de almacenamiento.'}</span>
		</div>
	{:else}
		<!-- RESUMEN PRINCIPAL DE CUOTA -->
		<section class="dash-panel" style="margin-bottom: var(--spacing-lg);">
			<div class="storage-hero">
				<div class="storage-hero__metrics">
					<div class="storage-hero__icon">
						<HardDrive size={32} />
					</div>
					<div>
						<p class="type-caption">Almacenamiento actual en Supabase</p>
						<p class="storage-hero__value">
							{formatFileSize(stats.totalBytes)}
							<span class="storage-hero__quota">/ {formatFileSize(stats.quotaBytes)} (Plan gratuito)</span>
						</p>
					</div>
				</div>

				{#if stats.exceededBytes > 0}
					<div class="storage-badge storage-badge--danger">
						<AlertTriangle size={16} />
						<span>Superado por {formatFileSize(stats.exceededBytes)}</span>
					</div>
				{:else}
					<div class="storage-badge storage-badge--ok">
						<CheckCircle2 size={16} />
						<span>Dentro del límite</span>
					</div>
				{/if}
			</div>

			<!-- Barra de progreso -->
			<div class="storage-bar__track">
				<div
					class="storage-bar__fill"
					class:storage-bar__fill--danger={stats.quotaPercent >= 100}
					class:storage-bar__fill--warning={stats.quotaPercent >= 80 && stats.quotaPercent < 100}
					style="width: {Math.min(100, stats.quotaPercent)}%"
				></div>
			</div>
			<div class="storage-bar__labels">
				<span>{stats.quotaPercent.toFixed(1)}% de la cuota base usada</span>
				<span>{stats.totalFiles} archivos totales</span>
			</div>
		</section>

		<!-- ESTADÍSTICAS EN TARJETAS -->
		<div class="storage-kpis">
			<div class="dash-panel storage-kpi-card">
				<div class="storage-kpi-card__header">
					<span class="storage-kpi-card__title">Casos Activos</span>
					<Layers size={18} class="text-accent" />
				</div>
				<p class="storage-kpi-card__num">{formatFileSize(stats.active.bytes)}</p>
				<p class="type-caption">
					{stats.active.cases} casos en taller · {stats.active.files} archivos protegidos
				</p>
			</div>

			<div class="dash-panel storage-kpi-card">
				<div class="storage-kpi-card__header">
					<span class="storage-kpi-card__title">Casos Finalizados</span>
					<Database size={18} class="text-accent" />
				</div>
				<p class="storage-kpi-card__num">{formatFileSize(stats.finalized.total.bytes)}</p>
				<p class="type-caption">
					{stats.finalized.total.cases} casos terminados · {stats.finalized.total.files} archivos retenidos
				</p>
			</div>

			<div class="dash-panel storage-kpi-card">
				<div class="storage-kpi-card__header">
					<span class="storage-kpi-card__title">Finalizados &gt; 30 días</span>
					<Trash2 size={18} style="color: #eab308;" />
				</div>
				<p class="storage-kpi-card__num">{formatFileSize(stats.finalized.over30.bytes)}</p>
				<p class="type-caption">
					{stats.finalized.over30.cases} casos candidatos a liberar
				</p>
			</div>

			<div class="dash-panel storage-kpi-card">
				<div class="storage-kpi-card__header">
					<span class="storage-kpi-card__title">Compresión de Subida</span>
					<FileBox size={18} class="text-accent" />
				</div>
				<p class="storage-kpi-card__num" style="color: #10b981;">Activa (~50%)</p>
				<p class="type-caption">
					Comprime STL, PLY y fotos automáticamente al enviar nuevos casos
				</p>
			</div>
		</div>

		<!-- SECCIÓN DE LIBERACIÓN DE ESPACIO -->
		<section class="dash-panel" style="margin-top: var(--spacing-xl);">
			<div class="dash-panel__header">
				<div>
					<h2 class="dash-panel__title">Liberar espacio de casos finalizados</h2>
					<p class="type-fine-print">
						Elimina los archivos 3D pesados (.ply, .stl, .obj) de casos que ya fueron entregados.
						<strong>La ficha del caso, paciente, clínica, doctor, notas y facturas permanecerán 100% intactos.</strong>
					</p>
				</div>
			</div>

			<div class="purge-grid">
				<!-- Opción > 30 días -->
				<div class="purge-card">
					<div class="purge-card__body">
						<span class="purge-card__tag">Recomendado</span>
						<h3 class="purge-card__title">Finalizados hace &gt; 30 días</h3>
						<p class="purge-card__meta">
							{stats.finalized.over30.cases} casos · {stats.finalized.over30.files} archivos
						</p>
						<p class="purge-card__savings">
							Espacio a liberar: <strong>{formatFileSize(stats.finalized.over30.bytes)}</strong>
						</p>
					</div>
					<button
						type="button"
						class="btn-primary purge-card__btn"
						disabled={stats.finalized.over30.files === 0}
						onclick={() => openPurgeModal('30')}
					>
						<Trash2 size={15} />
						Liberar {formatFileSize(stats.finalized.over30.bytes)}
					</button>
				</div>

				<!-- Opción > 60 días -->
				<div class="purge-card">
					<div class="purge-card__body">
						<h3 class="purge-card__title">Finalizados hace &gt; 60 días</h3>
						<p class="purge-card__meta">
							{stats.finalized.over60.cases} casos · {stats.finalized.over60.files} archivos
						</p>
						<p class="purge-card__savings">
							Espacio a liberar: <strong>{formatFileSize(stats.finalized.over60.bytes)}</strong>
						</p>
					</div>
					<button
						type="button"
						class="btn-pearl-capsule purge-card__btn"
						disabled={stats.finalized.over60.files === 0}
						onclick={() => openPurgeModal('60')}
					>
						<Trash2 size={15} />
						Liberar {formatFileSize(stats.finalized.over60.bytes)}
					</button>
				</div>

				<!-- Opción > 90 días -->
				<div class="purge-card">
					<div class="purge-card__body">
						<h3 class="purge-card__title">Finalizados hace &gt; 90 días</h3>
						<p class="purge-card__meta">
							{stats.finalized.over90.cases} casos · {stats.finalized.over90.files} archivos
						</p>
						<p class="purge-card__savings">
							Espacio a liberar: <strong>{formatFileSize(stats.finalized.over90.bytes)}</strong>
						</p>
					</div>
					<button
						type="button"
						class="btn-pearl-capsule purge-card__btn"
						disabled={stats.finalized.over90.files === 0}
						onclick={() => openPurgeModal('90')}
					>
						<Trash2 size={15} />
						Liberar {formatFileSize(stats.finalized.over90.bytes)}
					</button>
				</div>

				<!-- Opción Todos los finalizados -->
				<div class="purge-card">
					<div class="purge-card__body">
						<h3 class="purge-card__title">Todos los finalizados</h3>
						<p class="purge-card__meta">
							{stats.finalized.total.cases} casos · {stats.finalized.total.files} archivos
						</p>
						<p class="purge-card__savings">
							Espacio a liberar: <strong>{formatFileSize(stats.finalized.total.bytes)}</strong>
						</p>
					</div>
					<button
						type="button"
						class="btn-pearl-capsule purge-card__btn"
						disabled={stats.finalized.total.files === 0}
						onclick={() => openPurgeModal('all')}
					>
						<Trash2 size={15} />
						Liberar {formatFileSize(stats.finalized.total.bytes)}
					</button>
				</div>
			</div>
		</section>

		<!-- DESGLOSE POR TIPO DE ARCHIVO -->
		<div class="storage-details-grid" style="margin-top: var(--spacing-xl);">
			<section class="dash-panel">
				<h3 class="dash-panel__section-title">Distribución por formato</h3>
				<div class="table-responsive" style="margin-top: var(--spacing-md);">
					<table class="data-table">
						<thead>
							<tr>
								<th>Formato</th>
								<th>Archivos</th>
								<th>Tamaño total</th>
								<th>% del uso</th>
							</tr>
						</thead>
						<tbody>
							{#each stats.extensions as ext (ext.extension)}
								<tr>
									<td class="type-body-strong">.{ext.extension.toUpperCase()}</td>
									<td>{ext.count}</td>
									<td>{formatFileSize(ext.bytes)}</td>
									<td>
										<div style="display: flex; align-items: center; gap: 0.5rem;">
											<div class="mini-bar">
												<div class="mini-bar__fill" style="width: {ext.percent}%"></div>
											</div>
											<span class="type-caption">{ext.percent.toFixed(1)}%</span>
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</section>

			<!-- CASOS FINALIZADOS CON MÁS ESPACIO -->
			<section class="dash-panel">
				<h3 class="dash-panel__section-title">Casos finalizados con mayor peso</h3>
				<div class="table-responsive" style="margin-top: var(--spacing-md);">
					<table class="data-table">
						<thead>
							<tr>
								<th>Caso</th>
								<th>Paciente / Clínica</th>
								<th>Archivos</th>
								<th>Tamaño</th>
								<th>Acción</th>
							</tr>
						</thead>
						<tbody>
							{#each stats.topCases as tc (tc.case_id)}
								<tr>
									<td>
										<a href="/admin/casos/{tc.case_id}" class="text-link">
											{tc.case_number}
										</a>
										<p class="type-caption">{formatDate(tc.fecha_creacion)}</p>
									</td>
									<td>
										<p class="type-body-strong">{tc.paciente_name}</p>
										<p class="type-caption">{tc.client_name}</p>
									</td>
									<td>{tc.file_count}</td>
									<td class="type-body-strong">{formatFileSize(tc.total_bytes)}</td>
									<td>
										<form method="POST" action="?/purgeCase" use:enhance>
											<input type="hidden" name="caseId" value={tc.case_id} />
											<button
												type="submit"
												class="icon-button icon-button--danger"
												title="Liberar archivos de este caso"
												aria-label="Liberar archivos de este caso"
											>
												<Trash2 size={15} />
											</button>
										</form>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</section>
		</div>
	{/if}
</div>

<!-- MODAL DE CONFIRMACIÓN -->
{#if confirmModalOpen && selectedScope && scopeStats}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="modal-backdrop" role="presentation" onclick={closeModal}>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			class="modal-card"
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
		>
			<div class="modal-card__header">
				<div class="modal-card__icon modal-card__icon--warning">
					<AlertTriangle size={24} />
				</div>
				<div>
					<h3 class="modal-card__title">¿Confirmar liberación de almacenamiento?</h3>
					<p class="type-caption">Esta acción es permanente para los archivos 3D</p>
				</div>
			</div>

			<div class="modal-card__body">
				<p class="type-body">
					Estás a punto de eliminar los escaneos 3D y archivos adjuntos de:
				</p>
				<div class="modal-highlight">
					<p class="modal-highlight__scope"><strong>{scopeLabel}</strong></p>
					<ul class="modal-highlight__list">
						<li><strong>Casos afectados:</strong> {scopeStats.cases} casos</li>
						<li><strong>Archivos a eliminar:</strong> {scopeStats.files} archivos</li>
						<li><strong>Espacio a recuperar:</strong> {formatFileSize(scopeStats.bytes)}</li>
					</ul>
				</div>

				<div class="alert alert--info" style="margin-top: var(--spacing-md);">
					<Info size={16} />
					<span class="type-caption">
						Los casos, fechas, datos de pacientes, odontogramas y facturación <strong>NO se borrarán</strong>. Solo se liberan los archivos de Storage en Supabase.
					</span>
				</div>
			</div>

			<div class="modal-card__actions">
				<button type="button" class="btn-pearl-capsule" onclick={closeModal} disabled={submitting}>
					Cancelar
				</button>
				<form
					method="POST"
					action="?/purgeFinalized"
					use:enhance={() => {
						submitting = true;
						return async ({ update }) => {
							submitting = false;
							closeModal();
							await update();
						};
					}}
				>
					<input type="hidden" name="scope" value={selectedScope} />
					<button type="submit" class="btn-primary btn-primary--danger" disabled={submitting}>
						{#if submitting}
							Liberando espacio…
						{:else}
							Confirmar y liberar {formatFileSize(scopeStats.bytes)}
						{/if}
					</button>
				</form>
			</div>
		</div>
	</div>
{/if}

<style>
	.storage-hero {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 1rem;
		margin-bottom: 1.25rem;
	}

	.storage-hero__metrics {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.storage-hero__icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 52px;
		height: 52px;
		border-radius: 12px;
		background: rgba(212, 175, 55, 0.12);
		color: var(--color-gold, #d4af37);
		border: 1px solid rgba(212, 175, 55, 0.25);
	}

	.storage-hero__value {
		font-size: 1.65rem;
		font-weight: 700;
		color: var(--color-text-primary, #f3f4f6);
		margin: 0;
		line-height: 1.2;
	}

	.storage-hero__quota {
		font-size: 0.95rem;
		font-weight: 400;
		color: var(--color-text-secondary, #9ca3af);
	}

	.storage-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.4rem 0.85rem;
		border-radius: 9999px;
		font-size: 0.85rem;
		font-weight: 600;
	}

	.storage-badge--danger {
		background: rgba(239, 68, 68, 0.15);
		color: #f87171;
		border: 1px solid rgba(239, 68, 68, 0.35);
	}

	.storage-badge--ok {
		background: rgba(16, 185, 129, 0.15);
		color: #34d399;
		border: 1px solid rgba(16, 185, 129, 0.35);
	}

	.storage-bar__track {
		width: 100%;
		height: 12px;
		background: rgba(255, 255, 255, 0.08);
		border-radius: 9999px;
		overflow: hidden;
		position: relative;
	}

	.storage-bar__fill {
		height: 100%;
		background: var(--color-gold, #d4af37);
		border-radius: 9999px;
		transition: width 0.4s ease;
	}

	.storage-bar__fill--warning {
		background: #eab308;
	}

	.storage-bar__fill--danger {
		background: #ef4444;
	}

	.storage-bar__labels {
		display: flex;
		justify-content: space-between;
		margin-top: 0.5rem;
		font-size: 0.8rem;
		color: var(--color-text-secondary, #9ca3af);
	}

	.storage-kpis {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 1rem;
		margin-bottom: var(--spacing-xl);
	}

	.storage-kpi-card {
		padding: 1.25rem;
	}

	.storage-kpi-card__header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	.storage-kpi-card__title {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--color-text-secondary, #9ca3af);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.storage-kpi-card__num {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--color-text-primary, #f3f4f6);
		margin: 0 0 0.25rem 0;
	}

	.purge-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
		gap: 1rem;
		margin-top: 1.25rem;
	}

	.purge-card {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 12px;
		padding: 1.25rem;
		transition: border-color 0.2s ease, transform 0.2s ease;
	}

	.purge-card:hover {
		border-color: rgba(212, 175, 55, 0.4);
		transform: translateY(-2px);
	}

	.purge-card__tag {
		display: inline-block;
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		background: rgba(212, 175, 55, 0.15);
		color: var(--color-gold, #d4af37);
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
		margin-bottom: 0.5rem;
	}

	.purge-card__title {
		font-size: 1rem;
		font-weight: 600;
		color: var(--color-text-primary, #f3f4f6);
		margin: 0 0 0.35rem 0;
	}

	.purge-card__meta {
		font-size: 0.825rem;
		color: var(--color-text-secondary, #9ca3af);
		margin: 0 0 0.5rem 0;
	}

	.purge-card__savings {
		font-size: 0.85rem;
		color: var(--color-text-secondary, #9ca3af);
		margin: 0 0 1rem 0;
	}

	.purge-card__savings strong {
		color: #f87171;
	}

	.purge-card__btn {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		font-size: 0.85rem;
	}

	.storage-details-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1.5rem;
	}

	@media (max-width: 1024px) {
		.storage-details-grid {
			grid-template-columns: 1fr;
		}
	}

	.mini-bar {
		width: 70px;
		height: 6px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 9999px;
		overflow: hidden;
	}

	.mini-bar__fill {
		height: 100%;
		background: var(--color-gold, #d4af37);
		border-radius: 9999px;
	}

	.icon-button--danger {
		color: #f87171;
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.2);
		padding: 0.4rem;
		border-radius: 6px;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.icon-button--danger:hover {
		background: rgba(239, 68, 68, 0.25);
	}

	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.7);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 9999;
		padding: 1rem;
	}

	.modal-card {
		background: #18181b;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 16px;
		max-width: 500px;
		width: 100%;
		padding: 1.75rem;
		box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
	}

	.modal-card__header {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1.25rem;
	}

	.modal-card__icon--warning {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 48px;
		height: 48px;
		border-radius: 12px;
		background: rgba(239, 68, 68, 0.15);
		color: #ef4444;
		border: 1px solid rgba(239, 68, 68, 0.3);
	}

	.modal-card__title {
		font-size: 1.15rem;
		font-weight: 700;
		color: var(--color-text-primary, #f3f4f6);
		margin: 0;
	}

	.modal-highlight {
		background: rgba(255, 255, 255, 0.04);
		border-radius: 8px;
		padding: 1rem;
		margin: 1rem 0;
		border-left: 3px solid #ef4444;
	}

	.modal-highlight__scope {
		margin: 0 0 0.5rem 0;
		color: var(--color-text-primary, #f3f4f6);
	}

	.modal-highlight__list {
		list-style: none;
		padding: 0;
		margin: 0;
		font-size: 0.875rem;
		color: var(--color-text-secondary, #9ca3af);
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.modal-card__actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.75rem;
		margin-top: 1.5rem;
	}

	.btn-primary--danger {
		background: #dc2626 !important;
		border-color: #ef4444 !important;
		color: #ffffff !important;
	}

	.btn-primary--danger:hover {
		background: #b91c1c !important;
	}
</style>
