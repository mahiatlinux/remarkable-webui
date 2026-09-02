import type { ServerEvent } from '$shared/types';
import { activeDeviceId, devices } from '$lib/stores';
import { upsertDeviceState } from './devices';
import { loadLibrary } from './library';

export function connectEvents(): () => void {
	const source = new EventSource('/api/events');
	source.onmessage = (message) => {
		const event = JSON.parse(message.data) as ServerEvent;
		if (event.type === 'device') {
			upsertDeviceState(event.device);
		} else if (event.type === 'library') {
			if (event.deviceId === activeDeviceId.get()) void loadLibrary();
		} else {
			devices.set(
				devices
					.get()
					.map((device) =>
						device.id === event.deviceId ? { ...device, pendingRestart: event.pending } : device
					)
			);
		}
	};
	return () => source.close();
}
