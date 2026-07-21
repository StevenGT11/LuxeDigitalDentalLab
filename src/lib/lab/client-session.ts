import { browser } from '$app/environment';
import {
	createDoctor,
	deactivateDoctor,
	fetchClientById,
	fetchOwnClient,
	fetchOwnDoctors,
	syncOwnProfile,
	upsertOwnClient,
	type DbDoctor
} from './clients-db';
import { remapCachedCaseClientId } from './cases-cache';
import { remapCachedInvoiceClientId } from './invoices-cache';
import type { ClientProfile, LabClient } from './types';

const PROFILE_KEY = 'luxe-lab-profile';
const CLIENT_KEY = 'luxe-lab-client-id';
const CASES_KEY = 'luxe-lab-cases';
const INVOICES_KEY = 'luxe-lab-invoices';
const CLIENTS_KEY = 'luxe-lab-clients-registry';

let supabaseLinked = false;
let cachedClient: LabClient | null = null;
let cachedDoctors: DbDoctor[] = [];
const doctorsById = new Map<string, string>();
let hydratePromise: Promise<LabClient | null> | null = null;
let ensureDefaultDoctorPromise: Promise<void> | null = null;

function persistProfile(profile: ClientProfile): void {
	if (!browser) return;
	localStorage.setItem(CLIENT_KEY, profile.id);
	localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

function remapLocalClientId(oldId: string, newId: string): void {
	if (!browser || oldId === newId) return;

	const casesRaw = localStorage.getItem(CASES_KEY);
	if (casesRaw) {
		const cases = JSON.parse(casesRaw) as { client_id: string }[];
		let changed = false;
		for (const c of cases) {
			if (c.client_id === oldId) {
				c.client_id = newId;
				changed = true;
			}
		}
		if (changed) localStorage.setItem(CASES_KEY, JSON.stringify(cases));
	}

	const invRaw = localStorage.getItem(INVOICES_KEY);
	if (invRaw) {
		const invoices = JSON.parse(invRaw) as { client_id: string }[];
		let changed = false;
		for (const i of invoices) {
			if (i.client_id === oldId) {
				i.client_id = newId;
				changed = true;
			}
		}
		if (changed) localStorage.setItem(INVOICES_KEY, JSON.stringify(invoices));
	}

	try {
		const regRaw = localStorage.getItem(CLIENTS_KEY);
		if (regRaw) {
			const clients = JSON.parse(regRaw) as LabClient[];
			const idx = clients.findIndex((c) => c.id === oldId);
			if (idx >= 0) {
				clients[idx] = { ...clients[idx], id: newId };
				localStorage.setItem(CLIENTS_KEY, JSON.stringify(clients));
			}
		}
	} catch {
		/* ignore */
	}
}

function labClientToProfile(client: LabClient): ClientProfile {
	return {
		id: client.id,
		nombre: client.nombre,
		clinica: client.clinica,
		email: client.email,
		telefono: client.telefono
	};
}

function setDoctorsCache(doctors: DbDoctor[]): void {
	cachedDoctors = doctors;
	doctorsById.clear();
	for (const d of doctors) doctorsById.set(d.id, d.nombre);
}

export function isSupabaseClientLinked(): boolean {
	return supabaseLinked;
}

export function getCachedClient(): LabClient | null {
	return cachedClient;
}

export function getCachedDoctors(): DbDoctor[] {
	return [...cachedDoctors];
}

export function getDoctorDisplayName(doctorId: string): string | null {
	return doctorsById.get(doctorId) ?? null;
}

export function getClientProfileFromCache(): ClientProfile | null {
	return cachedClient ? labClientToProfile(cachedClient) : null;
}

/** Alinea caché/localStorage con el cliente real de Supabase (evita filtrar casos por ID huérfano). */
export function syncCachedClient(client: LabClient): void {
	if (!browser) return;
	const previousId = localStorage.getItem(CLIENT_KEY);
	if (previousId && previousId !== client.id) {
		remapLocalClientId(previousId, client.id);
		remapCachedCaseClientId(previousId, client.id);
		remapCachedInvoiceClientId(previousId, client.id);
	}
	cachedClient = client;
	supabaseLinked = true;
	persistProfile(labClientToProfile(client));
}

/** Un solo doctor por defecto si la clínica no tiene ninguno (evita duplicados por carreras). */
async function ensureDefaultDoctorIfEmpty(client: LabClient): Promise<void> {
	const run = async () => {
		let doctors = await fetchOwnDoctors();
		if (doctors.length > 0) {
			setDoctorsCache(doctors);
			return;
		}
		const nombre = client.nombre.trim();
		if (!nombre) {
			setDoctorsCache([]);
			return;
		}
		const created = await createDoctor(nombre);
		setDoctorsCache([created]);
	};

	if (ensureDefaultDoctorPromise) {
		await ensureDefaultDoctorPromise;
		const doctors = await fetchOwnDoctors();
		setDoctorsCache(doctors);
		return;
	}

	ensureDefaultDoctorPromise = run().finally(() => {
		ensureDefaultDoctorPromise = null;
	});
	await ensureDefaultDoctorPromise;
}

/** Carga cliente y doctores desde Supabase; sincroniza ID local para casos en localStorage. */
export async function hydrateClientSession(): Promise<LabClient | null> {
	if (!browser) return null;
	if (hydratePromise) return hydratePromise;

	hydratePromise = (async () => {
		const previousId = localStorage.getItem(CLIENT_KEY);
		const client = await fetchOwnClient();

		if (!client) {
			supabaseLinked = false;
			return null;
		}

		if (previousId && previousId !== client.id) {
			remapLocalClientId(previousId, client.id);
			remapCachedCaseClientId(previousId, client.id);
			remapCachedInvoiceClientId(previousId, client.id);
		}

		cachedClient = client;
		supabaseLinked = true;
		persistProfile(labClientToProfile(client));

		await ensureDefaultDoctorIfEmpty(client);
		return client;
	})().finally(() => {
		hydratePromise = null;
	});

	return hydratePromise;
}

export async function saveClientProfileRemote(
	data: Omit<ClientProfile, 'id'>
): Promise<ClientProfile> {
	const client = await upsertOwnClient({
		nombre: data.nombre.trim(),
		clinica: data.clinica.trim(),
		email: data.email.trim(),
		telefono: data.telefono.trim()
	});

	await syncOwnProfile({
		nombre: client.nombre,
		clinica: client.clinica,
		telefono: client.telefono
	});

	cachedClient = client;
	supabaseLinked = true;
	const profile = labClientToProfile(client);
	persistProfile(profile);

	setDoctorsCache(await fetchOwnDoctors());

	return profile;
}

export async function reloadDoctors(): Promise<DbDoctor[]> {
	const doctors = await fetchOwnDoctors();
	setDoctorsCache(doctors);
	return doctors;
}

export async function addDoctor(nombre: string): Promise<DbDoctor> {
	const doctor = await createDoctor(nombre);
	cachedDoctors = [...cachedDoctors, doctor];
	doctorsById.set(doctor.id, doctor.nombre);
	return doctor;
}

export async function removeDoctor(doctorId: string): Promise<void> {
	await deactivateDoctor(doctorId);
	cachedDoctors = cachedDoctors.filter((d) => d.id !== doctorId);
	doctorsById.delete(doctorId);
}

export async function loadClientForAdmin(clientId: string): Promise<LabClient | null> {
	try {
		return await fetchClientById(clientId);
	} catch {
		return null;
	}
}
