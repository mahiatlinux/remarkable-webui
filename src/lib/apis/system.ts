import type { SystemAction, SystemInfo, TemplateFile, TemplateInfo } from '$shared/types';
import type { TemplateDocument } from '$lib/templates/render';
import { devicePath, json, request } from './client';

export function getSystemInfo(): Promise<SystemInfo> {
	return request<SystemInfo>(devicePath('/system'));
}

export function runSystemAction(action: SystemAction) {
	return json<void>(devicePath(`/system/${action}`), 'POST');
}

export function getWebInterfaceStatus(): Promise<{ reachable: boolean }> {
	return request<{ reachable: boolean }>(devicePath('/webui/status'));
}

export function getTemplates(): Promise<TemplateInfo[]> {
	return request<TemplateInfo[]>(devicePath('/templates'));
}

export function templateFileUrl(filename: string, ext: TemplateFile): string {
	return devicePath(`/templates/file/${encodeURIComponent(`${filename}.${ext}`)}`);
}

const templateDocuments = new Map<string, Promise<TemplateDocument>>();

export function getTemplateDocument(filename: string): Promise<TemplateDocument> {
	const key = templateFileUrl(filename, 'template');
	let pending = templateDocuments.get(key);
	if (!pending) {
		pending = request<TemplateDocument>(key);
		pending.catch(() => templateDocuments.delete(key));
		templateDocuments.set(key, pending);
	}
	return pending;
}
