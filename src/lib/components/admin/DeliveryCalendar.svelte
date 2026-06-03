<script lang="ts">
	import CasePreviewModal from '$lib/components/admin/CasePreviewModal.svelte';
	import DeliveryAgendaList from '$lib/components/admin/DeliveryAgendaList.svelte';
	import {
		addDays,
		addMonths,
		buildMonthGrid,
		buildWeekDays,
		countCasesInMonth,
		countCasesInWeek,
		countOverdueDeliveries,
		countTodayDeliveries,
		formatDayTitle,
		formatMonthTitle,
		formatWeekTitle,
		getActiveDeliveryCases,
		getWeekdayLabels,
		groupCasesByDeliveryDate,
		isPastDay,
		isToday,
		type CalendarViewMode
	} from '$lib/lab/calendar';
	import { formatTimeOnly, parseDateKey, toDateKey } from '$lib/lab/helpers';
	import type { LabCase } from '$lib/lab/types';
	import { CalendarDays, ChevronLeft, ChevronRight, Clock } from '@lucide/svelte';

	interface Props {
		cases?: LabCase[];
	}

	let { cases = [] }: Props = $props();

	let viewMode = $state<CalendarViewMode>('month');
	let viewYear = $state(new Date().getFullYear());
	let viewMonth = $state(new Date().getMonth());
	let selectedKey = $state(toDateKey(new Date()));
	let showFinished = $state(false);
	let previewCase = $state<LabCase | null>(null);

	const activeCases = $derived(getActiveDeliveryCases(cases, showFinished));
	const casesByDate = $derived(groupCasesByDeliveryDate(activeCases));
	const focusDate = $derived(parseDateKey(selectedKey));
	const weekDays = $derived(buildWeekDays(focusDate));
	const weeks = $derived(buildMonthGrid(viewYear, viewMonth));
	const weekdayLabels = getWeekdayLabels();

	const monthCount = $derived(countCasesInMonth(casesByDate, viewYear, viewMonth));
	const weekCount = $derived(countCasesInWeek(casesByDate, weekDays));
	const todayCount = $derived(countTodayDeliveries(casesByDate));
	const overdueCount = $derived(countOverdueDeliveries(activeCases));

	const selectedCases = $derived(casesByDate.get(selectedKey) ?? []);

	const periodTitle = $derived.by(() => {
		if (viewMode === 'day') return formatDayTitle(focusDate);
		if (viewMode === 'week') return formatWeekTitle(weekDays);
		return formatMonthTitle(viewYear, viewMonth);
	});

	function syncViewFromSelected() {
		const d = parseDateKey(selectedKey);
		viewYear = d.getFullYear();
		viewMonth = d.getMonth();
	}

	function selectDay(date: Date) {
		selectedKey = toDateKey(date);
		syncViewFromSelected();
	}

	function openCasePreview(caso: LabCase, day?: Date) {
		if (day) selectDay(day);
		previewCase = caso;
	}

	function closeCasePreview() {
		previewCase = null;
	}

	function setViewMode(mode: CalendarViewMode) {
		viewMode = mode;
		syncViewFromSelected();
	}

	function prevPeriod() {
		if (viewMode === 'day') {
			selectDay(addDays(focusDate, -1));
		} else if (viewMode === 'week') {
			selectDay(addDays(focusDate, -7));
		} else {
			const prev = addMonths(viewYear, viewMonth, -1);
			viewYear = prev.year;
			viewMonth = prev.month;
			selectedKey = toDateKey(new Date(viewYear, viewMonth, 1));
		}
	}

	function nextPeriod() {
		if (viewMode === 'day') {
			selectDay(addDays(focusDate, 1));
		} else if (viewMode === 'week') {
			selectDay(addDays(focusDate, 7));
		} else {
			const next = addMonths(viewYear, viewMonth, 1);
			viewYear = next.year;
			viewMonth = next.month;
			selectedKey = toDateKey(new Date(viewYear, viewMonth, 1));
		}
	}

	function goToday() {
		const now = new Date();
		viewYear = now.getFullYear();
		viewMonth = now.getMonth();
		selectedKey = toDateKey(now);
	}

	function casesOnDay(date: Date): LabCase[] {
		return casesByDate.get(toDateKey(date)) ?? [];
	}

	function isOverdueCase(caso: LabCase, date: Date): boolean {
		return caso.estado !== 'finalizado' && isPastDay(date);
	}

	function navLabelPrev(): string {
		if (viewMode === 'day') return 'Día anterior';
		if (viewMode === 'week') return 'Semana anterior';
		return 'Mes anterior';
	}

	function navLabelNext(): string {
		if (viewMode === 'day') return 'Día siguiente';
		if (viewMode === 'week') return 'Semana siguiente';
		return 'Mes siguiente';
	}

	function shortWeekday(date: Date): string {
		return date.toLocaleDateString('es-ES', { weekday: 'short' });
	}
