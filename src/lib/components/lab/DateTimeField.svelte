<script lang="ts">
	import {
		combineDateTimeLocal,
		getDefaultDeliveryDateTime,
		getMinDate,
		getMinTimeForDate,
		splitDateTimeLocal
	} from '$lib/lab/helpers';

	interface Props {
		id?: string;
		label?: string;
		value?: string;
		required?: boolean;
	}

	let {
		id = 'fecha-entrega',
		label = 'Fecha y hora de entrega',
		value = $bindable(''),
		required = true
	}: Props = $props();

	let datePart = $state('');
	let timePart = $state('10:00');
	let syncing = $state(false);

	$effect(() => {
		if (syncing) return;
		if (!value) {
			const defaults = splitDateTimeLocal(getDefaultDeliveryDateTime());
			datePart = defaults.date;
			timePart = defaults.time;
			syncing = true;
			value = combineDateTimeLocal(datePart, timePart);
			syncing = false;
			return;
		}
		const parts = splitDateTimeLocal(value);
		if (parts.date !== datePart || parts.time !== timePart) {
			datePart = parts.date;
			timePart = parts.time;
		}
	});

	const minTime = $derived(getMinTimeForDate(datePart));
	const preview = $derived.by(() => {
		if (!datePart || !timePart) return '';
		const combined = combineDateTimeLocal(datePart, timePart);
		const parsed = new Date(combined);
		if (Number.isNaN(parsed.getTime())) return '';
		return parsed.toLocaleString('es-ES', {
			weekday: 'short',
			day: '2-digit',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	});

	function updateValue() {
		if (!datePart) {
			value = '';
			return;
		}
		syncing = true;
		value = combineDateTimeLocal(datePart, timePart);
		syncing = false;
	}

	function onDateChange(e: Event) {
		datePart = (e.currentTarget as HTMLInputElement).value;
		if (minTime && timePart < minTime) timePart = minTime;
		updateValue();
	}

	function onTimeChange(e: Event) {
		timePart = (e.currentTarget as HTMLInputElement).value;
		updateValue();
	}
</script>

<div class="datetime-field">
	<span class="field-label" id="{id}-label">{label}{required ? ' *' : ''}</span>
	<div class="datetime-field__inputs" role="group" aria-labelledby="{id}-label">
		<div class="datetime-field__part">
			<label class="datetime-field__sublabel" for="{id}-date">Fecha</label>
			<input
				id="{id}-date"
				class="field-input datetime-field__input"
				type="date"
				value={datePart}
				min={getMinDate()}
				{required}
				onchange={onDateChange}
			/>
		</div>
		<div class="datetime-field__part">
			<label class="datetime-field__sublabel" for="{id}-time">Hora</label>
			<input
				id="{id}-time"
				class="field-input datetime-field__input"
				type="time"
				value={timePart}
				min={minTime}
				step="300"
				{required}
				onchange={onTimeChange}
			/>
		</div>
	</div>
	{#if preview}
		<p class="datetime-field__preview">Entrega programada: {preview}</p>
	{/if}
</div>

<!-- Hidden field keeps form validation in sync with combined value -->
<input type="hidden" name={id} {value} {required} />
