import type {
	SystemAction,
	SystemInfo,
	TemplateFile,
	TemplateInfo,
	TemplateInput
} from '$shared/types';
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

export function templateSourceUrl(template: TemplateInfo): string {
	return template.id
		? devicePath(`/templates/custom/${encodeURIComponent(template.id)}`)
		: templateFileUrl(template.filename, 'template');
}

const templateDocuments = new Map<string, Promise<TemplateDocument>>();

export function getTemplateDocument(url: string): Promise<TemplateDocument> {
	let pending = templateDocuments.get(url);
	if (!pending) {
		pending = request<TemplateDocument>(url);
		pending.catch(() => templateDocuments.delete(url));
		templateDocuments.set(url, pending);
	}
	return pending;
}

export function forgetTemplateDocument(url: string) {
	templateDocuments.delete(url);
}

export function addTemplate(input: TemplateInput): Promise<TemplateInfo> {
	return json<TemplateInfo>(devicePath('/templates'), 'POST', input);
}

export function updateTemplate(id: string, source: string) {
	return json<void>(devicePath(`/templates/custom/${encodeURIComponent(id)}`), 'PUT', { source });
}

export function deleteTemplate(id: string) {
	return json<void>(devicePath(`/templates/custom/${encodeURIComponent(id)}`), 'DELETE');
}
