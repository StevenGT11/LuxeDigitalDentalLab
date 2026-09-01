<script lang="ts">
	import {
		FE_REFERENCIA_CODIGO_OPTIONS,
		defaultRazonForCodigo,
		type FeReferenciaCodigo
	} from '$lib/fe/fe-referencia';

	interface Props {
		open: boolean;
		onCancel?: () => void;
		onConfirm: (data: {
			tipoDocumento: '02' | '03';
			codigoReferencia: string;
			razon: string;
			crearFacturaCorreccion: boolean;
		}) => void;
		onMedios?: (data: {
			tipoDocumento: '02' | '03';
			codigoReferencia: string;
			razon: string;
			crearFacturaCorreccion: boolean;
		}) => void;
	}

	let { open = $bindable(false), onCancel, onConfirm, onMedios }: Props = $props();

	let tipoDocumento = $state<'02' | '03'>('03');
	let codigoReferencia = $state<FeReferenciaCodigo>('01');
	let razon = $state(defaultRazonForCodigo('01', '03'));
	let crearFacturaCorreccion = $state(true);

	$effect(() => {
		if (open) {
			tipoDocumento = '03';
			codigoReferencia = '01';
			razon = defaultRazonForCodigo('01', '03');
			crearFacturaCorreccion = true;
		}
	});

	function onTipoChange() {
		razon = defaultRazonForCodigo(codigoReferencia, tipoDocumento);
		if (tipoDocumento === '02') crearFacturaCorreccion = false;
	}

	function onCodigoChange() {
		razon = defaultRazonForCodigo(codigoReferencia, tipoDocumento);
	}

	function draftPayload() {
		return {
			tipoDocumento,
			codigoReferencia,
			razon: razon.trim(),
			crearFacturaCorreccion: tipoDocumento === '03' && crearFacturaCorreccion
		};
	}

	function submit() {
		const trimmed = razon.trim();
		if (trimmed.length < 3) return;
		onConfirm({ ...draftPayload(), razon: trimmed });
		open = false;
	}

	function openMedios() {
		const trimmed = razon.trim();
		if (trimmed.length < 3) return;
		onMedios?.({ ...draftPayload(), razon: trimmed });
		open = false;
	}
</script>

{#if open}
	<div
		class="fe-modal-backdrop"
		role="presentation"
		onclick={(e) => e.target === e.currentTarget && (open = false)}
	>
		<div class="fe-modal" role="dialog" aria-modal="true" aria-labelledby="nota-modal-title">
			<h2 id="nota-modal-title" class="fe-modal__title">
				{tipoDocumento === '03' ? 'Nota de crédito' : 'Nota de débito'}
			</h2>
			<p class="type-caption fe-modal__lead">
				Referencia la FE aceptada de esta factura. Se envía a Hacienda con efectivo por defecto; use «Elegir medios…» si necesita otro medio de pago.
			</p>

			<div class="fe-modal__field">
				<span class="field-label">Tipo de nota</span>
				<div class="fe-modal__radio-row">
					<label class="fe-modal__radio">
						<input
							type="radio"
							name="tipo-nota"
							value="03"
							bind:group={tipoDocumento}
							onchange={onTipoChange}
						/>
						Nota de crédito (03)
					</label>
					<label class="fe-modal__radio">
						<input
							type="radio"
							name="tipo-nota"
							value="02"
							bind:group={tipoDocumento}
							onchange={onTipoChange}
						/>
						Nota de débito (02)
					</label>
				</div>
			</div>

			<label class="field fe-modal__field">
				<span class="field-label">Motivo (Hacienda)</span>
				<select
					class="field-select"
					bind:value={codigoReferencia}
					onchange={onCodigoChange}
				>
					{#each FE_REFERENCIA_CODIGO_OPTIONS as opt (opt.value)}
						<option value={opt.value}>{opt.label}</option>
					{/each}
				</select>
			</label>

			<label class="field fe-modal__field">
				<span class="field-label">Razón</span>
				<input
					class="field-input"
					type="text"
					bind:value={razon}
					minlength="3"
					maxlength="180"
					placeholder="Descripción del ajuste"
				/>
			</label>

			{#if tipoDocumento === '03'}
				<label class="fe-modal__checkbox">
					<input type="checkbox" bind:checked={crearFacturaCorreccion} />
					<span>Crear nueva factura con los mismos ítems cuando Hacienda <strong>acepte</strong> esta NC (para emitir FE corregida)</span>
				</label>
			{/if}

			<div class="fe-modal__actions">
				<button
					type="button"
					class="btn-secondary-pill"
					onclick={() => {
						open = false;
						onCancel?.();
					}}
				>
					Cancelar
				</button>
				{#if onMedios}
					<button
						type="button"
						class="btn-secondary-pill"
						onclick={openMedios}
						disabled={razon.trim().length < 3}
					>
						Elegir medios…
					</button>
				{/if}
				<button type="button" class="btn-primary fe-modal__submit" onclick={submit} disabled={razon.trim().length < 3}>
					Enviar a Hacienda
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.fe-modal-backdrop {
		position: fixed;
		inset: 0;
		z-index: 100;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--spacing-md);
		background: rgb(15 23 42 / 45%);
		backdrop-filter: blur(4px);
	}

	.fe-modal {
		width: min(100%, 28rem);
		padding: var(--spacing-lg);
		border-radius: var(--radius-lg, 8px);
		border: 1px solid var(--dash-border, #e2e8f0);
		background: var(--dash-card-solid, #ffffff);
		color: var(--dash-text, #0f172a);
		box-shadow: var(--dash-shadow-hover, 0 12px 40px rgb(0 0 0 / 0.15));
	}

	.fe-modal__title {
		margin: 0 0 0.35rem;
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--dash-text, #0f172a);
	}

	.fe-modal__lead {
		margin: 0 0 var(--spacing-md);
		color: var(--dash-muted, #64748b);
	}

	.fe-modal__field {
		display: block;
		margin-bottom: var(--spacing-md);
	}

	.fe-modal__radio-row {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-top: 0.35rem;
	}

	.fe-modal__radio {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
	}

	.fe-modal__checkbox {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		margin-bottom: var(--spacing-md);
		cursor: pointer;
		font-size: 0.875rem;
		line-height: 1.4;
	}

	.fe-modal__actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: var(--spacing-md);
	}

	.fe-modal__submit {
		min-width: 9rem;
	}
</style>
