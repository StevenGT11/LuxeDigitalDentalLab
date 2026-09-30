import { fail, redirect } from '@sveltejs/kit';
import { isAdminRole } from '$lib/auth/roles';
import { createSupabaseAdminClient } from '$lib/supabase/admin';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		throw redirect(303, '/login');
	}

	const { data: profile } = await supabase
		.from('profiles')
		.select('role, activo')
		.eq('id', user.id)
		.single();

	if (!profile?.activo || !isAdminRole(profile.role)) {
		throw redirect(303, '/admin');
	}

	const admin = createSupabaseAdminClient();

	// Obtener todos los archivos registrados
	const { data: files, error: filesError } = await admin
		.from('case_files')
		.select('id, case_id, category, file_name, size_bytes, storage_path, uploaded_at');

	if (filesError) {
		console.error('Error cargando case_files:', filesError);
		return {
			error: 'No se pudieron cargar los datos de almacenamiento.',
			stats: null
		};
	}

	// Obtener casos relevantes para cruzar estado y fechas
	const { data: cases, error: casesError } = await admin
		.from('cases')
		.select('id, case_number, paciente_name, client_name, estado, fecha_creacion');

	if (casesError) {
		console.error('Error cargando cases:', casesError);
		return {
			error: 'No se pudieron cargar los casos para análisis.',
			stats: null
		};
	}

	const caseMap = new Map<string, (typeof cases)[0]>();
	for (const c of cases || []) {
		caseMap.set(c.id, c);
	}

	let totalBytes = 0;
	const extMap: Record<string, { count: number; bytes: number }> = {};
	const caseUsageMap = new Map<
		string,
		{
			case_id: string;
			case_number: string;
			paciente_name: string;
			client_name: string;
			estado: string;
			fecha_creacion: string;
			file_count: number;
			total_bytes: number;
		}
	>();

	const now = Date.now();
	let finalizedTotalBytes = 0;
	let finalizedTotalFiles = 0;
	let finalizedTotalCases = new Set<string>();

	let finalized30Bytes = 0;
	let finalized30Files = 0;
	let finalized30Cases = new Set<string>();

	let finalized60Bytes = 0;
	let finalized60Files = 0;
	let finalized60Cases = new Set<string>();

	let finalized90Bytes = 0;
	let finalized90Files = 0;
	let finalized90Cases = new Set<string>();

	let activeCasesBytes = 0;
	let activeCasesFiles = 0;
	let activeCasesSet = new Set<string>();

	for (const f of files || []) {
		const bytes = Number(f.size_bytes) || 0;
		totalBytes += bytes;

		const ext = f.file_name.split('.').pop()?.toLowerCase() || 'otro';
		if (!extMap[ext]) {
			extMap[ext] = { count: 0, bytes: 0 };
		}
		extMap[ext].count++;
		extMap[ext].bytes += bytes;

		const c = caseMap.get(f.case_id);
		if (c) {
			let usage = caseUsageMap.get(c.id);
			if (!usage) {
				usage = {
					case_id: c.id,
					case_number: c.case_number,
					paciente_name: c.paciente_name,
					client_name: c.client_name,
					estado: c.estado,
					fecha_creacion: c.fecha_creacion,
					file_count: 0,
					total_bytes: 0
				};
				caseUsageMap.set(c.id, usage);
			}
			usage.file_count++;
			usage.total_bytes += bytes;

			if (c.estado === 'finalizado') {
				finalizedTotalBytes += bytes;
				finalizedTotalFiles++;
				finalizedTotalCases.add(c.id);

				const ageDays = (now - new Date(c.fecha_creacion).getTime()) / (1000 * 60 * 60 * 24);
				if (ageDays >= 30) {
					finalized30Bytes += bytes;
					finalized30Files++;
					finalized30Cases.add(c.id);
				}
				if (ageDays >= 60) {
					finalized60Bytes += bytes;
					finalized60Files++;
					finalized60Cases.add(c.id);
				}
				if (ageDays >= 90) {
					finalized90Bytes += bytes;
					finalized90Files++;
					finalized90Cases.add(c.id);
				}
			} else {
				activeCasesBytes += bytes;
				activeCasesFiles++;
				activeCasesSet.add(c.id);
			}
		}
	}

	const topCases = Array.from(caseUsageMap.values())
		.filter((u) => u.estado === 'finalizado')
		.sort((a, b) => b.total_bytes - a.total_bytes)
		.slice(0, 15);

	const extensions = Object.entries(extMap)
		.map(([ext, data]) => ({
			extension: ext,
			count: data.count,
			bytes: data.bytes,
			percent: totalBytes > 0 ? (data.bytes / totalBytes) * 100 : 0
		}))
		.sort((a, b) => b.bytes - a.bytes);

	// Cuota del plan gratuito de Supabase = 1 GB (1,073,741,824 bytes)
	const quotaBytes = 1024 * 1024 * 1024;
	const exceededBytes = Math.max(0, totalBytes - quotaBytes);
	const quotaPercent = (totalBytes / quotaBytes) * 100;

	return {
		stats: {
			totalBytes,
			totalFiles: (files || []).length,
			quotaBytes,
			exceededBytes,
			quotaPercent,
			extensions,
			topCases,
			finalized: {
				total: {
					bytes: finalizedTotalBytes,
					files: finalizedTotalFiles,
					cases: finalizedTotalCases.size
				},
				over30: {
					bytes: finalized30Bytes,
					files: finalized30Files,
					cases: finalized30Cases.size
				},
				over60: {
					bytes: finalized60Bytes,
					files: finalized60Files,
					cases: finalized60Cases.size
				},
				over90: {
					bytes: finalized90Bytes,
					files: finalized90Files,
					cases: finalized90Cases.size
				}
			},
			active: {
				bytes: activeCasesBytes,
				files: activeCasesFiles,
				cases: activeCasesSet.size
			}
		}
	};
};

