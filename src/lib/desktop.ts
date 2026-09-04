import { invoke, isTauri } from '@tauri-apps/api/core';

export const desktop = isTauri();
export const macOS = desktop && /Mac/.test(navigator.platform);

interface Connection {
	url: string;
	token: string;
}

let connection: Connection | null = null;

export async function initializeDesktop() {
	if (desktop) connection = await invoke<Connection>('backend_connection');
}

export function apiUrl(path: string): string {
	if (!connection) return path;
	const url = new URL(path, connection.url);
	if (url.origin !== connection.url) throw new Error('Invalid tablet service address');
	url.searchParams.set('token', connection.token);
	return url.toString();
}

export function websocketUrl(path: string): string {
	const url = new URL(apiUrl(path), location.href);
	url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
	return url.toString();
}

export async function openExternal(url: string) {
	if (desktop) {
		const { openUrl } = await import('@tauri-apps/plugin-opener');
		await openUrl(url);
	} else {
		window.open(url, '_blank', 'noopener');
	}
}
