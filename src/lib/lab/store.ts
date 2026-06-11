import { browser } from '$app/environment';
import { DOCTORS, ESTADOS_EN_PROCESO, getCaseItemTipoLabel, isGuiaQuirurgica } from './constants';
import { getClientProfileFromCache, getDoctorDisplayName, isSupabaseClientLinked } from './client-session';
import { fetchClientById, fetchOwnClient } from './clients-db';
import { buildCaseItem, migrateCaseRow } from './case-builder';
import { uploadCaseFilesFromInputs } from './case-files-db';
import {
	createCaseInDb,
	fetchCaseByIdFromDb,
	hydrateCasesFromDb,
	updateCaseCostInDb,
	updateCaseStatusInDb
} from './cases-db';
import { getCachedCases, isCasesHydrated, runCasesHydrate } from './cases-cache';
import {
	createInvoiceInDb,
	fetchInvoiceByCaseId,
	hydrateInvoicesFromDb,
	updateInvoiceStatusInDb
} from './invoices-db';
import { getCachedInvoices, isInvoicesHydrated, runInvoicesHydrate } from './invoices-cache';
import { initializeTreatmentsStorage } from './treatments';
import type { CreateCaseInput } from './store-types';
import type {
	CaseFile,
	CaseItem,
	ClientProfile,
	ClientStats,
	Invoice,
	InvoiceEstado,
	LabCase,
	LabCaseEstado,
	LabClient
} from './types';

export type { CreateCaseInput, CreateCaseItemInput } from './store-types';

const CASES_KEY = 'luxe-lab-cases';
const CLIENTS_KEY = 'luxe-lab-clients-registry';
const INVOICES_KEY = 'luxe-lab-invoices';
const PROFILE_KEY = 'luxe-lab-profile';
const CLIENT_KEY = 'luxe-lab-client-id';
const COUNTER_KEY = 'luxe-lab-case-counter';
const INVOICE_COUNTER_KEY = 'luxe-lab-invoice-counter';

const STORAGE_QUOTA_MSG =
	'No hay espacio suficiente en el navegador. Quita archivos adjuntos grandes o libera almacenamiento local.';

function uid(): string {
	return crypto.randomUUID();
}

function loadJson<T>(key: string, fallback: T): T {
	if (!browser) return fallback;
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return fallback;
		const parsed = JSON.parse(raw) as T;
		return parsed ?? fallback;
	} catch {
		return fallback;
	}
}

function loadRawCases(): LabCase[] {
	const parsed = loadJson<unknown>(CASES_KEY, []);
	return Array.isArray(parsed) ? (parsed as LabCase[]) : [];
}

function isValidCase(caso: LabCase): boolean {
	return (
		Boolean(caso?.id) &&
		typeof caso.costo === 'number' &&
		!Number.isNaN(caso.costo) &&
		Boolean(caso.tipo_trabajo)
	);
}

/** Elimina entradas corruptas que impiden cargar la demo */
function purgeInvalidCaseStorage(): void {
	if (loadRawCases().length === 0) return;
	if (loadCases().length > 0) return;
	localStorage.removeItem(CASES_KEY);
	localStorage.removeItem(INVOICES_KEY);
}

function saveJson(key: string, data: unknown): void {
	if (!browser) return;
	try {
		localStorage.setItem(key, JSON.stringify(data));
	} catch {
		throw new Error(STORAGE_QUOTA_MSG);
	}
}

function loadCasesLocal(): LabCase[] {
	if (!browser) return [];
	return loadRawCases()
		.map((c) => migrateCaseRow(c))
		.filter(isValidCase);
}

function loadCases(): LabCase[] {
	if (isCasesHydrated()) return getCachedCases();
	return loadCasesLocal();
}

/** Carga casos desde Supabase (idempotente). */
export async function hydrateCasesOnce(): Promise<void> {
	if (!browser) return;
	await runCasesHydrate(() => hydrateCasesFromDb());
}

