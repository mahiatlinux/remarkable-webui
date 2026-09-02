import type { DocumentDetail, LibraryItem, UploadResult } from '$shared/types';
import { library, libraryError, libraryLoading } from '$lib/stores';
import { devicePath, json, request, uploadFiles } from './client';

export async function loadLibrary(): Promise<void> {
	libraryLoading.set(true);
	try {
		const items = await request<LibraryItem[]>(devicePath('/library'));
		library.set(new Map(items.map((item) => [item.id, item])));
		libraryError.set(null);
	} catch (error) {
		libraryError.set((error as Error).message);
	} finally {
		libraryLoading.set(false);
	}
}

export function getDocument(id: string): Promise<DocumentDetail> {
	return request<DocumentDetail>(devicePath(`/documents/${id}`));
}

export function getPageLines(id: string, pageId: string): Promise<ArrayBuffer> {
	return request<ArrayBuffer>(devicePath(`/documents/${id}/pages/${pageId}/lines`));
}

export function thumbnailUrl(id: string, pageId: string): string {
	return devicePath(`/documents/${id}/pages/${pageId}/thumbnail`);
}

export function documentFileUrl(id: string): string {
	return devicePath(`/documents/${id}/file`);
}

export function exportUrl(id: string, kind: 'pdf' | 'rmdoc', name: string): string {
	return devicePath(`/documents/${id}/export/${kind}?name=${encodeURIComponent(name)}`);
}

export function renameItem(id: string, name: string) {
	return json<void>(devicePath(`/documents/${id}/rename`), 'POST', { name });
}

export function pinItem(id: string, pinned: boolean) {
	return json<void>(devicePath(`/documents/${id}/pin`), 'POST', { pinned });
}

export function moveItems(ids: string[], parent: string) {
	return json<void>(devicePath('/library/move'), 'POST', { ids, parent });
}

export function trashItems(ids: string[]) {
	return json<void>(devicePath('/library/trash'), 'POST', { ids });
}

export function restoreItems(ids: string[]) {
	return json<void>(devicePath('/library/restore'), 'POST', { ids });
}

export function purgeItems(ids: string[]) {
	return json<void>(devicePath('/library/purge'), 'POST', { ids });
}

export function createFolder(name: string, parent: string) {
	return json<{ id: string }>(devicePath('/library/folder'), 'POST', { name, parent });
}

export function createNotebook(name: string, parent: string, template: string, landscape: boolean) {
	return json<{ id: string }>(devicePath('/library/notebook'), 'POST', {
		name,
		parent,
		template,
		landscape
	});
}

export function uploadDocuments(
	parent: string,
	files: File[],
	onProgress?: (fraction: number) => void
): Promise<UploadResult> {
	return uploadFiles(
		devicePath(`/library/upload?parent=${encodeURIComponent(parent)}`),
		files,
		onProgress
	) as Promise<UploadResult>;
}

export function restartXochitl() {
	return json<void>(devicePath('/xochitl/restart'), 'POST');
}
