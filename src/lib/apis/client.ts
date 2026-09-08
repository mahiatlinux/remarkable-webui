import { activeDeviceId } from '$lib/stores';
import { apiUrl, desktop } from '$lib/desktop';
import { toast } from 'sonner';

export class ApiError extends Error {
	status: number;
	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

async function parseError(res: Response): Promise<ApiError> {
	try {
		const body = (await res.json()) as { error?: string };
		return new ApiError(res.status, body.error ?? res.statusText);
	} catch {
		return new ApiError(res.status, res.statusText || `HTTP ${res.status}`);
	}
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(apiUrl(path), init);
	if (!res.ok) throw await parseError(res);
	if (res.status === 204) return undefined as T;
	const type = res.headers.get('content-type') ?? '';
	if (type.includes('application/json')) return (await res.json()) as T;
	return (await res.arrayBuffer()) as T;
}

export function json<T>(path: string, method: string, body?: unknown): Promise<T> {
	return request<T>(path, {
		method,
		headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body)
	});
}

export function devicePath(path: string): string {
	const id = activeDeviceId.get();
	if (!id) throw new ApiError(400, 'No device selected');
	return apiUrl(`/api/d/${id}${path}`);
}

export async function uploadFiles(
	path: string,
	files: File[],
	onProgress?: (fraction: number) => void
): Promise<unknown> {
	const form = new FormData();
	for (const file of files) form.append('file', file, file.name);
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open('POST', apiUrl(path));
		xhr.upload.onprogress = (event) => {
			if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total);
		};
		xhr.onload = () => {
			if (xhr.status >= 200 && xhr.status < 300) {
				resolve(xhr.responseText ? JSON.parse(xhr.responseText) : undefined);
				return;
			}
			let message = xhr.statusText;
			try {
				message = (JSON.parse(xhr.responseText) as { error: string }).error;
			} catch {
				message = xhr.statusText || `HTTP ${xhr.status}`;
			}
			reject(new ApiError(xhr.status, message));
		};
		xhr.onerror = () => reject(new ApiError(0, 'Upload failed'));
		xhr.send(form);
	});
}

function browserDownload(url: string, filename?: string) {
	const link = document.createElement('a');
	link.href = url;
	if (filename) link.download = filename;
	link.rel = 'noopener';
	document.body.appendChild(link);
	link.click();
	link.remove();
}

function safeFilename(name: string): string {
	const cleaned =
		name
			.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
			.trim()
			.replace(/[. ]+$/, '') || 'download';
	return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(cleaned) ? `_${cleaned}` : cleaned;
}

function downloadError(error: unknown) {
	toast.error(error instanceof Error ? error.message : String(error));
}

export async function downloadUrl(url: string, filename?: string): Promise<void> {
	if (!desktop) {
		browserDownload(url, filename ? safeFilename(filename) : undefined);
		return;
	}
	try {
		let response: Response;
		try {
			response = await fetch(apiUrl(url));
		} catch {
			throw new Error('Could not download the file. Check the tablet connection and try again.');
		}
		if (!response.ok) throw await parseError(response);
		const disposition = response.headers.get('content-disposition') ?? '';
		const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
		const quoted = /filename="([^"]+)"/i.exec(disposition)?.[1];
		let name = filename ?? quoted ?? 'download';
		if (!filename && encoded) {
			try {
				name = decodeURIComponent(encoded);
			} catch {
				name = quoted ?? 'download';
			}
		}
		let blob: Blob;
		try {
			blob = await response.blob();
		} catch {
			throw new Error('The download was interrupted. Keep the tablet connected and try again.');
		}
		await saveNativeFile(blob, safeFilename(name));
	} catch (error) {
		downloadError(error);
	}
}

export async function downloadBlob(blob: Blob, filename: string): Promise<void> {
	const name = safeFilename(filename);
	if (desktop) {
		try {
			await saveNativeFile(blob, name);
		} catch (error) {
			downloadError(error);
		}
		return;
	}
	const url = URL.createObjectURL(blob);
	try {
		browserDownload(url, name);
	} finally {
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}
}

async function saveNativeFile(blob: Blob, name: string) {
	const { save } = await import('@tauri-apps/plugin-dialog');
	const { writeFile } = await import('@tauri-apps/plugin-fs');
	const target = await save({ defaultPath: name, title: 'Save file' });
	if (!target) return;
	await writeFile(target, new Uint8Array(await blob.arrayBuffer()));
	toast.success(`Saved ${name}`);
}

export function openDocumentUrl(url: string, filename?: string) {
	if (desktop) downloadUrl(url, filename);
	else window.open(url, '_blank', 'noopener');
}
