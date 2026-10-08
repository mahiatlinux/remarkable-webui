import type { DeviceInput } from './types';

export const USB_HOST = '10.11.99.1';

export function isUsbDevice(device: Pick<DeviceInput, 'host' | 'usb'>): boolean {
	return device.usb ?? device.host === USB_HOST;
}
