import { isIPv4 } from 'node:net';
import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os';
import { Client } from 'ssh2';
import { probeTcp, USB_HOST, type StoredDevice } from './devices';

function ipv4(address: string): number {
	return address.split('.').reduce((value, octet) => (value * 256 + Number(octet)) >>> 0, 0);
}

function privateAddress(address: string): boolean {
	if (!isIPv4(address)) return false;
	const [a, b] = address.split('.').map(Number);
	return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export function wifiCandidates(
	host: string,
	interfaces: Record<string, NetworkInterfaceInfo[] | undefined> = networkInterfaces()
): string[] {
	const result = new Set<string>();
	const ownAddresses = new Set(
		Object.values(interfaces)
			.flatMap((entries) => entries ?? [])
			.map((entry) => entry.address)
	);
	const previous = isIPv4(host) ? ipv4(host) : 0;
	for (const entry of Object.values(interfaces).flatMap((entries) => entries ?? [])) {
		if (
			entry.internal ||
			entry.family !== 'IPv4' ||
			!privateAddress(entry.address) ||
			!isIPv4(entry.netmask)
		)
			continue;
		const address = ipv4(entry.address);
		const mask = ipv4(entry.netmask);
		const network = (address & mask) >>> 0;
		const broadcast = (network | ~mask) >>> 0;
		const center = privateAddress(host) && (previous & mask) >>> 0 === network ? previous : address;
		const start = Math.max(network + 1, ((center & 0xfffff800) >>> 0) + 1);
		const end = Math.min(broadcast, start + 2046);
		for (let value = start; value < end; value++) {
			const candidate = [value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join(
				'.'
			);
			if (candidate !== host && candidate !== USB_HOST && !ownAddresses.has(candidate))
				result.add(candidate);
		}
	}
	return [...result]
		.sort((a, b) => Math.abs(ipv4(a) - previous) - Math.abs(ipv4(b) - previous))
		.slice(0, 2048);
}

async function matchesHostKey(
	host: string,
	port: number,
	hostKey: string,
	signal: AbortSignal
): Promise<boolean> {
	if (!(await probeTcp(host, port, 600, signal)) || signal.aborted) return false;
	return new Promise((resolve) => {
		const client = new Client();
		let matches = false;
		const done = () => {
			signal.removeEventListener('abort', abort);
			client.destroy();
			resolve(matches && !signal.aborted);
		};
		const abort = () => done();
		signal.addEventListener('abort', abort, { once: true });
		client.once('error', done);
		client.once('close', done);
		client.connect({
			host,
			port,
			username: 'root',
			readyTimeout: 2000,
			hostHash: 'sha256',
			hostVerifier: (key: string) => {
				matches = key === hostKey;
				return false;
			}
		});
	});
}

export async function findWifiAddress(
	candidates: string[],
	port: number,
	hostKey: string,
	signal: AbortSignal
): Promise<string | undefined> {
	signal.throwIfAborted();
	const found = new AbortController();
	const scanning = AbortSignal.any([signal, found.signal, AbortSignal.timeout(30000)]);
	let cursor = 0;
	let result: string | undefined;
	await Promise.all(
		Array.from({ length: Math.min(64, candidates.length) }, async () => {
			while (cursor < candidates.length && !scanning.aborted) {
				const host = candidates[cursor++];
				if (await matchesHostKey(host, port, hostKey, scanning)) {
					result = host;
					found.abort();
				}
			}
		})
	);
	signal.throwIfAborted();
	return result;
}

export async function discoverWifi(
	device: StoredDevice,
	signal: AbortSignal
): Promise<string | undefined> {
	if (!device.sshHostKey || device.host === USB_HOST) return;
	return findWifiAddress(wifiCandidates(device.host), device.port, device.sshHostKey, signal);
}
