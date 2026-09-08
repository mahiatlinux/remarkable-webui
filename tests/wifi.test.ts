import assert from 'node:assert/strict';
import { after, test, type TestContext } from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { generateKeyPairSync } from 'node:crypto';
import { once } from 'node:events';
import ssh2, { type Connection } from 'ssh2';

const directory = await mkdtemp(path.join(tmpdir(), 'remarkable-wifi-tests-'));
process.env.RM_CONFIG_DIR = directory;
const { createApp } = await import('../server/app');
const { addDevice, getDevice, listDevices, saveWifiDevice, toPublic, updateDevice, USB_HOST } =
	await import('../server/devices');
const { disconnectAll, getSession } = await import('../server/session');

function keyPair() {
	return generateKeyPairSync('rsa', {
		modulusLength: 2048,
		privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
		publicKeyEncoding: { type: 'pkcs1', format: 'pem' }
	});
}

const hostKey = keyPair().privateKey;
const otherHostKey = keyPair().privateKey;
const clientKey = keyPair().privateKey;
const keyPath = path.join(directory, 'client-key');
await writeFile(keyPath, clientKey);
const parsedKey = ssh2.utils.parseKey(clientKey);
assert.ok(!(parsedKey instanceof Error));
const clientPublicKey = parsedKey.getPublicSSH();

