import { activeDeviceId } from '$lib/stores';

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
	const res = await fetch(path, init);
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
	return `/api/d/${id}${path}`;
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
		xhr.open('POST', path);
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

export function downloadUrl(url: string, filename?: string) {
	const link = document.createElement('a');
	link.href = url;
	if (filename) link.download = filename;
	link.rel = 'noopener';
	document.body.appendChild(link);
	link.click();
	link.remove();
}
