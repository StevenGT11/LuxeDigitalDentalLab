import { createSupabaseBrowserClient } from '$lib/supabase/client';
import { validateCaseFile } from './attachments';
import { compressImage, compressMeshFile, isImageFile, isMeshFile } from './file-compression';
import type { CaseFile, CaseFileCategory } from './types';

function bucketFor(category: CaseFileCategory): 'case-scans' | 'case-designs' {
	return category === 'escaneo' ? 'case-scans' : 'case-designs';
}

function sanitizeFileName(name: string): string {
	return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

type DbCaseFile = {
	id: string;
	category: CaseFileCategory;
	file_name: string;
	storage_path: string;
	mime_type: string;
	size_bytes: number;
	uploaded_at: string;
};

export function mapDbCaseFile(row: DbCaseFile): CaseFile {
	return {
		id: row.id,
		name: row.file_name,
		size: Number(row.size_bytes),
		mime_type: row.mime_type,
		category: row.category,
		uploaded_at: row.uploaded_at,
		storage_path: row.storage_path
	};
}

export async function uploadCaseFilesFromInputs(
	caseId: string,
	escaneoFiles: File[],
	disenosFiles: File[]
): Promise<CaseFile[]> {
	if (escaneoFiles.length > 0 || disenosFiles.length > 0) {
		const incomingBytes = [...escaneoFiles, ...disenosFiles].reduce((sum, file) => sum + file.size, 0);
		try {
			const response = await fetch('/api/lab/storage/headroom', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ incomingBytes })
			});
			if (!response.ok) {
				console.error('[storage] No se pudo liberar espacio antes de subir', response.status);
			}
		} catch (err) {
			console.error('[storage] No se pudo liberar espacio antes de subir', err);
		}
	}
	const uploaded: CaseFile[] = [];
	for (const file of escaneoFiles) {
		const row = await uploadSingleCaseFile(caseId, file, 'escaneo');
		if (row) uploaded.push(row);
	}
	for (const file of disenosFiles) {
		const row = await uploadSingleCaseFile(caseId, file, 'diseno');
		if (row) uploaded.push(row);
	}
	return uploaded;
}

async function uploadSingleCaseFile(
	caseId: string,
	file: File,
	category: CaseFileCategory
): Promise<CaseFile | null> {
	const err = validateCaseFile(file);
	if (err) throw new Error(err);

	let processedFile: File = file;
	if (isImageFile(file.name)) {
		processedFile = await compressImage(file);
	}

	let fileToUpload: File | Blob = processedFile;
	const fileId = crypto.randomUUID();
	let storage_path = `${caseId}/${fileId}_${sanitizeFileName(processedFile.name)}`;
	let sizeBytes = processedFile.size;
	let mimeType = processedFile.type || 'application/octet-stream';

	if (isMeshFile(processedFile.name)) {
		const meshResult = await compressMeshFile(processedFile);
		if (meshResult.isCompressed) {
			fileToUpload = meshResult.file;
			storage_path = `${caseId}/${fileId}_${sanitizeFileName(processedFile.name)}.gz`;
			sizeBytes = meshResult.compressedSize;
			mimeType = 'application/octet-stream';
		}
	}

	const supabase = createSupabaseBrowserClient();
	const bucket = bucketFor(category);

	const { error: uploadError } = await supabase.storage.from(bucket).upload(storage_path, fileToUpload, {
		cacheControl: '3600',
		upsert: false,
		contentType: mimeType
	});
	if (uploadError) throw uploadError;

	const { data, error: dbError } = await supabase
		.from('case_files')
		.insert({
			id: fileId,
			case_id: caseId,
			category,
			file_name: processedFile.name,
			storage_path,
			mime_type: mimeType,
			size_bytes: sizeBytes
		})
		.select('id, category, file_name, storage_path, mime_type, size_bytes, uploaded_at')
		.single();

	if (dbError) {
		await supabase.storage.from(bucket).remove([storage_path]);
		throw dbError;
	}

	return mapDbCaseFile(data as DbCaseFile);
}

export async function getSignedUrlForCaseFile(file: CaseFile): Promise<string | null> {
	if (file.data_url) return file.data_url;
	if (!file.storage_path) return null;

	const supabase = createSupabaseBrowserClient();
	const { data, error } = await supabase.storage
		.from(bucketFor(file.category))
		.createSignedUrl(file.storage_path, 3600);

	if (error) throw error;
	return data.signedUrl;
}

export async function downloadCaseFileFromStorage(file: CaseFile): Promise<void> {
	const url = await getSignedUrlForCaseFile(file);
	if (!url) return;

	const isGzipped = file.storage_path?.endsWith('.gz');
	if (!isGzipped) {
		const link = document.createElement('a');
		link.href = url;
		link.download = file.name;
		link.target = '_blank';
		link.rel = 'noopener';
		link.click();
		return;
	}

	try {
		const response = await fetch(url);
		if (!response.ok || !response.body) {
			throw new Error('No se pudo descargar el archivo.');
		}

		let blob: Blob;
		if (typeof DecompressionStream !== 'undefined') {
			const decompressedStream = response.body.pipeThrough(new DecompressionStream('gzip'));
			blob = await new Response(decompressedStream).blob();
		} else {
			blob = await response.blob();
		}

		const blobUrl = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = blobUrl;
		link.download = file.name;
		link.click();
		setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
	} catch (err) {
		console.warn('Error al descomprimir en el navegador, descargando directo:', err);
		const link = document.createElement('a');
		link.href = url;
		link.download = file.name;
		link.target = '_blank';
		link.rel = 'noopener';
		link.click();
	}
}

export async function deleteCaseFileFromDb(file: CaseFile): Promise<void> {
	if (!file.id) return;
	const supabase = createSupabaseBrowserClient();
	if (file.storage_path) {
		const bucket = bucketFor(file.category);
		await supabase.storage.from(bucket).remove([file.storage_path]);
	}
	const { error } = await supabase.from('case_files').delete().eq('id', file.id);
	if (error) throw error;
}
