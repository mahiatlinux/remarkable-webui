import type { DeviceInput, DeviceState, UsbProbe } from '$shared/types';
import { devices } from '$lib/stores';
import { json, request } from './client';

export async function refreshDevices(): Promise<DeviceState[]> {
	const list = await request<DeviceState[]>('/api/devices');
	devices.set(list);
	return list;
}

export function upsertDeviceState(state: DeviceState) {
	const current = devices.get();
	const exists = current.some((device) => device.id === state.id);
	devices.set(
		exists
			? current.map((device) => (device.id === state.id ? state : device))
			: [...current, state]
	);
}

export async function createDevice(input: Partial<DeviceInput>): Promise<DeviceState> {
	const state = await json<DeviceState>('/api/devices', 'POST', input);
	upsertDeviceState(state);
	return state;
}

export async function updateDevice(id: string, patch: Partial<DeviceInput>): Promise<DeviceState> {
	const state = await json<DeviceState>(`/api/devices/${id}`, 'PATCH', patch);
	upsertDeviceState(state);
	return state;
}

export async function deleteDevice(id: string) {
	await json<void>(`/api/devices/${id}`, 'DELETE');
	devices.set(devices.get().filter((device) => device.id !== id));
}

export async function connectDevice(id: string): Promise<DeviceState> {
	const state = await json<DeviceState>(`/api/devices/${id}/connect`, 'POST');
	upsertDeviceState(state);
	return state;
}

export async function disconnectDevice(id: string): Promise<DeviceState> {
	const state = await json<DeviceState>(`/api/devices/${id}/disconnect`, 'POST');
	upsertDeviceState(state);
	return state;
}

export function probeUsb(): Promise<UsbProbe> {
	return request<UsbProbe>('/api/usb');
}
