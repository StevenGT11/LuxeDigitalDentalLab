<script lang="ts">
	import { FE_MEDIO_PAGO_OPTIONS, roundMoney, type FeMedioPagoItem } from '$lib/fe/medios-pago';
	import { formatColones } from '$lib/lab/helpers';

	type RowState = {
		tipo: string;
		label: string;
		active: boolean;
		monto: string;
	};

	interface Props {
		open: boolean;
		total: number;
		subtitle?: string;
		onCancel: () => void;
		onConfirm: (medios: FeMedioPagoItem[]) => void;
	}

	let { open = $bindable(false), total, subtitle = '', onCancel, onConfirm }: Props = $props();

	let dialogEl = $state<HTMLDialogElement | null>(null);
	let rows = $state<RowState[]>([]);
	let formError = $state('');

	const totalRounded = $derived(roundMoney(total));

	const assigned = $derived(
		roundMoney(
			rows.reduce((sum, r) => {
				if (!r.active) return sum;
				const n = Number(r.monto.replace(',', '.'));
				return sum + (Number.isFinite(n) ? n : 0);
			}, 0)
		)
	);

	const remaining = $derived(roundMoney(totalRounded - assigned));

	const canApply = $derived(
		totalRounded > 0 && Math.abs(remaining) < 0.01 && rows.some((r) => r.active && Number(r.monto) > 0)
	);

	function defaultRows(): RowState[] {
		return FE_MEDIO_PAGO_OPTIONS.map((opt, i) => ({
			tipo: opt.tipo,
			label: opt.label,
			active: i === 1,
			monto: i === 1 ? String(totalRounded) : ''
		}));
	}

	function resetRows() {
		rows = defaultRows();
		formError = '';
	}

	function toggleRow(index: number, active: boolean) {
		rows = rows.map((r, i) => {
			if (i !== index) return r;
			if (active && !r.monto.trim()) {
				return { ...r, active: true, monto: remaining > 0 ? String(remaining) : String(totalRounded) };
			}
			if (!active) return { ...r, active: false, monto: '' };
			return { ...r, active };
		});
	}

	function fillRemaining(index: number) {
		const rest = remaining;
		if (rest <= 0) return;
		rows = rows.map((r, i) => {
			if (i !== index) return r;
			const current = r.active ? Number(String(r.monto).replace(',', '.')) || 0 : 0;
			return { ...r, active: true, monto: String(roundMoney(current + rest)) };
		});
	}

	function handleConfirm() {
		formError = '';
		const medios: FeMedioPagoItem[] = [];
		for (const r of rows) {
			if (!r.active) continue;
			const monto = roundMoney(Number(String(r.monto).replace(',', '.')));
			if (!Number.isFinite(monto) || monto <= 0) {
				formError = `Monto inválido en «${r.label}».`;
				return;
			}
			medios.push({ tipo: r.tipo, monto });
		}
		if (medios.length === 0) {
			formError = 'Active al menos un medio de pago.';
			return;
		}
		if (Math.abs(roundMoney(medios.reduce((s, m) => s + m.monto, 0)) - totalRounded) > 0.01) {
			formError = `Quedan ${formatColones(Math.abs(remaining))} por asignar para igualar el total.`;
			return;
		}
		onConfirm(medios);
		open = false;
	}

	function close() {
		open = false;
		onCancel();
	}

	$effect(() => {
		if (open) {
			resetRows();
			dialogEl?.showModal();
		} else {
			dialogEl?.close();
		}
	});

	function onDialogClick(event: MouseEvent) {
		if (event.target === dialogEl) close();
	}
</script>

