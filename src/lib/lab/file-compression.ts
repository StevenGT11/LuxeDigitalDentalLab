import { browser } from '$app/environment';
import { getFileExtension } from './attachments';

const MESH_EXTENSIONS = new Set(['stl', 'ply', 'obj']);
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);

export function isMeshFile(filename: string): boolean {
	const ext = getFileExtension(filename);
	return MESH_EXTENSIONS.has(ext);
}

export function isImageFile(filename: string): boolean {
	const ext = getFileExtension(filename);
	return IMAGE_EXTENSIONS.has(ext);
}

/**
 * Comprime una imagen (JPG/PNG) en el navegador reduciendo resolución a max 1920px
 * y convirtiendo a formato WebP/JPEG optimizado con calidad controlada.
 */
export async function compressImage(
	file: File,
	maxDimension = 1920,
	quality = 0.82
): Promise<File> {
	if (!browser || typeof document === 'undefined') return file;

	// Si pesa menos de 300 KB ya es muy liviana, no recomprimir
	if (file.size <= 300 * 1024) return file;

	try {
		const bitmap = await createImageBitmap(file);
		let { width, height } = bitmap;

		if (width > maxDimension || height > maxDimension) {
			if (width > height) {
				height = Math.round((height * maxDimension) / width);
				width = maxDimension;
			} else {
				width = Math.round((width * maxDimension) / height);
				height = maxDimension;
			}
		}

		let canvas: HTMLCanvasElement | OffscreenCanvas;
		let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

		if (typeof OffscreenCanvas !== 'undefined') {
			canvas = new OffscreenCanvas(width, height);
			ctx = canvas.getContext('2d');
		} else {
			canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			ctx = canvas.getContext('2d');
		}

		if (!ctx) {
			bitmap.close?.();
			return file;
		}

		ctx.drawImage(bitmap, 0, 0, width, height);
		bitmap.close?.();

		let blob: Blob | null = null;
		if ('convertToBlob' in canvas) {
			// OffscreenCanvas
			try {
				blob = await (canvas as OffscreenCanvas).convertToBlob({
					type: 'image/webp',
					quality
				});
			} catch {
				blob = await (canvas as OffscreenCanvas).convertToBlob({
					type: 'image/jpeg',
					quality
				});
			}
		} else {
			// HTMLCanvasElement
			const htmlCanvas = canvas as HTMLCanvasElement;
			blob = await new Promise<Blob | null>((resolve) => {
				htmlCanvas.toBlob(
					(b) => {
						if (b) resolve(b);
						else htmlCanvas.toBlob(resolve, 'image/jpeg', quality);
					},
					'image/webp',
					quality
				);
			});
		}

		if (!blob || blob.size >= file.size) {
			return file;
		}

		const ext = blob.type === 'image/webp' ? '.webp' : '.jpg';
		const baseName = file.name.replace(/\.[^/.]+$/, '');
		return new File([blob], `${baseName}${ext}`, { type: blob.type });
	} catch (err) {
		console.warn('No se pudo comprimir la imagen en el cliente, usando original:', err);
		return file;
	}
}

export interface MeshCompressionResult {
	file: File | Blob;
	isCompressed: boolean;
	originalSize: number;
	compressedSize: number;
}

/**
 * Comprime archivos de malla 3D (STL, PLY, OBJ) usando la API nativa de streaming
 * CompressionStream('gzip') del navegador.
 * Ahorra típicamente entre 45% y 75% del almacenamiento sin alterar los datos originales.
 */
export async function compressMeshFile(file: File): Promise<MeshCompressionResult> {
	if (!isMeshFile(file.name)) {
		return {
			file,
			isCompressed: false,
			originalSize: file.size,
			compressedSize: file.size
		};
	}

	if (!browser || typeof CompressionStream === 'undefined') {
		return {
			file,
			isCompressed: false,
			originalSize: file.size,
			compressedSize: file.size
		};
	}

	try {
		const stream = file.stream().pipeThrough(new CompressionStream('gzip'));
		const compressedBlob = await new Response(stream).blob();

		// Solo usar si realmente redujo el tamaño
		if (compressedBlob.size < file.size) {
			return {
				file: compressedBlob,
				isCompressed: true,
				originalSize: file.size,
				compressedSize: compressedBlob.size
			};
		}

		return {
			file,
			isCompressed: false,
			originalSize: file.size,
			compressedSize: file.size
		};
	} catch (err) {
		console.warn('Fallo al comprimir malla 3D, usando original:', err);
		return {
			file,
			isCompressed: false,
			originalSize: file.size,
			compressedSize: file.size
		};
	}
}
