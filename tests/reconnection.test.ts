import assert from 'node:assert/strict';
import { after, test, type TestContext } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir, type NetworkInterfaceInfo } from 'node:os';
import path from 'node:path';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import ssh2, { type Connection } from 'ssh2';

const directory = await mkdtemp(path.join(tmpdir(), 'remarkable-reconnection-'));
process.env.RM_CONFIG_DIR = directory;
const { addDevice, getDevice, listDevices, toPublic, updateDevice } =
	await import('../server/devices');
const { Session } = await import('../server/session');
const { wifiCandidates, findWifiAddress } = await import('../server/discovery');

function keyPair() {
	return generateKeyPairSync('rsa', {
		modulusLength: 2048,
		privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
		publicKeyEncoding: { type: 'pkcs1', format: 'pem' }
	}).privateKey;
}

const key = keyPair();
const otherKey = keyPair();
const parsed = ssh2.utils.parseKey(key);
assert.ok(!(parsed instanceof Error));
const fingerprint = createHash('sha256').update(parsed.getPublicSSH()).digest('hex');

after(() => rm(directory, { recursive: true }));

async function tablet(
	t: TestContext,
	host = '127.0.0.1',
	port = 0,
	hostKey = key,
	password = 'saved'
) {
	const clients = new Set<Connection>();
	const authentications: string[] = [];
	const server = new ssh2.Server({ hostKeys: [hostKey] }, (client) => {
		clients.add(client);
		client.on('error', () => {});
		client.on('close', () => clients.delete(client));
		client.on('authentication', (context) => {
			authentications.push(context.method);
			if (context.method === 'password' && context.password === password) context.accept();
			else context.reject();
		});
		client.on('ready', () =>
			client.on('session', (accept) => {
				accept().on('exec', (accept) => {
					const stream = accept();
					stream.write('reMarkable 2\nREMARKABLE_RELEASE_VERSION="3.17.0"\n');
					stream.exit(0);
					stream.end();
				});
			})
		);
	});
	const close = async () => {
		for (const client of clients) client.end();
		await new Promise<void>((resolve) => server.close(() => resolve()));
	};
	t.after(close);
	server.listen(port, host);
	await once(server, 'listening');
	return { port: server.address().port, close, authentications };
}

async function waitFor(predicate: () => boolean) {
	const end = Date.now() + 8000;
	while (!predicate()) {
		if (Date.now() > end) assert.fail('Timed out waiting for connection state');
		await delay(20);
	}
}

function sessionFor(t: TestContext, id: string, candidates = ['127.0.0.3', '127.0.0.2']) {
	const session = new Session(id, (device, signal) =>
		findWifiAddress(candidates, device.port, device.sshHostKey!, signal)
	);
	t.after(() => session.disconnect());
	return session;
}

test('successful authentication persists the tablet identity and keeps it out of public device data', async (t) => {
	const source = await tablet(t);
	const device = addDevice({ host: '127.0.0.1', port: source.port, password: 'wrong' });
	const session = sessionFor(t, device.id);
	await assert.rejects(session.connect(), /Authentication failed/);
	assert.equal(getDevice(device.id).sshHostKey, undefined);
	updateDevice(device.id, { password: 'saved' });
	await session.connect();
	assert.equal(getDevice(device.id).sshHostKey, fingerprint);
	assert.equal('sshHostKey' in toPublic(getDevice(device.id)), false);
	assert.equal('sshHostKey' in session.state(), false);
	const persisted = JSON.parse(await readFile(path.join(directory, 'devices.json'), 'utf8'));
	assert.equal(
		persisted.find((entry: { id: string }) => entry.id === device.id).sshHostKey,
		fingerprint
	);
});

test('a saved tablet moves to a new IP without another profile or credentials sent to other SSH servers', async (t) => {
	const source = await tablet(t);
	const device = addDevice({
		name: 'My tablet',
		host: '127.0.0.1',
		port: source.port,
		password: 'saved'
	});
	const session = sessionFor(t, device.id);
	await session.connect();
	session.disconnect();
	await source.close();
	const replacement = await tablet(t, '127.0.0.1', source.port, otherKey);
	const stranger = await tablet(t, '127.0.0.3', source.port, otherKey);
	await tablet(t, '127.0.0.2', source.port);
	const count = listDevices().length;
	await session.connect();
	assert.equal(session.status, 'connected');
	assert.equal(getDevice(device.id).host, '127.0.0.2');
	assert.equal(getDevice(device.id).name, 'My tablet');
	assert.equal(getDevice(device.id).sshHostKey, fingerprint);
	assert.equal(listDevices().length, count);
	assert.deepEqual(replacement.authentications, []);
	assert.deepEqual(stranger.authentications, []);
});