export const actions: Actions = {
	purgeFinalized: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: 'Debes iniciar sesión.' });

		const { data: profile } = await supabase
			.from('profiles')
			.select('role, activo')
			.eq('id', user.id)
			.single();

		if (!profile?.activo || !isAdminRole(profile.role)) {
			return fail(403, { message: 'Solo administradores pueden realizar esta acción.' });
		}

		const form = await request.formData();
		const scope = String(form.get('scope') ?? '30'); // '30', '60', '90', 'all'
		const admin = createSupabaseAdminClient();

		let query = admin
			.from('cases')
			.select('id, case_number, fecha_creacion, case_files(id, category, storage_path, size_bytes)')
			.eq('estado', 'finalizado');

		if (scope !== 'all') {
			const days = Number(scope) || 30;
			const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
			query = query.lte('fecha_creacion', cutoffDate);
		}

		const { data: targetCases, error: queryError } = await query;
		if (queryError) {
			return fail(500, { message: 'Error al buscar casos finalizados: ' + queryError.message });
		}

		if (!targetCases || targetCases.length === 0) {
			return { success: true, message: 'No hay casos finalizados que coincidan con el criterio.' };
		}

		let totalFilesDeleted = 0;
		let totalBytesFreed = 0;
		const scanPaths: string[] = [];
		const designPaths: string[] = [];
		const fileIdsToDelete: string[] = [];

		for (const c of targetCases) {
			const cFiles = (c.case_files as Array<{
				id: string;
				category: 'escaneo' | 'diseno';
				storage_path: string;
				size_bytes: number;
			}>) || [];

			for (const f of cFiles) {
				fileIdsToDelete.push(f.id);
				totalBytesFreed += Number(f.size_bytes) || 0;
				if (f.category === 'escaneo') {
					scanPaths.push(f.storage_path);
				} else {
					designPaths.push(f.storage_path);
				}
			}
		}

		if (fileIdsToDelete.length === 0) {
			return { success: true, message: 'Los casos seleccionados no tenían archivos adjuntos.' };
		}

		// Eliminar archivos de Storage en lotes de 100
		const BATCH_SIZE = 100;
		for (let i = 0; i < scanPaths.length; i += BATCH_SIZE) {
			const batch = scanPaths.slice(i, i + BATCH_SIZE);
			await admin.storage.from('case-scans').remove(batch);
		}
		for (let i = 0; i < designPaths.length; i += BATCH_SIZE) {
			const batch = designPaths.slice(i, i + BATCH_SIZE);
			await admin.storage.from('case-designs').remove(batch);
		}

		// Eliminar registros de la base de datos
		for (let i = 0; i < fileIdsToDelete.length; i += BATCH_SIZE) {
			const batch = fileIdsToDelete.slice(i, i + BATCH_SIZE);
			const { error: delError } = await admin.from('case_files').delete().in('id', batch);
			if (delError) {
				console.error('Error al eliminar filas de case_files:', delError);
			} else {
				totalFilesDeleted += batch.length;
			}
		}

		const mbFreed = (totalBytesFreed / (1024 * 1024)).toFixed(1);
		return {
			success: true,
			message: `Se eliminaron ${totalFilesDeleted} archivos de ${targetCases.length} casos finalizados, liberando ${mbFreed} MB.`
		};
	},

	purgeCase: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { message: 'Debes iniciar sesión.' });

		const { data: profile } = await supabase
			.from('profiles')
			.select('role, activo')
			.eq('id', user.id)
			.single();

		if (!profile?.activo || !isAdminRole(profile.role)) {
			return fail(403, { message: 'Solo administradores pueden realizar esta acción.' });
		}

		const form = await request.formData();
		const caseId = String(form.get('caseId') ?? '');
		if (!caseId) return fail(400, { message: 'ID de caso inválido.' });

		const admin = createSupabaseAdminClient();
		const { data: files, error: filesError } = await admin
			.from('case_files')
			.select('id, category, storage_path, size_bytes')
			.eq('case_id', caseId);

		if (filesError || !files || files.length === 0) {
			return { success: true, message: 'El caso no tiene archivos que eliminar.' };
		}

		const scanPaths = files.filter((f) => f.category === 'escaneo').map((f) => f.storage_path);
		const designPaths = files.filter((f) => f.category === 'diseno').map((f) => f.storage_path);
		const ids = files.map((f) => f.id);
		const totalBytes = files.reduce((acc, f) => acc + Number(f.size_bytes || 0), 0);

		if (scanPaths.length > 0) {
			await admin.storage.from('case-scans').remove(scanPaths);
		}
		if (designPaths.length > 0) {
			await admin.storage.from('case-designs').remove(designPaths);
		}

		await admin.from('case_files').delete().in('id', ids);

		const mbFreed = (totalBytes / (1024 * 1024)).toFixed(1);
		return {
			success: true,
			message: `Se liberaron ${mbFreed} MB (${files.length} archivos) de este caso.`
		};
	}
};