</script>

<div class="delivery-calendar">
	<section class="delivery-calendar__hero dash-panel">
		<div class="delivery-calendar__stats">
			<div class="delivery-calendar__stat">
				<span class="delivery-calendar__stat-value">{todayCount}</span>
				<span class="delivery-calendar__stat-label">Entregas hoy</span>
			</div>
			<div class="delivery-calendar__stat">
				<span class="delivery-calendar__stat-value">{viewMode === 'week' ? weekCount : monthCount}</span>
				<span class="delivery-calendar__stat-label">{viewMode === 'week' ? 'Esta semana' : 'Este mes'}</span>
			</div>
			<div class="delivery-calendar__stat">
				<span class="delivery-calendar__stat-value">{activeCases.length}</span>
				<span class="delivery-calendar__stat-label">Casos activos</span>
			</div>
			<div class="delivery-calendar__stat delivery-calendar__stat--alert">
				<span class="delivery-calendar__stat-value">{overdueCount}</span>
				<span class="delivery-calendar__stat-label">Atrasados</span>
			</div>
		</div>

		<div class="delivery-calendar__view-tabs" role="tablist" aria-label="Vista del calendario">
			<button
				type="button"
				role="tab"
				class="delivery-calendar__view-tab"
				class:delivery-calendar__view-tab--active={viewMode === 'day'}
				aria-selected={viewMode === 'day'}
				onclick={() => setViewMode('day')}
			>
				Día
			</button>
			<button
				type="button"
				role="tab"
				class="delivery-calendar__view-tab"
				class:delivery-calendar__view-tab--active={viewMode === 'week'}
				aria-selected={viewMode === 'week'}
				onclick={() => setViewMode('week')}
			>
				Semana
			</button>
			<button
				type="button"
				role="tab"
				class="delivery-calendar__view-tab"
				class:delivery-calendar__view-tab--active={viewMode === 'month'}
				aria-selected={viewMode === 'month'}
				onclick={() => setViewMode('month')}
			>
				Mes
			</button>
		</div>

		<div class="delivery-calendar__header">
			<div class="delivery-calendar__nav">
				<button type="button" class="delivery-calendar__nav-btn" aria-label={navLabelPrev()} onclick={prevPeriod}>
					<ChevronLeft size={20} strokeWidth={1.75} />
				</button>
				<div class="delivery-calendar__title-wrap">
					<CalendarDays size={22} strokeWidth={1.5} aria-hidden="true" />
					<h2 class="delivery-calendar__month">{periodTitle}</h2>
				</div>
				<button type="button" class="delivery-calendar__nav-btn" aria-label={navLabelNext()} onclick={nextPeriod}>
					<ChevronRight size={20} strokeWidth={1.75} />
				</button>
			</div>
			<div class="delivery-calendar__actions">
				<button type="button" class="btn-secondary-pill" onclick={goToday}>Ir a hoy</button>
				<label class="delivery-calendar__toggle">
					<input type="checkbox" bind:checked={showFinished} />
					Mostrar entregados
				</label>
			</div>
		</div>
	</section>

	{#if viewMode === 'day'}
		<section class="delivery-calendar__detail dash-panel delivery-calendar__detail--day">
			<header class="delivery-calendar__detail-head">
				<div>
					<h3 class="delivery-calendar__detail-title">Agenda del día</h3>
					<p class="delivery-calendar__detail-date">{formatDayTitle(focusDate)}</p>
				</div>
				{#if selectedCases.length > 0}
					<span class="delivery-calendar__detail-count">
						{selectedCases.length} entrega{selectedCases.length === 1 ? '' : 's'}
					</span>
				{/if}
			</header>
			<DeliveryAgendaList
				items={selectedCases}
				emptyMessage="Sin entregas programadas para este día."
				onCasePreview={(caso) => openCasePreview(caso)}
			/>
		</section>
	{:else if viewMode === 'week'}
		<section class="delivery-calendar__week-panel dash-panel">
			<div class="delivery-calendar__week-grid">
				{#each weekDays as day}
					{@const key = toDateKey(day)}
					{@const dayCases = casesOnDay(day)}
					<div
						class="delivery-calendar__week-col"
						class:delivery-calendar__week-col--today={isToday(day)}
						class:delivery-calendar__week-col--selected={selectedKey === key}
					>
						<button type="button" class="delivery-calendar__week-col-head" onclick={() => selectDay(day)}>
							<span class="delivery-calendar__week-col-weekday">{shortWeekday(day)}</span>
							<span class="delivery-calendar__week-col-date">{day.getDate()}</span>
							{#if dayCases.length > 0}
								<span class="delivery-calendar__week-col-count">{dayCases.length}</span>
							{/if}
						</button>
						<ul class="delivery-calendar__week-events">
							{#each dayCases as caso (caso.id)}
								<li>
									<button
										type="button"
										class="delivery-calendar__week-event"
										class:delivery-calendar__week-event--overdue={isOverdueCase(caso, day)}
										onclick={() => openCasePreview(caso, day)}
									>
										<span class="delivery-calendar__week-event-time">
											<Clock size={12} strokeWidth={2} aria-hidden="true" />
											{formatTimeOnly(caso.fecha_entrega)}
										</span>
										<span class="delivery-calendar__week-event-case">{caso.case_number}</span>
										<span class="delivery-calendar__week-event-patient">{caso.paciente_name}</span>
									</button>
								</li>
							{/each}
							{#if dayCases.length === 0}
								<li class="delivery-calendar__week-empty">—</li>
							{/if}
						</ul>
					</div>
				{/each}
			</div>
		</section>

		<section class="delivery-calendar__detail dash-panel">
			<header class="delivery-calendar__detail-head">
				<div>
					<h3 class="delivery-calendar__detail-title">Detalle del día seleccionado</h3>
					<p class="delivery-calendar__detail-date">{formatDayTitle(focusDate)}</p>
				</div>
				<span class="delivery-calendar__detail-count">{weekCount} esta semana</span>
			</header>
			<DeliveryAgendaList
				items={selectedCases}
				onCasePreview={(caso) => openCasePreview(caso)}
			/>
		</section>
	{:else}
		<section class="delivery-calendar__grid-panel dash-panel">
			<div class="delivery-calendar__weekdays">
				{#each weekdayLabels as label}
					<span class="delivery-calendar__weekday">{label}</span>
				{/each}
			</div>

			<div class="delivery-calendar__weeks">
				{#each weeks as week}
					<div class="delivery-calendar__week">
						{#each week as cell}
							{@const dayCases = casesOnDay(cell.date)}
							{@const key = toDateKey(cell.date)}
							<div
								class="delivery-calendar__day"
								class:delivery-calendar__day--muted={!cell.inMonth}
								class:delivery-calendar__day--today={isToday(cell.date)}
								class:delivery-calendar__day--past={isPastDay(cell.date) && dayCases.length > 0}
								class:delivery-calendar__day--selected={selectedKey === key}
								class:delivery-calendar__day--busy={dayCases.length > 0}
							>
								<button
									type="button"
									class="delivery-calendar__day-select"
									aria-label="Seleccionar {formatDayTitle(cell.date)}"
									onclick={() => selectDay(cell.date)}
								>
									<div class="delivery-calendar__day-top">
										<span class="delivery-calendar__day-num">{cell.date.getDate()}</span>
										{#if dayCases.length > 0}
											<span class="delivery-calendar__day-badge">{dayCases.length}</span>
										{/if}
									</div>
								</button>

								{#if dayCases.length > 0}
									<div class="delivery-calendar__day-events">
										{#each dayCases.slice(0, 3) as caso (caso.id)}
											<button
												type="button"
												class="delivery-calendar__chip"
												class:delivery-calendar__chip--overdue={isOverdueCase(caso, cell.date)}
												onclick={() => openCasePreview(caso, cell.date)}
											>
												<Clock size={11} strokeWidth={2} aria-hidden="true" />
												{formatTimeOnly(caso.fecha_entrega)}
												<span class="delivery-calendar__chip-case">{caso.case_number}</span>
											</button>
										{/each}
										{#if dayCases.length > 3}
											<button
												type="button"
												class="delivery-calendar__more"
												onclick={() => selectDay(cell.date)}
											>
												+{dayCases.length - 3} más
											</button>
										{/if}
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{/each}
			</div>
		</section>

		<section class="delivery-calendar__detail dash-panel">
			<header class="delivery-calendar__detail-head">
				<div>
					<h3 class="delivery-calendar__detail-title">Agenda del día</h3>
					<p class="delivery-calendar__detail-date">{formatDayTitle(focusDate)}</p>
				</div>
				{#if selectedCases.length > 0}
					<span class="delivery-calendar__detail-count">
						{selectedCases.length} entrega{selectedCases.length === 1 ? '' : 's'}
					</span>
				{/if}
			</header>
			<DeliveryAgendaList
				items={selectedCases}
				onCasePreview={(caso) => openCasePreview(caso)}
			/>
		</section>
	{/if}

	<CasePreviewModal caso={previewCase} onClose={closeCasePreview} />
</div>