/** Carga facturas desde Supabase (idempotente). */
export async function hydrateInvoicesOnce(): Promise<void> {
	if (!browser) return;
	await runInvoicesHydrate(() => hydrateInvoicesFromDb());
}

/** Casos + facturas en paralelo. */
export async function hydrateLabDataOnce(): Promise<void> {
	if (!browser) return;
	await Promise.all([hydrateCasesOnce(), hydrateInvoicesOnce()]);
	if (isSupabaseClientLinked() && isCasesHydrated() && isInvoicesHydrated()) {
		localStorage.removeItem(CASES_KEY);
		localStorage.removeItem(INVOICES_KEY);
		localStorage.removeItem(COUNTER_KEY);
		localStorage.removeItem(INVOICE_COUNTER_KEY);
	}
}

function saveCases(cases: LabCase[]): void {
	saveJson(CASES_KEY, cases);
}

/** Inicializa catálogo y registro local mínimo (sin demo si hay Supabase). */
export function initializeLabStorage(options?: { linkClientPortal?: boolean }): void {
	if (!browser) return;
	initializeTreatmentsStorage();
	purgeInvalidCaseStorage();
	if (!isSupabaseClientLinked() && !isCasesHydrated()) {
		seedDemoCases();
	}
	ensureClientRegistry();
	if (!isInvoicesHydrated() && !isCasesHydrated()) {
		ensureInvoicesForCases();
	}
	if (options?.linkClientPortal) ensurePortalClientSession();
}

/** Todos los casos guardados en localStorage */
export function getStoredCases(): LabCase[] {
	return getAllCases();
}

/** Borra casos/facturas demo y vuelve a cargar datos de ejemplo */
export function resetLabDemoData(): void {
	if (!browser) return;
	localStorage.removeItem(CASES_KEY);
	localStorage.removeItem(CLIENTS_KEY);
	localStorage.removeItem(INVOICES_KEY);
	localStorage.removeItem(COUNTER_KEY);
	localStorage.removeItem(INVOICE_COUNTER_KEY);
	seedDemoCases();
	ensureClientRegistry();
	ensureInvoicesForCases();
}

function loadClients(): LabClient[] {
	const parsed = loadJson<unknown>(CLIENTS_KEY, []);
	return Array.isArray(parsed) ? (parsed as LabClient[]) : [];
}

function saveClients(clients: LabClient[]): void {
	saveJson(CLIENTS_KEY, clients);
}

function loadInvoices(): Invoice[] {
	const parsed = loadJson<unknown>(INVOICES_KEY, []);
	return Array.isArray(parsed) ? (parsed as Invoice[]) : [];
}

function saveInvoices(invoices: Invoice[]): void {
	saveJson(INVOICES_KEY, invoices);
}

function nextCaseNumber(): string {
	if (!browser) return 'LAB-000001';
	const current = Number(localStorage.getItem(COUNTER_KEY) ?? '0') + 1;
	localStorage.setItem(COUNTER_KEY, String(current));
	return `LAB-${String(current).padStart(6, '0')}`;
}

function nextInvoiceNumber(): string {
	if (!browser) return 'FAC-000001';
	const current = Number(localStorage.getItem(INVOICE_COUNTER_KEY) ?? '0') + 1;
	localStorage.setItem(INVOICE_COUNTER_KEY, String(current));
	return `FAC-${String(current).padStart(6, '0')}`;
}

export function getClientId(): string {
	if (!browser) return 'server';
	const cached = getClientProfileFromCache();
	if (cached?.id) return cached.id;
	let id = localStorage.getItem(CLIENT_KEY);
	if (!id) {
		id = uid();
		localStorage.setItem(CLIENT_KEY, id);
	}
	return id;
}

