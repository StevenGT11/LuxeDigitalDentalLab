import type { CaseFile, CaseFileCategory } from './types';

export const CASE_FILE_ACCEPT =
	'.stl,.ply,.obj,.pdf,.jpg,.jpeg,.png,.3mf,.dcm,application/octet-stream,application/pdf,image/*';

const ALLOWED_EXTENSIONS = new Set([
	'stl',
	'ply',
	'obj',
	'pdf',
	'jpg',
	'jpeg',
	'png',
	'3mf',
	'dcm'
]);

export const MAX_CASE_FILE_BYTES = 50 * 1024 * 1024;

export interface PendingFileReview {
	file: File;
	valid: boolean;
	duplicate: boolean;
	error: string | null;
}

export function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getFileExtension(name: string): string {
	const parts = name.split('.');
	return parts.length > 1 ? (parts.pop()?.toLowerCase() ?? '') : '';
}

export function validateCaseFile(file: File): string | null {
	const ext = getFileExtension(file.name);
	if (!ALLOWED_EXTENSIONS.has(ext)) {
		return `"${file.name}": formato no admitido. Usa STL, PLY, OBJ, PDF o imágenes.`;
	}
	if (file.size > MAX_CASE_FILE_BYTES) {
		return `"${file.name}" supera ${formatFileSize(MAX_CASE_FILE_BYTES)}.`;
	}
	if (file.size === 0) {
		return `"${file.name}" está vacío.`;
	}
	return null;
}

export function reviewIncomingFiles(
	incoming: FileList | File[],
	existing: File[] = []
): { items: PendingFileReview[]; errors: string[] } {
	const list = Array.from(incoming);
	const errors: string[] = [];
	const items: PendingFileReview[] = [];

	for (const file of list) {
		const duplicateExisting = existing.some((f) => f.name === file.name && f.size === file.size);
		const duplicateBatch = items.some(
			(item) => item.file.name === file.name && item.file.size === file.size
		);
		const duplicate = duplicateExisting || duplicateBatch;
		const validationError = validateCaseFile(file);

		if (validationError) errors.push(validationError);
		if (duplicate) errors.push(`"${file.name}" ya está en la lista.`);

		items.push({
			file,
			valid: validationError === null,
			duplicate,
			error: validationError
		});
	}

	return { items, errors: [...new Set(errors)] };
}

export function validateCaseFileBatch(files: File[]): string | null {
	for (const file of files) {
		const err = validateCaseFile(file);
		if (err) return err;
	}
	return null;
}

function readFileAsDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result ?? ''));
		reader.onerror = () => reject(new Error(`No se pudo leer "${file.name}".`));
		reader.readAsDataURL(file);
	});
}

export async function filesToCaseFiles(
	files: File[],
	category: CaseFileCategory
): Promise<CaseFile[]> {
	const result: CaseFile[] = [];
	for (const file of files) {
		const data_url = await readFileAsDataUrl(file);
		result.push({
			id: crypto.randomUUID(),
			name: file.name,
			size: file.size,
			mime_type: file.type || 'application/octet-stream',
			category,
			uploaded_at: new Date().toISOString(),
			data_url
		});
	}
	return result;
}

export function groupCaseFiles(archivos: CaseFile[] | undefined): {
	escaneos: CaseFile[];
	disenos: CaseFile[];
} {
	const list = archivos ?? [];
	return {
		escaneos: list.filter((f) => f.category === 'escaneo'),
		disenos: list.filter((f) => f.category === 'diseno')
	};
}

export async function downloadCaseFile(file: CaseFile): Promise<void> {
	if (file.data_url) {
		const link = document.createElement('a');
		link.href = file.data_url;
		link.download = file.name;
		link.click();
		return;
	}
	const { downloadCaseFileFromStorage } = await import('./case-files-db');
	await downloadCaseFileFromStorage(file);
}
