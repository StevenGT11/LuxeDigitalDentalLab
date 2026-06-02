import { createSupabaseBrowserClient } from '$lib/supabase/client';
import { validateCaseFile } from './attachments';
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

	const supabase = createSupabaseBrowserClient();
	const fileId = crypto.randomUUID();
	const storage_path = `${caseId}/${fileId}_${sanitizeFileName(file.name)}`;
	const bucket = bucketFor(category);

	const { error: uploadError } = await supabase.storage.from(bucket).upload(storage_path, file, {
		cacheControl: '3600',
		upsert: false
	});
	if (uploadError) throw uploadError;

	const { data, error: dbError } = await supabase
		.from('case_files')
		.insert({
			id: fileId,
			case_id: caseId,
			category,
			file_name: file.name,
			storage_path,
			mime_type: file.type || 'application/octet-stream',
			size_bytes: file.size
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
	const link = document.createElement('a');
	link.href = url;
	link.download = file.name;
	link.target = '_blank';
	link.rel = 'noopener';
	link.click();
}
