<script lang="ts">
	let {
		value = $bindable(''),
		name = 'fe_correo_facturacion',
		label = 'Correos de facturación',
		placeholder = 'uno@clinica.com, otro@clinica.com',
		required = false
	}: {
		value?: string;
		name?: string;
		label?: string;
		placeholder?: string;
		required?: boolean;
	} = $props();
</script>

<label class="field field--full">
	<span class="field-label">{label}</span>
	<textarea
		class="field-input fe-correos-field"
		{name}
		{required}
		rows="3"
		bind:value
		{placeholder}
	></textarea>
	<span class="type-caption fe-correos-field__hint">
		Puede poner varios, separados por coma o en líneas distintas.
	</span>
</label>

<style>
	.fe-correos-field {
		min-height: 4.5rem;
		resize: vertical;
	}

	.fe-correos-field__hint {
		display: block;
		margin-top: 0.35rem;
	}
</style>
