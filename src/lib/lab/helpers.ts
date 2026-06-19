export function formatDate(dateString: string): string {
	if (!dateString) return 'N/A';
	return new Date(dateString).toLocaleDateString('es-ES', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric'
	});
}

export function formatDateTime(dateString: string): string {
	if (!dateString) return 'N/A';
	return new Date(dateString).toLocaleString('es-ES', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});
}

export function formatCurrency(amount: number): string {
	return new Intl.NumberFormat('es-CR', {
		style: 'currency',
		currency: 'USD'
	}).format(amount);
}

export function formatColones(amount: number): string {
	return new Intl.NumberFormat('es-CR', {
		style: 'currency',
		currency: 'CRC',
		minimumFractionDigits: 0,
		maximumFractionDigits: 0
	}).format(amount);
}

export function daysUntil(dateString: string): number {
	const target = new Date(dateString);
	const now = new Date();
	now.setHours(0, 0, 0, 0);
	target.setHours(0, 0, 0, 0);
	return Math.ceil((target.getTime() - now.getTime()) / 86400000);
}

export function deliveryUrgencyClass(dateString: string, estado: string): string {
	if (estado === 'finalizado') return 'delivery-tag delivery-tag--done';
	const days = daysUntil(dateString);
	if (days < 0) return 'delivery-tag delivery-tag--overdue';
	if (days <= 3) return 'delivery-tag delivery-tag--urgent';
	if (days <= 7) return 'delivery-tag delivery-tag--soon';
	return 'delivery-tag';
}

export function formatDeliveryCountdown(dateString: string, estado: string): string {
	if (estado === 'finalizado') return 'Entregado';
	const days = daysUntil(dateString);
	if (days < 0) return `${Math.abs(days)} días de retraso`;
	if (days === 0) return 'Entrega hoy';
	if (days === 1) return 'Entrega mañana';
	return `Entrega en ${days} días`;
}

export function getMinDateTime(): string {
	const now = new Date();
	return toDateTimeLocalValue(now);
}

export function getMinDate(): string {
	const now = new Date();
	return formatDateInput(now);
}

export function getDefaultDeliveryDateTime(): string {
	const next = new Date();
	next.setDate(next.getDate() + 7);
	next.setHours(10, 0, 0, 0);
	return toDateTimeLocalValue(next);
}

function formatDateInput(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

function formatTimeInput(date: Date): string {
	const hours = String(date.getHours()).padStart(2, '0');
	const minutes = String(date.getMinutes()).padStart(2, '0');
	return `${hours}:${minutes}`;
}

export function toDateTimeLocalValue(date: Date): string {
	return `${formatDateInput(date)}T${formatTimeInput(date)}`;
}

export function isoToDateTimeLocal(iso: string): string {
	if (!iso) return getDefaultDeliveryDateTime();
	return toDateTimeLocalValue(new Date(iso));
}

export function formatLastEditedLine(caso: {
	last_edited_at?: string | null;
	last_edited_by_name?: string | null;
}): string | null {
	if (!caso.last_edited_at) return null;
	const when = formatDateTime(caso.last_edited_at);
	const who = caso.last_edited_by_name?.trim() || 'Cliente';
	return `Editado por última vez el ${when} por ${who}`;
}

export function splitDateTimeLocal(value: string): { date: string; time: string } {
	if (!value || !value.includes('T')) {
		return { date: '', time: '10:00' };
	}
	const [date, time = '10:00'] = value.split('T');
	return { date, time: time.slice(0, 5) };
}

export function combineDateTimeLocal(date: string, time: string): string {
	if (!date) return '';
	const safeTime = time || '10:00';
	return `${date}T${safeTime.slice(0, 5)}`;
}

export function dateTimeLocalToISO(value: string): string {
	if (!value) return '';
	if (!value.includes('T')) return new Date(value).toISOString();
	const [datePart, timePart] = value.split('T');
	const [year, month, day] = datePart.split('-').map(Number);
	const [hours, minutes] = timePart.split(':').map(Number);
	return new Date(year, month - 1, day, hours, minutes, 0).toISOString();
}

export function getMinTimeForDate(date: string): string | undefined {
	if (!date || date !== getMinDate()) return undefined;
	return formatTimeInput(new Date());
}

export function formatTimeOnly(dateString: string): string {
	if (!dateString) return '—';
	return new Date(dateString).toLocaleTimeString('es-ES', {
		hour: '2-digit',
		minute: '2-digit'
	});
}

export function toDateKey(date: Date): string {
	return formatDateInput(date);
}

export function parseDateKey(key: string): Date {
	const [year, month, day] = key.split('-').map(Number);
	return new Date(year, month - 1, day);
}

export function isSameDay(a: Date, b: Date): boolean {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}