const api = createServer(createApp());
api.listen(0, '127.0.0.1');
await once(api, 'listening');
const address = api.address();
assert.ok(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}/api/devices`;

after(async () => {
	disconnectAll();
	api.closeAllConnections();
	await new Promise<void>((resolve) => api.close(() => resolve()));
	await rm(directory, { recursive: true });
});

async function setup(id: string) {
	const response = await fetch(`${base}/${id}/wifi`, { method: 'POST' });
	return { status: response.status, body: await response.json() };
}

async function tablet(
	t: TestContext,
	options: {
		address?: string;
		wifiReady?: boolean;
		helperCode?: number;
		helperAvailable?: boolean;
		otherDevice?: boolean;
		wifiPassword?: string;
		useKey?: boolean;
	} = {}
) {
	const clients = new Set<Connection>();
	const commands: string[] = [];
	const wifiAuthentications: string[] = [];
	let port = 0;
	let wifiListening = false;

	async function listenWifi() {
		if (wifiListening) return;
		wifi.listen(port, '127.0.0.2');
		await once(wifi, 'listening');
		wifiListening = true;
	}

	function server(wireless: boolean) {
		return new ssh2.Server(
			{ hostKeys: [wireless && options.otherDevice ? otherHostKey : hostKey] },
			(client) => {
				clients.add(client);
				client.on('error', () => {});
				client.on('close', () => clients.delete(client));
				client.on('authentication', (context) => {
					if (wireless) wifiAuthentications.push(context.method);
					if (
						context.username === 'root' &&
						((context.method === 'password' &&
							context.password ===
								(wireless ? (options.wifiPassword ?? 'saved-password') : 'saved-password')) ||
							(options.useKey &&
								context.method === 'publickey' &&
								context.key.data.equals(clientPublicKey)))
					)
						context.accept();
					else context.reject();
				});
				client.on('ready', () =>
					client.on('session', (accept) => {
						accept().on('exec', async (accept, _reject, info) => {
							const stream = accept();
							commands.push(info.command);
							let output = 'reMarkable 2\nREMARKABLE_RELEASE_VERSION="3.17.0"\n';
							let code = 0;
							if (info.command.includes('/sys/class/net/')) {
								const ip = options.address ?? '127.0.0.2';
								output = ip ? `3: wlan0    inet ${ip}/24 brd 127.0.0.255 scope global wlan0\n` : '';
							} else if (info.command.includes('rm-ssh-over-wlan')) {
								code = options.helperCode ?? 0;
								if (code === 0 && options.helperAvailable !== false) await listenWifi();
								output = '';
							}
							stream.write(output);
							stream.exit(code);
							stream.end();
						});
					})
				);
			}
		);
	}

	const source = server(false);
	const wifi = server(true);
	t.after(async () => {
		disconnectAll();
		for (const client of clients) client.end();
		await new Promise<void>((resolve) => source.close(() => resolve()));
		if (wifiListening) await new Promise<void>((resolve) => wifi.close(() => resolve()));
	});
	source.listen(0, '127.0.0.1');
	await once(source, 'listening');
	port = source.address().port;
	if (options.wifiReady) await listenWifi();
	const device = addDevice({
		name: 'Test tablet',
		host: '127.0.0.1',
		port,
		...(options.useKey ? { keyPath } : { password: 'saved-password' })
	});
	return { device, commands, wifiAuthentications };
}

test('Wi-Fi setup enables SSH, verifies the saved login and reconnects to the discovered address', async (t) => {
	const fixture = await tablet(t);
	const result = await setup(fixture.device.id);
	assert.equal(result.status, 200, JSON.stringify(result.body));
	assert.equal(result.body.host, '127.0.0.2');
	assert.equal(result.body.status, 'connected');
	assert.equal(result.body.hasPassword, true);
	assert.equal(result.body.password, undefined);
	assert.equal(getDevice(fixture.device.id).password, 'saved-password');
	assert.equal(
		fixture.commands.filter((command) => command.includes('rm-ssh-over-wlan')).length,
		1
	);
	assert.equal(fixture.wifiAuthentications.filter((method) => method === 'password').length, 2);
});

test('Wi-Fi setup supports saved private keys and already enabled Wi-Fi SSH', async (t) => {
	const fixture = await tablet(t, { wifiReady: true, useKey: true });
	const result = await setup(fixture.device.id);
	assert.equal(result.status, 200, JSON.stringify(result.body));
	assert.equal(result.body.hasPassword, false);
	assert.equal(getDevice(fixture.device.id).keyPath, keyPath);
	assert.ok(fixture.wifiAuthentications.includes('publickey'));
	assert.equal(
		fixture.commands.some((command) => command.includes('rm-ssh-over-wlan')),
		false
	);
});

test('simultaneous setup requests share one attempt', async (t) => {
	const fixture = await tablet(t);
	const results = await Promise.all([setup(fixture.device.id), setup(fixture.device.id)]);
	assert.deepEqual(
		results.map((result) => result.status),
		[200, 200]
	);
	assert.equal(fixture.commands.filter((command) => command.includes('/sys/class/net/')).length, 1);
});

for (const address of ['', '169.254.1.2', 'invalid']) {
	test(`Wi-Fi setup with no usable address (${address || 'offline'}) preserves the saved connection`, async (t) => {
		const fixture = await tablet(t, { address });
		const result = await setup(fixture.device.id);
		assert.equal(result.status, 400);
		assert.match(result.body.error, /same Wi-Fi network/);
		assert.deepEqual(getDevice(fixture.device.id), fixture.device);
		assert.equal(getSession(fixture.device.id).status, 'connected');
		assert.equal(
			fixture.commands.some((command) => command.includes('rm-ssh-over-wlan')),
			false
		);
	});
}

test('a failed Wi-Fi enable command leaves the original connection usable', async (t) => {
	const fixture = await tablet(t, { helperCode: 1 });
	const result = await setup(fixture.device.id);
	assert.equal(result.status, 502);
	assert.match(result.body.error, /Could not enable Wi-Fi SSH/);
	assert.deepEqual(getDevice(fixture.device.id), fixture.device);
	assert.equal(getSession(fixture.device.id).status, 'connected');
});

test('an unreachable Wi-Fi service gives network guidance without saving it', async (t) => {
	const fixture = await tablet(t, { helperAvailable: false });
	const result = await setup(fixture.device.id);
	assert.equal(result.status, 502);
	assert.match(result.body.error, /same network/);
	assert.deepEqual(getDevice(fixture.device.id), fixture.device);
});

test('a different tablet at the Wi-Fi address never receives saved credentials', async (t) => {
	const fixture = await tablet(t, { wifiReady: true, otherDevice: true });
	const result = await setup(fixture.device.id);
	assert.equal(result.status, 502);
	assert.match(result.body.error, /different device/);
	assert.deepEqual(fixture.wifiAuthentications, []);
	assert.deepEqual(getDevice(fixture.device.id), fixture.device);
});

test('failed Wi-Fi authentication preserves the original connection and password', async (t) => {
	const fixture = await tablet(t, { wifiReady: true, wifiPassword: 'different' });
	const result = await setup(fixture.device.id);
	assert.equal(result.status, 502);
	assert.match(result.body.error, /Authentication failed/);
	assert.deepEqual(getDevice(fixture.device.id), fixture.device);
	assert.equal(getSession(fixture.device.id).status, 'connected');
});

test('USB setup saves one Wi-Fi profile and refreshes its address and credentials on later runs', async () => {
	const usb = addDevice({
		name: 'My tablet (USB)',
		host: USB_HOST,
		password: 'original',
		autoRestart: false
	});
	const wifi = saveWifiDevice(usb.id, '192.168.4.10');
	assert.equal(getDevice(usb.id).host, USB_HOST);
	assert.notEqual(wifi.id, usb.id);
	assert.equal(wifi.name, 'My tablet (Wi-Fi)');
	assert.equal(wifi.password, 'original');
	assert.equal(wifi.autoRestart, false);
	assert.equal('wifiSourceId' in toPublic(wifi), false);
	updateDevice(wifi.id, { name: 'My wireless tablet' });
	updateDevice(usb.id, { password: 'updated' });
	const updated = saveWifiDevice(usb.id, '192.168.4.11');
	assert.equal(updated.id, wifi.id);
	assert.equal(updated.name, 'My wireless tablet');
	assert.equal(updated.password, 'updated');
	assert.equal(updated.host, '192.168.4.11');
	assert.equal(listDevices().filter((device) => device.wifiSourceId === usb.id).length, 1);
	const persisted = JSON.parse(await readFile(path.join(directory, 'devices.json'), 'utf8'));
	assert.equal(
		persisted.find((device: { id: string }) => device.id === wifi.id).host,
		updated.host
	);
});

test('USB setup reuses a manually saved Wi-Fi connection and links later address updates to it', () => {
	const usb = addDevice({ name: 'USB tablet', host: USB_HOST, password: 'saved-password' });
	const wifi = addDevice({ name: 'My wireless tablet', host: '192.168.4.31', password: 'old' });
	const count = listDevices().length;
	const reused = saveWifiDevice(usb.id, wifi.host);
	assert.equal(reused.id, wifi.id);
	assert.equal(reused.name, wifi.name);
	assert.equal(reused.password, usb.password);
	assert.equal(reused.wifiSourceId, usb.id);
	assert.equal(listDevices().length, count);
	const updated = saveWifiDevice(usb.id, '192.168.4.32');
	assert.equal(updated.id, wifi.id);
	assert.equal(updated.host, '192.168.4.32');
	assert.equal(listDevices().length, count);
	assert.deepEqual(getDevice(usb.id), usb);
});

test('Wi-Fi setup keeps connections using a different SSH port or username separate', () => {
	const usb = addDevice({ name: 'USB tablet', host: USB_HOST });
	const otherPort = addDevice({ host: '192.168.4.33', port: 2222 });
	const otherUser = addDevice({ host: '192.168.4.33', username: 'other-user' });
	const wifi = saveWifiDevice(usb.id, '192.168.4.33');
	assert.notEqual(wifi.id, otherPort.id);
	assert.notEqual(wifi.id, otherUser.id);
	assert.deepEqual(getDevice(otherPort.id), otherPort);
	assert.deepEqual(getDevice(otherUser.id), otherUser);
});

test('Wi-Fi setup rejects an unknown saved device', async () => {
	const result = await setup('missing');
	assert.equal(result.status, 404);
	assert.equal(result.body.error, 'Unknown device');
});

test('Wi-Fi setup can retry after the saved login is corrected', async (t) => {
	const fixture = await tablet(t);
	updateDevice(fixture.device.id, { password: 'wrong' });
	const failed = await setup(fixture.device.id);
	assert.equal(failed.status, 502);
	assert.match(failed.body.error, /Connect this saved device first/);
	assert.equal(fixture.commands.length, 0);
	updateDevice(fixture.device.id, { password: 'saved-password' });
	const retried = await setup(fixture.device.id);
	assert.equal(retried.status, 200, JSON.stringify(retried.body));
});
