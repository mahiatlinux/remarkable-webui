import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { connect } from 'node:net';
import type { Device, DeviceInput } from '../shared/types';
import { HttpError } from './http';

export interface StoredDevice extends DeviceInput {
	id: string;
	wifiSourceId?: string;
}

const configDir = process.env.RM_CONFIG_DIR ?? path.join(homedir(), '.config', 'remarkable-webui');
const configFile = path.join(configDir, 'devices.json');

export const USB_HOST = '10.11.99.1';

let devices: StoredDevice[] = load();

function load(): StoredDevice[] {
	try {
		return JSON.parse(readFileSync(configFile, 'utf8')) as StoredDevice[];
	} catch {
		return [];
	}
}

function save() {
	mkdirSync(configDir, { recursive: true, mode: 0o700 });
	writeFileSync(configFile, JSON.stringify(devices, null, 2), { mode: 0o600 });
}

export function toPublic(device: StoredDevice): Device {
	const { password, wifiSourceId, ...rest } = device;
	return { ...rest, hasPassword: Boolean(password) };
}

export function listDevices(): StoredDevice[] {
	return devices;
}

export function getDevice(id: string): StoredDevice {
	const device = devices.find((entry) => entry.id === id);
	if (!device) throw new HttpError(404, 'Unknown device');
	return device;
}

function normalize(input: Partial<DeviceInput>, base?: StoredDevice): DeviceInput {
	const host = (input.host ?? base?.host ?? '').trim();
	if (!host) throw new HttpError(400, 'Host is required');
	const port = Number(input.port ?? base?.port ?? 22);
	if (!Number.isInteger(port) || port < 1 || port > 65535) throw new HttpError(400, 'Invalid port');
	const password = input.password === undefined ? base?.password : input.password || undefined;
	const keyPath = input.keyPath === undefined ? base?.keyPath : input.keyPath.trim() || undefined;
	return {
		name: (input.name ?? base?.name ?? '').trim() || host,
		host,
		port,
		username: (input.username ?? base?.username ?? 'root').trim() || 'root',
		password,
		keyPath,
		autoRestart: input.autoRestart ?? base?.autoRestart ?? true
	};
}

export function addDevice(input: Partial<DeviceInput>): StoredDevice {
	const device = { id: randomUUID(), ...normalize(input) };
	devices = [...devices, device];
	save();
	return device;
}

export function updateDevice(id: string, input: Partial<DeviceInput>): StoredDevice {
	const existing = getDevice(id);
	const device = { ...existing, ...normalize(input, existing) };
	devices = devices.map((entry) => (entry.id === id ? device : entry));
	save();
	return device;
}

export function saveWifiDevice(sourceId: string, host: string): StoredDevice {
	const source = getDevice(sourceId);
	if (source.host !== USB_HOST) return updateDevice(sourceId, { host });
	const existing =
		devices.find((device) => device.wifiSourceId === sourceId) ??
		devices.find(
			(device) =>
				device.host === host && device.port === source.port && device.username === source.username
		);
	const device: StoredDevice = {
		...source,
		id: existing?.id ?? randomUUID(),
		name: existing?.name ?? `${source.name.replace(/\s+\(USB\)$/i, '')} (Wi-Fi)`,
		host,
		wifiSourceId: sourceId
	};
	devices = existing
		? devices.map((entry) => (entry.id === existing.id ? device : entry))
		: [...devices, device];
	save();
	return device;
}

export function removeDevice(id: string) {
	getDevice(id);
	devices = devices.filter((entry) => entry.id !== id);
	save();
}

export function probeTcp(host: string, port: number, timeoutMs = 800): Promise<boolean> {
	return new Promise((resolve) => {
		const socket = connect({ host, port });
		const done = (result: boolean) => {
			socket.destroy();
			resolve(result);
		};
		socket.setTimeout(timeoutMs, () => done(false));
		socket.once('connect', () => done(true));
		socket.once('error', () => done(false));
	});
}