<dialog bind:this={dialogEl} class="fe-medios-dialog" onclick={onDialogClick}>
	<div class="fe-medios-dialog__panel">
		<header class="fe-medios-dialog__header">
			<div>
				<h2 class="fe-medios-dialog__title">Medios de pago — venta</h2>
				<p class="fe-medios-dialog__subtitle">
					{subtitle || 'Distribuya el total entre uno o más medios de pago'}
				</p>
			</div>
			<button type="button" class="fe-medios-dialog__close" aria-label="Cerrar" onclick={close}>×</button>
		</header>

		<div class="fe-medios-dialog__totals">
			<div class="fe-medios-dialog__total-box">
				<span class="fe-medios-dialog__total-label">Total comprobante</span>
				<span class="fe-medios-dialog__total-value">{formatColones(totalRounded)}</span>
			</div>
			<div class="fe-medios-dialog__total-box">
				<span class="fe-medios-dialog__total-label">Asignado</span>
				<span class="fe-medios-dialog__total-value">{formatColones(assigned)}</span>
			</div>
			<div
				class="fe-medios-dialog__total-box"
				class:fe-medios-dialog__total-box--highlight={Math.abs(remaining) >= 0.01}
			>
				<span class="fe-medios-dialog__total-label">Restante</span>
				<span class="fe-medios-dialog__total-value">{formatColones(remaining)}</span>
			</div>
		</div>

		<div class="fe-medios-dialog__table-wrap">
			<div class="fe-medios-dialog__head" aria-hidden="true">
				<span>Activo</span>
				<span>Medio de pago</span>
				<span>Monto</span>
			</div>
			<ul class="fe-medios-dialog__list">
				{#each rows as row, i (row.tipo)}
					<li class="fe-medios-dialog__row">
						<label class="fe-medios-dialog__toggle">
							<input
								type="checkbox"
								checked={row.active}
								onchange={(e) => toggleRow(i, e.currentTarget.checked)}
							/>
							<span class="fe-medios-dialog__switch" aria-hidden="true"></span>
						</label>
						<div class="fe-medios-dialog__medio">
							<span class="fe-medios-dialog__medio-name">{row.label}</span>
							<span class="fe-medios-dialog__medio-code">({row.tipo})</span>
						</div>
						<div class="fe-medios-dialog__monto-cell">
							<input
								type="text"
								inputmode="decimal"
								class="field-input fe-medios-dialog__monto-input"
								disabled={!row.active}
								value={row.monto}
								oninput={(e) => {
									const v = e.currentTarget.value;
									rows = rows.map((r, j) => (j === i ? { ...r, monto: v } : r));
								}}
							/>
							<button
								type="button"
								class="btn-secondary-pill fe-medios-dialog__restante"
								disabled={!row.active || remaining <= 0}
								onclick={() => fillRemaining(i)}
							>
								+ Restante
							</button>
						</div>
					</li>
				{/each}
			</ul>
		</div>

		{#if formError}
			<p class="fe-medios-dialog__error" role="alert">{formError}</p>
		{:else if Math.abs(remaining) >= 0.01}
			<p class="fe-medios-dialog__hint">
				Quedan {formatColones(remaining)} por asignar para igualar el total.
			</p>
		{/if}

		<footer class="fe-medios-dialog__footer">
			<button type="button" class="btn-secondary-pill" onclick={close}>Cancelar</button>
			<button type="button" class="btn-primary" disabled={!canApply} onclick={handleConfirm}>
				Aplicar pagos
			</button>
		</footer>
	</div>
</dialog>

<style>
	.fe-medios-dialog {
		margin: auto;
		padding: 0;
		border: none;
		max-width: min(42rem, calc(100vw - 2rem));
		width: 100%;
		background: transparent;
	}

	.fe-medios-dialog::backdrop {
		background: rgb(15 23 42 / 45%);
	}

	.fe-medios-dialog__panel {
		display: flex;
		flex-direction: column;
		max-height: min(90vh, 36rem);
		background: var(--color-card, #fff);
		border: 1px solid var(--color-border, #e2e8f0);
		border-radius: 8px;
		overflow: hidden;
		box-shadow: 0 16px 48px rgb(15 23 42 / 18%);
	}

	.fe-medios-dialog__header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1rem;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid var(--color-border, #e2e8f0);
	}

	.fe-medios-dialog__title {
		margin: 0;
		font-size: 1.05rem;
		font-weight: 600;
	}

	.fe-medios-dialog__subtitle {
		margin: 0.25rem 0 0;
		font-size: 0.8125rem;
		color: var(--color-muted-foreground, #64748b);
	}

	.fe-medios-dialog__close {
		border: none;
		background: transparent;
		font-size: 1.5rem;
		line-height: 1;
		cursor: pointer;
		color: var(--color-muted-foreground, #64748b);
	}

	.fe-medios-dialog__totals {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.65rem;
		padding: 1rem 1.25rem 0;
	}

	.fe-medios-dialog__total-box {
		padding: 0.65rem 0.75rem;
		border: 1px solid var(--color-border, #e2e8f0);
		border-radius: 6px;
		background: var(--color-muted, #f8fafc);
	}

	.fe-medios-dialog__total-box--highlight {
		border-color: color-mix(in srgb, var(--color-warning, #b8860b) 55%, transparent);
		background: color-mix(in srgb, var(--color-warning, #b8860b) 8%, transparent);
	}

	.fe-medios-dialog__total-label {
		display: block;
		font-size: 0.625rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-muted-foreground, #64748b);
	}

	.fe-medios-dialog__total-value {
		display: block;
		margin-top: 0.2rem;
		font-size: 0.9375rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	.fe-medios-dialog__table-wrap {
		margin: 1rem 1.25rem 0;
		border: 1px solid var(--color-border, #e2e8f0);
		border-radius: 6px;
		overflow: hidden;
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	.fe-medios-dialog__head {
		display: grid;
		grid-template-columns: 4rem 1fr minmax(0, 11rem);
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		font-size: 0.625rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-muted-foreground, #64748b);
		background: var(--color-muted, #f1f5f9);
		border-bottom: 1px solid var(--color-border, #e2e8f0);
	}

	.fe-medios-dialog__list {
		margin: 0;
		padding: 0;
		list-style: none;
		overflow: auto;
	}

	.fe-medios-dialog__row {
		display: grid;
		grid-template-columns: 4rem 1fr minmax(0, 11rem);
		gap: 0.5rem;
		align-items: center;
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid var(--color-border, #e2e8f0);
	}

	.fe-medios-dialog__toggle {
		position: relative;
		display: inline-flex;
		cursor: pointer;
	}

	.fe-medios-dialog__toggle input {
		position: absolute;
		opacity: 0;
		width: 0;
		height: 0;
	}

	.fe-medios-dialog__switch {
		width: 2.25rem;
		height: 1.25rem;
		border-radius: 999px;
		background: var(--color-border, #cbd5e1);
		transition: background 0.15s;
	}

	.fe-medios-dialog__switch::after {
		content: '';
		display: block;
		width: 1rem;
		height: 1rem;
		margin: 0.125rem;
		border-radius: 50%;
		background: #fff;
		transition: transform 0.15s;
	}

	.fe-medios-dialog__toggle input:checked + .fe-medios-dialog__switch {
		background: var(--color-primary, #0f172a);
	}

	.fe-medios-dialog__toggle input:checked + .fe-medios-dialog__switch::after {
		transform: translateX(1rem);
	}

	.fe-medios-dialog__medio-name {
		display: block;
		font-size: 0.875rem;
		font-weight: 500;
	}

	.fe-medios-dialog__medio-code {
		font-size: 0.75rem;
		color: var(--color-muted-foreground, #64748b);
	}

	.fe-medios-dialog__monto-cell {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.fe-medios-dialog__monto-input {
		width: 100%;
		padding: 0.35rem 0.5rem;
		font-size: 0.875rem;
	}

	.fe-medios-dialog__restante {
		font-size: 0.6875rem;
		padding: 0.2rem 0.45rem;
		align-self: flex-start;
	}

	.fe-medios-dialog__hint,
	.fe-medios-dialog__error {
		margin: 0.75rem 1.25rem 0;
		font-size: 0.8125rem;
	}

	.fe-medios-dialog__hint {
		color: var(--color-warning, #b8860b);
	}

	.fe-medios-dialog__error {
		color: var(--color-danger, #c0392b);
	}

	.fe-medios-dialog__footer {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		padding: 1rem 1.25rem;
		border-top: 1px solid var(--color-border, #e2e8f0);
		margin-top: auto;
	}

	@media (max-width: 640px) {
		.fe-medios-dialog__head,
		.fe-medios-dialog__row {
			grid-template-columns: 1fr;
		}
	}
</style>
