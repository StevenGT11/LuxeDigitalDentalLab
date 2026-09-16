<script lang="ts">
	import { enhance } from '$app/forms';

	let {
		email,
		form,
		onSaved
	}: {
		email: string;
		form?: { message?: string; success?: boolean; email?: string };
		onSaved?: (email: string) => void;
	} = $props();

	let saving = $state(false);
	let accessEmail = $derived(email);
	let password = $state('');
	let passwordConfirm = $state('');
</script>

<section class="dash-panel dash-panel--section" style="margin-top: var(--spacing-xxl);">
	<h3 class="dash-panel__section-title">Acceso al portal</h3>
	<p class="type-caption" style="margin-bottom: var(--spacing-md);">
		Correo y contraseña con los que la clínica entra al portal. Deje la contraseña vacía si solo
		cambia el correo. Para probarla: cierre sesión (o use una ventana privada) e inicie con
		<strong>este correo</strong>, no con el del administrador.
	</p>

	{#if form?.message}
		<p
			class="type-caption"
			style="margin-bottom: var(--spacing-md); color: {form.success
				? 'var(--color-success)'
				: 'var(--color-danger)'};"
			role="alert"
		>
			{form.message}
		</p>
	{/if}

	<form
		method="POST"
		action="?/updateCredentials"
		autocomplete="off"
		use:enhance={({ formData }) => {
			formData.set('email', accessEmail);
			formData.set('password', password);
			formData.set('passwordConfirm', passwordConfirm);
			saving = true;
			return async ({ result, update }) => {
				saving = false;
				await update({ reset: false });
				if (result.type === 'success') {
					const saved =
						result.data && typeof result.data === 'object' && 'email' in result.data
							? String(result.data.email ?? '')
							: '';
					if (saved) onSaved?.(saved);
					password = '';
					passwordConfirm = '';
				}
			};
		}}
	>
		<div class="cred-grid">
			<label class="field field--full">
				<span class="field-label">Correo de acceso</span>
				<input
					class="field-input"
					type="email"
					name="email"
					bind:value={accessEmail}
					required
					autocomplete="off"
					readonly
					onfocus={(e) => e.currentTarget.removeAttribute('readonly')}
				/>
			</label>
			<label class="field">
				<span class="field-label">Nueva contraseña</span>
				<input
					class="field-input"
					type="password"
					name="password"
					bind:value={password}
					autocomplete="new-password"
					placeholder="Opcional"
					data-1p-ignore
					data-lpignore="true"
				/>
			</label>
			<label class="field">
				<span class="field-label">Confirmar contraseña</span>
				<input
					class="field-input"
					type="password"
					name="passwordConfirm"
					bind:value={passwordConfirm}
					autocomplete="new-password"
					placeholder="Opcional"
					data-1p-ignore
					data-lpignore="true"
				/>
			</label>
		</div>
		<button type="submit" class="btn-primary" style="margin-top: var(--spacing-md);" disabled={saving}>
			{saving ? 'Guardando…' : 'Guardar acceso'}
		</button>
	</form>
</section>

<style>
	.cred-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--spacing-md);
	}
	.field--full {
		grid-column: 1 / -1;
	}
	@media (max-width: 640px) {
		.cred-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
