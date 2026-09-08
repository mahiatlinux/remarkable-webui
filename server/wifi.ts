import { isIPv4 } from 'node:net';
import type { DeviceState } from '../shared/types';
import { probeTcp, saveWifiDevice } from './devices';
import { HttpError } from './http';
import { dropSession, getSession, type Session } from './session';

const setups = new Map<string, Promise<DeviceState>>();

export function setupWifi(session: Session): Promise<DeviceState> {
	const pending = setups.get(session.id);
	if (pending) return pending;
	const setup = configure(session).finally(() => setups.delete(session.id));
	setups.set(session.id, setup);
	return setup;
}

async function configure(session: Session): Promise<DeviceState> {
	try {
		await session.connect();
	} catch (error) {
		throw new HttpError(
			502,
			`Connect this saved device first, using USB for initial Wi-Fi setup. ${(error as Error).message}`
		);
	}
	const addresses = await session.exec(
		'for dev in /sys/class/net/*; do [ -d "$dev/wireless" ] || continue; ip -o -4 addr show dev "${dev##*/}" scope global; done'
	);
	const host = addresses.stdout
		.toString('utf8')
		.split('\n')
		.map((line) => /\binet\s+(\S+)\//.exec(line)?.[1])
		.find((address) => address && isIPv4(address) && !address.startsWith('169.254.'));
	if (!host) {
		throw new HttpError(
			400,
			'Connect the tablet to the same Wi-Fi network as this computer, then try Set up Wi-Fi again.'
		);
	}
	if (!(await probeTcp(host, session.device.port))) {
		const enabled = await session.exec(
			'if command -v rm-ssh-over-wlan >/dev/null 2>&1; then rm-ssh-over-wlan on && systemctl is-active --quiet dropbear-wlan.socket; fi',
			{ allowFailure: true }
		);
		if (enabled.code !== 0) {
			throw new HttpError(
				502,
				'Could not enable Wi-Fi SSH on the tablet. Keep USB connected and try again.'
			);
		}
		if (!(await probeTcp(host, session.device.port, 2000))) {
			throw new HttpError(
				502,
				`Cannot reach Wi-Fi SSH at ${host}:${session.device.port}. Keep the tablet awake on the same network as this computer and check that Wi-Fi SSH is enabled.`
			);
		}
	}
	await session.verifyAddress(host);
	const previousHost = session.device.host;
	const device = saveWifiDevice(session.id, host);
	if (device.id !== session.id || previousHost !== host) dropSession(device.id);
	const wifi = getSession(device.id);
	await wifi.connect();
	return wifi.state();
}
