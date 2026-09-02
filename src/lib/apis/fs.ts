import type { FsListing } from '$shared/types';
import { devicePath, json, request, uploadFiles } from './client';

const q = (path: string) => `?path=${encodeURIComponent(path)}`;

export function listDir(path: string): Promise<FsListing> {
	return request<FsListing>(devicePath(`/fs${q(path)}`));
}

export async function readText(path: string): Promise<string> {
	return (await request<{ text: string }>(devicePath(`/fs/text${q(path)}`))).text;
}

export function writeText(path: string, text: string) {
	return request<void>(devicePath(`/fs/text${q(path)}`), {
		method: 'PUT',
		headers: { 'Content-Type': 'text/plain' },
		body: text
	});
}

export function makeDir(path: string) {
	return json<void>(devicePath('/fs/mkdir'), 'POST', { path });
}

export function renamePath(from: string, to: string) {
	return json<void>(devicePath('/fs/rename'), 'POST', { from, to });
}

export function deletePaths(paths: string[]) {
	return json<void>(devicePath('/fs/delete'), 'POST', { paths });
}

export function uploadToDir(path: string, files: File[], onProgress?: (fraction: number) => void) {
	return uploadFiles(devicePath(`/fs/upload${q(path)}`), files, onProgress);
}

export function downloadPathUrl(path: string): string {
	return devicePath(`/fs/download${q(path)}`);
}
