import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { createServer as createTcpServer } from 'node:net';
import { once } from 'node:events';
import { isUsbDevice, USB_HOST } from '../shared/devices';

const directory = await mkdtemp(path.join(tmpdir(), 'remarkable-usb-'));
process.env.RM_CONFIG_DIR = directory;
const { addDevice, getDevice, removeDevice, updateDevice, toPublic } =
	await import('../server/devices');
const { createApp } = await import('../server/app');
const { Session, describeSshError, disconnectAll } = await import('../server/session');
const { discoverWifi } = await import('../server/discovery');
const api = createServer(createApp());
api.listen(0, '127.0.0.1');
await once(api, 'listening');
const address = api.address();
assert.ok(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}/api`;

after(async () => {
	disconnectAll();
	api.closeAllConnections();
	await new Promise<void>((resolve) => api.close(() => resolve()));
	await rm(directory, { recursive: true });
});

test('legacy USB inference and explicit USB flags survive updates and storage', async () => {
	assert.equal(isUsbDevice({ host: USB_HOST }), true);
	assert.equal(isUsbDevice({ host: '127.0.0.1' }), false);
	assert.equal(isUsbDevice({ host: USB_HOST, usb: false }), false);
	const device = addDevice({ host: '127.0.0.1', port: 2222, usb: true });
	updateDevice(device.id, { name: 'USB tunnel' });
	assert.equal(isUsbDevice(toPublic(getDevice(device.id))), true);
	const stored = JSON.parse(await readFile(path.join(directory, 'devices.json'), 'utf8'));
	assert.equal(stored.find((entry: { id: string }) => entry.id === device.id).usb, true);
	updateDevice(device.id, { usb: false });
	assert.equal(isUsbDevice(getDevice(device.id)), false);
	removeDevice(device.id);
});

test('USB input rejects non-boolean values through the API', async () => {
	const response = await fetch(`${base}/devices`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ host: 'localhost', usb: 'true' })
	});
	assert.equal(response.status, 400);
	assert.equal((await response.json()).error, 'USB must be a boolean');
});

test('USB probe uses the saved forwarded host and port, and reports a closed tunnel', async () => {
	const tcp = createTcpServer((socket) => socket.end());
	tcp.listen(0, '127.0.0.1');
	await once(tcp, 'listening');
	const endpoint = tcp.address();
	assert.ok(endpoint && typeof endpoint !== 'string');
	const device = addDevice({ host: '127.0.0.1', port: endpoint.port, usb: true });
	try {
		const reachable = await (await fetch(`${base}/usb`)).json();
		assert.deepEqual(reachable, { host: device.host, port: endpoint.port, reachable: true });
		await new Promise<void>((resolve) => tcp.close(() => resolve()));
		const closed = await (await fetch(`${base}/usb`)).json();
		assert.deepEqual(closed, { host: device.host, port: endpoint.port, reachable: false });
	} finally {
		tcp.close();
		removeDevice(device.id);
	}
});

test('USB tunnels do not run Wi-Fi recovery or replace the forwarded endpoint', async () => {
	const device = addDevice({ host: '127.0.0.1', port: 1, usb: true });
	const { rememberConnection } = await import('../server/devices');
	rememberConnection(device.id, device.host, 'known-key');
	let scans = 0;
	const session = new Session(device.id, async () => {
		scans++;
		return '127.0.0.2';
	});
	try {
		await assert.rejects(session.connect());
		assert.equal(scans, 0);
		assert.equal(session.status, 'error');
		assert.equal(getDevice(device.id).host, device.host);
		assert.equal(await discoverWifi(getDevice(device.id), new AbortController().signal), undefined);
	} finally {
		session.disconnect();
		removeDevice(device.id);
	}
});

test('macOS unreachable errors explain possible local-network permissions without misdiagnosing other errors', () => {
	const device = addDevice({ host: USB_HOST });
	try {
		const error = Object.assign(new Error('unreachable'), { code: 'EHOSTUNREACH' });
		assert.match(
			describeSshError(error, device, 'darwin'),
			/macOS may be blocking local-network access/
		);
		assert.match(describeSshError(error, device, 'darwin'), /forwarded localhost port/);
		assert.doesNotMatch(describeSshError(error, device, 'linux'), /macOS/);
		assert.doesNotMatch(describeSshError(new Error('Timed out'), device, 'darwin'), /macOS/);
		assert.match(
			describeSshError(Object.assign(error, { level: 'client-authentication' }), device, 'darwin'),
			/Authentication failed/
		);
	} finally {
		removeDevice(device.id);
	}
});