test('an unexpected Wi-Fi loss automatically reconnects after the tablet returns at another IP', async (t) => {
	const source = await tablet(t);
	const device = addDevice({ host: '127.0.0.1', port: source.port, password: 'saved' });
	let discoveries = 0;
	const session = new Session(device.id, (device, signal) => {
		discoveries++;
		return discoveries === 1
			? Promise.resolve(undefined)
			: findWifiAddress(['127.0.0.2'], device.port, device.sshHostKey!, signal);
	});
	t.after(() => session.disconnect());
	await session.connect();
	await source.close();
	await waitFor(() => session.status === 'connecting');
	await waitFor(() => discoveries === 1);
	await tablet(t, '127.0.0.2', source.port);
	await waitFor(() => session.status === 'connected');
	assert.equal(getDevice(device.id).host, '127.0.0.2');
	assert.equal(session.error, undefined);
});

test('disconnect stops a scheduled Wi-Fi retry', async (t) => {
	const source = await tablet(t);
	const device = addDevice({ host: '127.0.0.1', port: source.port, password: 'saved' });
	const session = sessionFor(t, device.id);
	await session.connect();
	await source.close();
	await waitFor(() => session.status === 'connecting');
	session.disconnect();
	const returned = await tablet(t, '127.0.0.2', source.port);
	await delay(2200);
	assert.equal(session.status, 'disconnected');
	assert.equal(getDevice(device.id).host, '127.0.0.1');
	assert.deepEqual(returned.authentications, []);
});

test('disconnect cancels discovery and a late result cannot change the saved address or reconnect', async (t) => {
	const source = await tablet(t);
	const device = addDevice({ host: '127.0.0.1', port: source.port, password: 'saved' });
	let started!: () => void;
	let finish!: (host: string) => void;
	const scanning = new Promise<void>((resolve) => {
		started = resolve;
	});
	const session = new Session(device.id, async () => {
		started();
		return new Promise<string>((resolve) => {
			finish = resolve;
		});
	});
	t.after(() => session.disconnect());
	await session.connect();
	session.disconnect();
	await source.close();
	const pending = session.connect();
	await scanning;
	session.disconnect();
	finish('127.0.0.2');
	await assert.rejects(pending, /abort/i);
	assert.equal(session.status, 'disconnected');
	assert.equal(getDevice(device.id).host, '127.0.0.1');
});

test('a wrong saved password stops retries and discovery', async (t) => {
	const source = await tablet(t);
	const device = addDevice({ host: '127.0.0.1', port: source.port, password: 'saved' });
	let discoveries = 0;
	const session = new Session(device.id, async () => {
		discoveries++;
		return undefined;
	});
	t.after(() => session.disconnect());
	await session.connect();
	session.disconnect();
	updateDevice(device.id, { password: 'wrong' });
	await assert.rejects(session.connect(), /Authentication failed/);
	assert.equal(session.status, 'error');
	assert.equal(discoveries, 0);
});

test('a discovered address is only saved after the saved login succeeds there', async (t) => {
	const source = await tablet(t);
	const device = addDevice({ host: '127.0.0.1', port: source.port, password: 'saved' });
	const session = sessionFor(t, device.id);
	await session.connect();
	session.disconnect();
	await source.close();
	await tablet(t, '127.0.0.2', source.port, key, 'changed');
	await assert.rejects(session.connect(), /Authentication failed/);
	assert.equal(getDevice(device.id).host, '127.0.0.1');
	assert.equal(session.status, 'error');
});

test('network discovery handles /22 networks, deduplicates adapters and avoids public or internal interfaces', () => {
	const entry = (address: string, netmask: string, internal = false): NetworkInterfaceInfo => ({
		address,
		netmask,
		internal,
		family: 'IPv4',
		mac: '00:00:00:00:00:00',
		cidr: null
	});
	const addresses = wifiCandidates('192.168.4.172', {
		ethernet: [entry('192.168.4.156', '255.255.252.0')],
		wifi: [entry('192.168.4.155', '255.255.252.0')],
		loopback: [entry('127.0.0.1', '255.0.0.0', true)],
		public: [entry('203.0.113.1', '255.255.255.0')]
	});
	assert.equal(addresses.length, 1019);
	assert.ok(addresses.includes('192.168.5.0'));
	assert.ok(addresses.includes('192.168.7.254'));
	for (const excluded of [
		'192.168.4.0',
		'192.168.7.255',
		'192.168.4.172',
		'192.168.4.156',
		'192.168.4.155'
	])
		assert.ok(!addresses.includes(excluded));
	assert.ok(addresses.every((address) => address.startsWith('192.168.')));
	assert.equal(new Set(addresses).size, addresses.length);
});

test('large subnets have a bounded discovery budget and cancellation stops network work', async () => {
	const addresses = wifiCandidates('10.1.2.3', {
		lan: [
			{
				address: '10.1.2.4',
				netmask: '255.0.0.0',
				family: 'IPv4',
				internal: false,
				mac: '',
				cidr: null
			}
		]
	});
	assert.ok(addresses.length <= 2048);
	assert.ok(addresses.every((address) => address.startsWith('10.1.')));
	const abort = new AbortController();
	abort.abort();
	await assert.rejects(findWifiAddress(addresses, 22, fingerprint, abort.signal), /abort/i);
});
