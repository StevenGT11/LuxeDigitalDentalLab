import { createSupabaseBrowserClient } from '$lib/supabase/client';
import type { LabClient } from './types';

export interface DbDoctor {
	id: string;
	client_id: string;
	nombre: string;
	activo: boolean;
}

function mapClientRow(row: {
	id: string;
	nombre: string;
	clinica: string;
	email: string;
	telefono: string;
	fecha_registro: string;
}): LabClient {
	return {
		id: row.id,
		nombre: row.nombre,
		clinica: row.clinica,
		email: row.email,
		telefono: row.telefono,
		fecha_registro: row.fecha_registro
	};
}

export async function fetchClientById(id: string): Promise<LabClient | null> {
	const supabase = createSupabaseBrowserClient();
	const { data, error } = await supabase
		.from('clients')
		.select('id, nombre, clinica, email, telefono, fecha_registro')
		.eq('id', id)
		.eq('activo', true)
		.maybeSingle();

	if (error) throw error;
	return data ? mapClientRow(data) : null;
}

export async function syncOwnProfile(input: {
	nombre: string;
	clinica?: string;
	telefono?: string;
}): Promise<void> {
	const supabase = createSupabaseBrowserClient();
	const {
		data: { user }
	} = await supabase.auth.getUser();
	if (!user) return;

	const { error } = await supabase
		.from('profiles')
		.update({
			nombre: input.nombre,
			clinica: input.clinica ?? '',
			telefono: input.telefono ?? ''
		})
		.eq('id', user.id);

	if (error) throw error;
}

export async function createDoctorForClient(clientId: string, nombre: string): Promise<DbDoctor> {
	const supabase = createSupabaseBrowserClient();
	const trimmed = nombre.trim();
	if (!trimmed) throw new Error('El nombre del doctor es requerido');

	const { data, error } = await supabase
		.from('doctors')
		.insert({ client_id: clientId, nombre: trimmed })
		.select('id, client_id, nombre, activo')
		.single();

	if (error) throw error;
	return data;
}

export async function createDoctor(nombre: string): Promise<DbDoctor> {
	const supabase = createSupabaseBrowserClient();
	const client = await fetchOwnClient();
	if (!client) throw new Error('Completa tu perfil de clínica antes de agregar doctores');

	const trimmed = nombre.trim();
	if (!trimmed) throw new Error('El nombre del doctor es requerido');

	const { data, error } = await supabase
		.from('doctors')
		.insert({ client_id: client.id, nombre: trimmed })
		.select('id, client_id, nombre, activo')
		.single();

	if (error) throw error;
	return data;
}

export async function deactivateDoctor(doctorId: string): Promise<void> {
	const supabase = createSupabaseBrowserClient();
	const { error } = await supabase.from('doctors').update({ activo: false }).eq('id', doctorId);
	if (error) throw error;
}

export async function fetchAllClients(): Promise<LabClient[]> {
	const supabase = createSupabaseBrowserClient();
	const { data, error } = await supabase
		.from('clients')
		.select('id, nombre, clinica, email, telefono, fecha_registro')
		.eq('activo', true)
		.order('nombre');

	if (error) throw error;
	return (data ?? []).map(mapClientRow);
}

export async function fetchOwnClient(): Promise<LabClient | null> {
	const supabase = createSupabaseBrowserClient();
	const {
		data: { user }
	} = await supabase.auth.getUser();
	if (!user) return null;

	const { data, error } = await supabase
		.from('clients')
		.select('id, nombre, clinica, email, telefono, fecha_registro')
		.eq('profile_id', user.id)
		.maybeSingle();

	if (error) throw error;
	return data ? mapClientRow(data) : null;
}

export async function upsertOwnClient(input: {
	nombre: string;
	clinica: string;
	email: string;
	telefono: string;
}): Promise<LabClient> {
	const supabase = createSupabaseBrowserClient();
	const existing = await fetchOwnClient();

	if (existing) {
		const { data, error } = await supabase
			.from('clients')
			.update({
				nombre: input.nombre,
				clinica: input.clinica,
				email: input.email,
				telefono: input.telefono
			})
			.eq('id', existing.id)
			.select('id, nombre, clinica, email, telefono, fecha_registro')
			.single();

		if (error) throw error;
		return mapClientRow(data);
	}

	const {
		data: { user }
	} = await supabase.auth.getUser();
	if (!user) throw new Error('Sin sesión');

	const { data, error } = await supabase
		.from('clients')
		.insert({
			profile_id: user.id,
			nombre: input.nombre,
			clinica: input.clinica,
			email: input.email,
			telefono: input.telefono
		})
		.select('id, nombre, clinica, email, telefono, fecha_registro')
		.single();

	if (error) throw error;
	return mapClientRow(data);
}

export async function fetchDoctorsForClient(clientId: string): Promise<DbDoctor[]> {
	const supabase = createSupabaseBrowserClient();
	const { data, error } = await supabase
		.from('doctors')
		.select('id, client_id, nombre, activo')
		.eq('client_id', clientId)
		.eq('activo', true)
		.order('nombre');

	if (error) throw error;
	return data ?? [];
}

export async function fetchOwnDoctors(): Promise<DbDoctor[]> {
	const client = await fetchOwnClient();
	if (!client) return [];
	return fetchDoctorsForClient(client.id);
}