export function getClientProfile(): ClientProfile {
	const fromSupabase = getClientProfileFromCache();
	if (fromSupabase) return fromSupabase;

	const id = getClientId();
	if (!browser) {
		return { id, nombre: '', clinica: '', email: '', telefono: '' };
	}
	try {
		const raw = localStorage.getItem(PROFILE_KEY);
		if (raw) {
			const profile = JSON.parse(raw) as ClientProfile;
			if (profile.id === id) return profile;
		}
	} catch {
		/* ignore */
	}
	return { id, nombre: '', clinica: '', email: '', telefono: '' };
}

export function saveClientProfile(data: Omit<ClientProfile, 'id'>): ClientProfile {
	const profile: ClientProfile = { id: getClientId(), ...data };
	if (browser) {
		localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
		upsertLabClient(profile);
	}
	return profile;
}

export function upsertLabClient(profile: ClientProfile): LabClient {
	const clients = loadClients();
	const existing = clients.find((c) => c.id === profile.id);
	const client: LabClient = {
		id: profile.id,
		nombre: profile.nombre || 'Cliente sin nombre',
		clinica: profile.clinica || '—',
		email: profile.email || '',
		telefono: profile.telefono || '',
		fecha_registro: existing?.fecha_registro ?? new Date().toISOString()
	};

	if (existing) {
		const idx = clients.findIndex((c) => c.id === profile.id);
		clients[idx] = client;
	} else {
		clients.push(client);
	}
	saveClients(clients);
	return client;
}

export interface CreateLabClientInput {
	nombre: string;
	clinica?: string;
	email?: string;
	telefono?: string;
}

/** Registra un cliente nuevo desde el panel admin */
export function createLabClient(input: CreateLabClientInput): LabClient {
	if (!browser) {
		throw new Error('createLabClient solo está disponible en el navegador');
	}
	const nombre = input.nombre.trim();
	if (!nombre) {
		throw new Error('El nombre del cliente es requerido');
	}

	const client: LabClient = {
		id: uid(),
		nombre,
		clinica: input.clinica?.trim() || '—',
		email: input.email?.trim() || '',
		telefono: input.telefono?.trim() || '',
		fecha_registro: new Date().toISOString()
	};

	const clients = loadClients();
	clients.push(client);
	saveClients(clients);
	return client;
}

