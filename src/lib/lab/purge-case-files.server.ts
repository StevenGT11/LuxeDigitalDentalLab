import type { SupabaseClient } from '@supabase/supabase-js';

/** Tope del plan. Por encima de esto Supabase bloquea el proyecto. */
export const STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024;
/** A partir de aquí se empiezan a borrar archivos de casos viejos. */
export const STORAGE_NEAR_BYTES = 850 * 1024 * 1024;
/** Se deja de borrar al quedar bajo este margen. */
export const STORAGE_KEEP_BYTES = 750 * 1024 * 1024;

const PAGE = 1000;
const REMOVE_BATCH = 100;

type FileRow = {
	id: string;
	case_id: string;
	category: 'escaneo' | 'diseno';
	storage_path: string;
	size_bytes: number;
	fecha_creacion: string;
	finalizado: boolean;
};

async function removePaths(admin: SupabaseClient, bucket: 'case-scans' | 'case-designs', paths: string[]) {
	for (let i = 0; i < paths.length; i += REMOVE_BATCH) {
		const batch = paths.slice(i, i + REMOVE_BATCH).filter(Boolean);
		if (batch.length === 0) continue;
		const { error } = await admin.storage.from(bucket).remove(batch);
		if (error) throw error;
	}
}

async function deleteFileRows(admin: SupabaseClient, files: FileRow[]) {
	if (files.length === 0) return;
	const scans = files.filter((file) => file.category === 'escaneo').map((file) => file.storage_path);
	const designs = files.filter((file) => file.category !== 'escaneo').map((file) => file.storage_path);
	await removePaths(admin, 'case-scans', scans);
	await removePaths(admin, 'case-designs', designs);

	const ids = files.map((file) => file.id);
	for (let i = 0; i < ids.length; i += REMOVE_BATCH) {
		const batch = ids.slice(i, i + REMOVE_BATCH);
		const { error } = await admin.from('case_files').delete().in('id', batch);
		if (error) throw error;
	}
}

function mapFileRow(row: {
	id: string;
	case_id: string;
	category: 'escaneo' | 'diseno';
	storage_path: string;
	size_bytes: number;
	cases: { fecha_creacion?: string; estado?: string } | { fecha_creacion?: string; estado?: string }[] | null;
}): FileRow {
	const caso = Array.isArray(row.cases) ? row.cases[0] : row.cases;
	return {
		id: row.id,
		case_id: row.case_id,
		category: row.category,
		storage_path: row.storage_path,
		size_bytes: Number(row.size_bytes) || 0,
		fecha_creacion: caso?.fecha_creacion ?? '',
		finalizado: caso?.estado === 'finalizado'
	};
}

async function loadFiles(admin: SupabaseClient, onlyFinalized: boolean): Promise<FileRow[]> {
	const files: FileRow[] = [];
	let from = 0;
	for (;;) {
		let query = admin
			.from('case_files')
			.select('id, case_id, category, storage_path, size_bytes, cases!inner(fecha_creacion, estado)')
			.range(from, from + PAGE - 1);
		if (onlyFinalized) query = query.eq('cases.estado', 'finalizado');
		const { data, error } = await query;
		if (error) throw error;
		const rows = data ?? [];
		for (const row of rows) files.push(mapFileRow(row));
		if (rows.length < PAGE) break;
		from += PAGE;
	}
	return files;
}

/** Borra escaneos y diseños de un caso. El caso y sus facturas siguen existiendo. */
export async function deleteCaseStorageFiles(
	admin: SupabaseClient,
	caseId: string
): Promise<{ filesDeleted: number; bytesFreed: number }> {
	const { data, error } = await admin
		.from('case_files')
		.select('id, case_id, category, storage_path, size_bytes')
		.eq('case_id', caseId);
	if (error) throw error;
	const files: FileRow[] = (data ?? []).map((row) => ({
		id: row.id,
		case_id: row.case_id,
		category: row.category,
		storage_path: row.storage_path,
		size_bytes: Number(row.size_bytes) || 0,
		fecha_creacion: '',
		finalizado: true
	}));
	await deleteFileRows(admin, files);
	return {
		filesDeleted: files.length,
		bytesFreed: files.reduce((sum, file) => sum + file.size_bytes, 0)
	};
}

/**
 * Si el uso pasa de 850 MB, borra archivos de los casos finalizados más viejos
 * y, si aún no basta, de los casos más viejos que sigan ocupando espacio,
 * hasta quedar en 750 MB.
 */
export async function purgeOldestCaseFiles(
	admin: SupabaseClient,
	nearBytes = STORAGE_NEAR_BYTES,
	keepBytes = STORAGE_KEEP_BYTES
): Promise<{
	filesDeleted: number;
	bytesFreed: number;
	casesTouched: number;
	bytesBefore: number;
	skipped: boolean;
}> {
	const files = await loadFiles(admin, false);
	const bytesBefore = files.reduce((sum, file) => sum + file.size_bytes, 0);
	if (bytesBefore < nearBytes) {
		return { filesDeleted: 0, bytesFreed: 0, casesTouched: 0, bytesBefore, skipped: true };
	}

	const ordered = [...files].sort((a, b) => {
		if (a.finalizado !== b.finalizado) return a.finalizado ? -1 : 1;
		return a.fecha_creacion.localeCompare(b.fecha_creacion) || a.id.localeCompare(b.id);
	});

	let excess = bytesBefore - keepBytes;
	const doomed: FileRow[] = [];
	for (const file of ordered) {
		if (excess <= 0) break;
		doomed.push(file);
		excess -= file.size_bytes;
	}

	await deleteFileRows(admin, doomed);
	return {
		filesDeleted: doomed.length,
		bytesFreed: doomed.reduce((sum, file) => sum + file.size_bytes, 0),
		casesTouched: new Set(doomed.map((file) => file.case_id)).size,
		bytesBefore,
		skipped: doomed.length === 0
	};
}

/** Red de seguridad: quita archivos que hayan quedado en casos ya finalizados. */
export async function sweepFinalizedCaseFiles(admin: SupabaseClient): Promise<{
	filesDeleted: number;
	bytesFreed: number;
	casesTouched: number;
}> {
	const files = await loadFiles(admin, true);
	await deleteFileRows(admin, files);
	return {
		filesDeleted: files.length,
		bytesFreed: files.reduce((sum, file) => sum + file.size_bytes, 0),
		casesTouched: new Set(files.map((file) => file.case_id)).size
	};
}
