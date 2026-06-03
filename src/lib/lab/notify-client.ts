import { browser } from '$app/environment';

async function postNotify(path: string, caseId: string): Promise<void> {
	const res = await fetch(path, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		credentials: 'include',
		body: JSON.stringify({ caseId })
	});

	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		const message =
			typeof body?.message === 'string'
				? body.message
				: `Notificación fallida (${res.status})`;
		console.warn(`[notify] ${path}:`, message);
	}
}

/** No bloquea la UI; errores solo en consola. */
export function requestNewCaseAdminNotification(caseId: string): void {
	if (!browser || !caseId) return;
	void postNotify('/api/notify/case-created', caseId);
}

export function requestCaseFinalizedClientNotification(caseId: string): void {
	if (!browser || !caseId) return;
	void postNotify('/api/notify/case-finalized', caseId);
}