export function getAllClients(): LabClient[] {
	return loadClients().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

export function getClientById(id: string): LabClient | null {
	return loadClients().find((c) => c.id === id) ?? null;
}

export function getDoctorName(doctorId: string): string {
	const fromSupabase = getDoctorDisplayName(doctorId);
	if (fromSupabase) return fromSupabase;

	const fromList = DOCTORS.find((d) => d.id === doctorId);
	if (fromList) return fromList.name;

	const client = getClientById(doctorId);
	if (client?.nombre.trim()) return client.nombre.trim();

	const profile = getClientProfile();
	if (doctorId === profile.id && profile.nombre.trim()) return profile.nombre.trim();

	return 'N/A';
}

/** Doctor del caso: perfil del usuario logueado si no se indica otro */
export function resolveCaseDoctor(input?: {
	doctor_id?: string;
	doctor_name?: string;
}): { doctor_id: string; doctor_name: string } {
	if (input?.doctor_name?.trim()) {
		return {
			doctor_id: input.doctor_id ?? getClientProfile().id,
			doctor_name: input.doctor_name.trim()
		};
	}
	if (input?.doctor_id) {
		return {
			doctor_id: input.doctor_id,
			doctor_name: getDoctorName(input.doctor_id)
		};
	}

	const profile = getClientProfile();
	return {
		doctor_id: profile.id,
		doctor_name: profile.nombre.trim() || 'Usuario'
	};
}

export function getAllCases(): LabCase[] {
	return [...loadCases()].sort(
		(a, b) => new Date(b.fecha_creacion).getTime() - new Date(a.fecha_creacion).getTime()
	);
}

export function getCasesByClient(clientId: string): LabCase[] {
	return getAllCases().filter((c) => c.client_id === clientId);
}

export function getCaseById(id: string): LabCase | null {
	return getAllCases().find((c) => c.id === id) ?? null;
}

export async function getCaseByIdAsync(id: string): Promise<LabCase | null> {
	const local = getCaseById(id);
	if (local) return local;
	if (!browser) return null;
	return fetchCaseByIdFromDb(id);
}

export function getAllInvoices(): Invoice[] {
	const source = isInvoicesHydrated() ? getCachedInvoices() : loadInvoices();
	return [...source].sort(
		(a, b) => new Date(b.fecha_emision).getTime() - new Date(a.fecha_emision).getTime()
	);
}

export function getInvoicesByClient(clientId: string): Invoice[] {
	return getAllInvoices().filter((i) => i.client_id === clientId);
}

export function getInvoiceById(id: string): Invoice | null {
	return getAllInvoices().find((i) => i.id === id) ?? null;
}

export async function getInvoiceByCaseIdAsync(caseId: string): Promise<Invoice | null> {
	const cached = getAllInvoices().find((i) => i.case_id === caseId);
	if (cached) return cached;
	if (!browser) return null;
	return fetchInvoiceByCaseId(caseId);
}

export function getClientStats(clientId: string): ClientStats {
	const casos = getCasesByClient(clientId);
	return {
		totalCasos: casos.length,
		pendientes: casos.filter((c) => c.estado === 'pendiente').length,
		enProceso: casos.filter((c) => ESTADOS_EN_PROCESO.includes(c.estado)).length,
		finalizados: casos.filter((c) => c.estado === 'finalizado').length,
		totalGastado: casos.reduce((sum, c) => sum + c.costo, 0),
		totalPiezas: casos.reduce(
			(sum, c) => sum + (c.items.length ? c.items.reduce((s, i) => s + i.piezas, 0) : c.piezas),
			0
		)
	};
}

export function getAdminStats() {
	const casos = getAllCases();
	return {
		totalCasos: casos.length,
		pendientes: casos.filter((c) => c.estado === 'pendiente').length,
		enProceso: casos.filter((c) => ESTADOS_EN_PROCESO.includes(c.estado)).length,
		ingresosTotales: casos.reduce((sum, c) => sum + c.costo, 0)
	};
}

function invoiceLineLabel(item: CaseItem): string {
	const tipo = getCaseItemTipoLabel(item);
	if (isGuiaQuirurgica(item.tipo_trabajo)) {
		return `${tipo} — Diseño`;
	}
	const pieza = item.numero_pieza ? ` · pieza ${item.numero_pieza}` : '';
	const servicios: string[] = [];
	if (item.incluye_diseno) servicios.push('Diseño');
	if (item.incluye_fresado) servicios.push('Fresado');
	const serv = servicios.length ? ` — ${servicios.join(' + ')}` : '';
	return `${tipo}${pieza}${serv} ×${item.piezas}`;
}

function createInvoiceForCase(caso: LabCase, client: LabClient): Invoice {
	const lineas = caso.items.map((item) => ({
		descripcion: item.descripcion ?? invoiceLineLabel(item),
		cantidad: item.piezas,
		precio_unitario: item.unit_price,
		subtotal: item.subtotal
	}));

	const subtotal = caso.costo;
	const impuesto = Math.round(subtotal * 0.13 * 100) / 100;
	const total = Math.round((subtotal + impuesto) * 100) / 100;
	const now = new Date();

	return {
		id: uid(),
		invoice_number: nextInvoiceNumber(),
		client_id: client.id,
		client_name: client.nombre,
		client_clinica: client.clinica,
		case_id: caso.id,
		case_number: caso.case_number,
		paciente_name: caso.paciente_name,
		subtotal,
		impuesto,
		total,
		fecha_emision: now.toISOString(),
		fecha_vencimiento: new Date(now.getTime() + 30 * 86400000).toISOString(),
		estado: 'pendiente',
		lineas
	};
}

async function resolveClientForCase(clientId: string): Promise<LabClient> {
	const profile = getClientProfile();
	if (clientId === profile.id) {
		const own = await fetchOwnClient();
		if (own) return own;
	}
	const remote = await fetchClientById(clientId);
	if (remote) return remote;
	return upsertLabClient(
		clientId === profile.id
			? profile
			: {
					id: clientId,
					nombre: profile.nombre || 'Cliente',
					clinica: profile.clinica || '—',
					email: profile.email,
					telefono: profile.telefono
				}
	);
}

export async function createCase(input: CreateCaseInput): Promise<LabCase> {
	if (!browser) throw new Error('createCase solo está disponible en el navegador');

	const doctor = resolveCaseDoctor(input);
	const client = await resolveClientForCase(input.client_id);
	let nuevo = await createCaseInDb(input, client, doctor);

	const escaneos = input.escaneoFiles ?? [];
	const disenos = input.disenosFiles ?? [];
	if (escaneos.length > 0 || disenos.length > 0) {
		await uploadCaseFilesFromInputs(nuevo.id, escaneos, disenos);
		nuevo = (await fetchCaseByIdFromDb(nuevo.id)) ?? nuevo;
	}

	await createInvoiceInDb(nuevo, client);

	return nuevo;
}

export async function updateCaseStatus(id: string, estado: LabCaseEstado): Promise<LabCase | null> {
	if (!browser) return null;
	if (isCasesHydrated()) {
		return updateCaseStatusInDb(id, estado);
	}
	const cases = loadCasesLocal();
	const index = cases.findIndex((c) => c.id === id);
	if (index === -1) return null;
	cases[index] = { ...cases[index], estado };
	saveCases(cases);
	return cases[index];
}

export async function updateCaseCost(id: string, costo: number): Promise<LabCase | null> {
	if (!browser) return null;
	if (isCasesHydrated()) {
		return updateCaseCostInDb(id, costo);
	}
	const cases = loadCasesLocal();
	const index = cases.findIndex((c) => c.id === id);
	if (index === -1) return null;
	const caso = cases[index];
	const items = [...caso.items];
	if (items.length === 1) {
		items[0] = {
			...items[0],
			subtotal: costo,
			unit_price: costo / Math.max(1, items[0].piezas)
		};
	}
	cases[index] = { ...caso, costo: Math.max(0, costo), items };
	saveCases(cases);
	return cases[index];
}

export async function updateInvoiceStatus(
	id: string,
	estado: InvoiceEstado
): Promise<Invoice | null> {
	if (!browser) return null;
	if (isInvoicesHydrated()) {
		return updateInvoiceStatusInDb(id, estado);
	}
	const invoices = loadInvoices();
	const index = invoices.findIndex((i) => i.id === id);
	if (index === -1) return null;
	invoices[index] = { ...invoices[index], estado };
	saveInvoices(invoices);
	return invoices[index];
}

export function ensureInvoicesForCases(): void {
	const invoices = loadInvoices();
	const cases = loadCases();
	let changed = false;

	for (const caso of cases) {
		if (invoices.some((i) => i.case_id === caso.id)) continue;
		const client = getClientById(caso.client_id) ?? {
			id: caso.client_id,
			nombre: caso.client_name,
			clinica: caso.client_clinica,
			email: '',
			telefono: '',
			fecha_registro: caso.fecha_creacion
		};
		invoices.push(createInvoiceForCase(caso, client));
		changed = true;
	}

	if (changed) saveInvoices(invoices);
}

export function ensureClientRegistry(): void {
	const clients = loadClients();
	let changed = false;

	for (const caso of loadCases()) {
		if (clients.some((c) => c.id === caso.client_id)) continue;
		clients.push({
			id: caso.client_id,
			nombre: caso.client_name,
			clinica: caso.client_clinica,
			email: '',
			telefono: '',
			fecha_registro: caso.fecha_creacion
		});
		changed = true;
	}

	if (changed) saveClients(clients);
}

/** Vincula el portal cliente a un cliente con casos (evita ID huérfano en localStorage). */
export function ensurePortalClientSession(): void {
	if (!browser) return;
	if (isSupabaseClientLinked()) return;

	seedDemoCases();
	ensureClientRegistry();

	const cases = loadCases();
	const clients = loadClients();
	if (clients.length === 0) return;

	const currentId = localStorage.getItem(CLIENT_KEY);
	if (currentId && cases.some((c) => c.client_id === currentId)) return;

	const clientWithCases = clients.find((c) => cases.some((cs) => cs.client_id === c.id));
	const target = clientWithCases ?? clients[0];

	localStorage.setItem(CLIENT_KEY, target.id);
	localStorage.setItem(
		PROFILE_KEY,
		JSON.stringify({
			id: target.id,
			nombre: target.nombre,
			clinica: target.clinica,
			email: target.email,
			telefono: target.telefono
		} satisfies ClientProfile)
	);
}

export function seedDemoCases(): void {
	if (!browser) return;
	if (isSupabaseClientLinked() || isCasesHydrated()) return;
	if (loadCases().length > 0) return;
	purgeInvalidCaseStorage();

	const clientA = upsertLabClient({
		id: uid(),
		nombre: 'Clínica Dental Sonrisa',
		clinica: 'Sonrisa Plus — Escazú',
		email: 'contacto@sonrisaplus.com',
		telefono: '+506 2222-3333'
	});

	const clientB = upsertLabClient({
		id: uid(),
		nombre: 'Odontología Integral Vega',
		clinica: 'Sede Centro',
		email: 'lab@odontovega.cr',
		telefono: '+506 2555-7788'
	});

	const clientC = upsertLabClient({
		id: uid(),
		nombre: 'Dr. Ramírez & Asociados',
		clinica: 'Consultorio Curridabat',
		email: 'casos@ramirezdental.com',
		telefono: '+506 2288-9900'
	});

	localStorage.setItem(CLIENT_KEY, clientA.id);
	localStorage.setItem(
		PROFILE_KEY,
		JSON.stringify({
			id: clientA.id,
			nombre: clientA.nombre,
			clinica: clientA.clinica,
			email: clientA.email,
			telefono: clientA.telefono
		})
	);

	function seedCase(
		client: LabClient,
		data: Omit<CreateCaseInput, 'client_id'> & { estado?: LabCaseEstado }
	) {
		const caseId = uid();
		let items: CaseItem[] = [];

		if (data.items?.length) {
			items = data.items.map((row) =>
				buildCaseItem(
					caseId,
					row.tipo_trabajo,
					row.material,
					row.color,
					row.piezas ?? row.piezas_dentales.length,
					{
						piezas_dentales: row.piezas_dentales,
						numero_pieza: row.numero_pieza,
						incluye_diseno: row.incluye_diseno,
						incluye_fresado: row.incluye_fresado,
						implantes_guia: row.implantes_guia,
						corona_sobre_implante: row.corona_sobre_implante,
						implante_marca: row.implante_marca,
						implante_plataforma: row.implante_plataforma,
						descripcion: row.descripcion
					}
				)
			);
		} else {
			items = [
				buildCaseItem(
					caseId,
					data.tipo_trabajo!,
					data.material ?? null,
					data.color ?? null,
					data.piezas ?? 1,
					{ numero_pieza: null, incluye_diseno: true, incluye_fresado: true }
				)
			];
			if (data.extra_items) {
				for (const e of data.extra_items) {
					items.push(
						buildCaseItem(caseId, e.tipo_trabajo, e.material, e.color, e.piezas, {
							numero_pieza: e.numero_pieza ?? null,
							incluye_diseno: true,
							incluye_fresado: true,
							descripcion: e.descripcion
						})
					);
				}
			}
		}
		const costo = items.reduce((s, i) => s + i.subtotal, 0);
		const first = items[0];
		const cases = loadCasesLocal();
		const nuevo: LabCase = {
			id: caseId,
			case_number: nextCaseNumber(),
			client_id: client.id,
			client_name: client.nombre,
			client_clinica: client.clinica,
			paciente_name: data.paciente_name,
			doctor_id: data.doctor_id,
			doctor_name: getDoctorName(data.doctor_id),
			tipo_trabajo: first.tipo_trabajo,
			material: first.material,
			color: first.color,
			piezas: items.reduce((s, i) => s + i.piezas, 0),
			items,
			costo,
			fecha_creacion: new Date(Date.now() - Math.random() * 30 * 86400000).toISOString(),
			fecha_entrega: data.fecha_entrega,
			estado: data.estado ?? 'pendiente',
			notas: data.notas,
			archivos: []
		};
		cases.push(nuevo);
		saveCases(cases);
		const inv = createInvoiceForCase(nuevo, client);
		if (data.estado === 'finalizado') inv.estado = 'pagada';
		const invoices = loadInvoices();
		invoices.push(inv);
		saveInvoices(invoices);
	}

	seedCase(clientA, {
		paciente_name: 'María González',
		doctor_id: 'doc-1',
		items: [
			{
				piezas_dentales: ['14'],
				tipo_trabajo: 'crown',
				material: 'zirconio',
				color: 'A2',
				incluye_diseno: true,
				incluye_fresado: true
			},
			{
				piezas_dentales: ['15'],
				tipo_trabajo: 'crown',
				material: 'zirconio',
				color: 'A2',
				incluye_diseno: true,
				incluye_fresado: false
			}
		],
		fecha_entrega: new Date(Date.now() + 7 * 86400000).toISOString(),
		notas: 'Coronas posteriores',
		estado: 'finalizado'
	});

	seedCase(clientA, {
		paciente_name: 'Carlos Ruiz',
		doctor_id: 'doc-2',
		tipo_trabajo: 'veneer',
		material: 'emax',
		color: 'BL2',
		piezas: 4,
		fecha_entrega: new Date(Date.now() + 10 * 86400000).toISOString(),
		notas: 'Sector anterior — tono bleach BL2',
		estado: 'maquillando'
	});

	seedCase(clientB, {
		paciente_name: 'Ana Solís',
		doctor_id: 'doc-3',
		fecha_entrega: new Date(Date.now() + 14 * 86400000).toISOString(),
		notas: 'Puente 13-15',
		estado: 'finalizado',
		items: [
			{
				piezas_dentales: ['13', '14', '15'],
				tipo_trabajo: 'bridge',
				material: 'zirconio',
				color: 'A3',
				incluye_diseno: true,
				incluye_fresado: true
			}
		]
	});

	seedCase(clientB, {
		paciente_name: 'Luis Méndez',
		doctor_id: 'doc-1',
		tipo_trabajo: 'crown',
		material: 'emax',
		color: 'B2',
		piezas: 1,
		fecha_entrega: new Date(Date.now() + 5 * 86400000).toISOString(),
		notas: null,
		estado: 'fresado'
	});

	seedCase(clientC, {
		paciente_name: 'Patricia Núñez',
		doctor_id: 'doc-2',
		tipo_trabajo: 'bridge',
		material: 'metal',
		color: 'A2',
		piezas: 2,
		fecha_entrega: new Date(Date.now() + 12 * 86400000).toISOString(),
		notas: 'Puente anterior',
		estado: 'finalizado'
	});

	seedCase(clientC, {
		paciente_name: 'Roberto Campos',
		doctor_id: 'doc-3',
		tipo_trabajo: 'crown',
		material: 'zirconio',
		color: 'A1',
		piezas: 3,
		fecha_entrega: new Date(Date.now() + 8 * 86400000).toISOString(),
		notas: 'Tres unidades',
		estado: 'pendiente'
	});

	ensureClientRegistry();
	ensureInvoicesForCases();
}
