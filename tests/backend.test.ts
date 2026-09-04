import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { generateKeyPairSync } from 'node:crypto';
import { once } from 'node:events';
import ssh2 from 'ssh2';
const { Server: SshServer } = ssh2;

const directory = await mkdtemp(path.join(tmpdir(), 'remarkable-tests-'));
process.env.RM_CONFIG_DIR = directory;
const { createApp } = await import('../server/app');
const { addDevice, updateDevice } = await import('../server/devices');
const { Session, disconnectAll } = await import('../server/session');
const { renameItem, moveItems, setPinned, purgeItems, createNotebook } =
	await import('../server/xochitl');
const token = 'test-desktop-session';
const server = createServer(createApp(token));
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
assert.ok(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;
after(async () => {
	disconnectAll();
	server.closeAllConnections();
	await new Promise<void>((resolve) => server.close(() => resolve()));
	await rm(directory, { recursive: true });
});

test('desktop API rejects missing tokens and untrusted origins', async () => {
	assert.equal((await fetch(`${base}/api/devices`)).status, 403);
	assert.equal((await fetch(`${base}/api/devices?token=incorrect`)).status, 403);
	assert.equal(
		(
			await fetch(`${base}/api/devices?token=${token}`, {
				headers: { Origin: 'https://example.com' }
			})
		).status,
		403
	);
	const response = await fetch(`${base}/api/devices?token=${token}`, {
		headers: { Origin: 'http://tauri.localhost' }
	});
	assert.equal(response.status, 200);
	assert.equal(response.headers.get('access-control-allow-origin'), 'http://tauri.localhost');
});

test('desktop preflight permits app requests and rejects foreign origins', async () => {
	const response = await fetch(`${base}/api/devices`, {
		method: 'OPTIONS',
		headers: { Origin: 'tauri://localhost', 'Access-Control-Request-Method': 'POST' }
	});
	assert.equal(response.status, 204);
	assert.match(response.headers.get('access-control-allow-methods') ?? '', /POST/);
	assert.equal(
		(
			await fetch(`${base}/api/devices`, {
				method: 'OPTIONS',
				headers: { Origin: 'https://example.com' }
			})
		).status,
		403
	);
});

test('feature routers retain device ids and report validation errors', async () => {
	for (const endpoint of ['library', 'fs?path=/', 'system', 'templates']) {
		const separator = endpoint.includes('?') ? '&' : '?';
		const response = await fetch(`${base}/api/d/missing/${endpoint}${separator}token=${token}`);
		assert.equal(response.status, 404, endpoint);
		assert.deepEqual(await response.json(), { error: 'Unknown device' });
	}
	const response = await fetch(`${base}/api/devices?token=${token}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: '{}'
	});
	assert.equal(response.status, 400);
	assert.deepEqual(await response.json(), { error: 'Host is required' });
});

const id = '11111111-1111-4111-8111-111111111111';
const folder = '22222222-2222-4222-8222-222222222222';

function tablet() {
	const files = new Map<string, string>([
		[
			`${id}.metadata`,
			JSON.stringify({ visibleName: 'Original', parent: '', pinned: false, version: 7 })
		]
	]);
	let restarts = 0;
	const commands: string[] = [];
	const session = {
		machine: 'reMarkable 2',
		readFile: async (name: string) => Buffer.from(files.get(path.posix.basename(name)) ?? ''),
		writeFile: async (name: string, data: string) => {
			files.set(path.posix.basename(name), data);
		},
		scheduleRestart: () => {
			restarts++;
		},
		exec: async (command: string) => {
			commands.push(command);
			return { stdout: Buffer.alloc(0), stderr: '', code: 0 };
		}
	} as unknown as InstanceType<typeof Session>;
	return { session, files, commands, restarts: () => restarts };
}

test('rename, move and pin preserve metadata and schedule tablet refresh', async () => {
	const device = tablet();
	await renameItem(device.session, id, 'Meeting notes');
	await moveItems(device.session, [id], folder);
	await setPinned(device.session, id, true);
	const metadata = JSON.parse(device.files.get(`${id}.metadata`)!);
	assert.equal(metadata.visibleName, 'Meeting notes');
	assert.equal(metadata.parent, folder);
	assert.equal(metadata.pinned, true);
	assert.equal(metadata.version, 7);
	assert.equal(metadata.synced, false);
	assert.equal(metadata.metadatamodified, true);
	assert.equal(device.restarts(), 3);
});

test('invalid document ids cannot write metadata or form deletion commands', async () => {
	const device = tablet();
	await assert.rejects(renameItem(device.session, '../outside', 'name'), /Invalid document id/);
	await assert.rejects(moveItems(device.session, [id], '/home/root'), /Invalid document id/);
	await assert.rejects(purgeItems(device.session, [id, '; reboot']), /Invalid document id/);
	assert.equal(device.commands.length, 0);
	assert.equal(device.restarts(), 0);
});

test('failed metadata writes do not schedule a restart', async () => {
	const device = tablet();
	device.session.writeFile = async () => {
		throw new Error('Disk full');
	};
	await assert.rejects(renameItem(device.session, id, 'Changed'), /Disk full/);
	assert.equal(device.restarts(), 0);
});

test('new notebooks include a page, template and orientation', async () => {
	const device = tablet();
	const notebook = await createNotebook(device.session, 'Sketches', folder, 'Blank', true);
	const content = JSON.parse(device.files.get(`${notebook}.content`)!);
	assert.equal(content.orientation, 'landscape');
	assert.equal(content.cPages.pages.length, 1);
	assert.equal(content.cPages.pages[0].template.value, 'Blank');
	assert.equal(JSON.parse(device.files.get(`${notebook}.metadata`)!).parent, folder);
});

test('SSH authentication failure can recover on the same session', async () => {
	const { privateKey } = generateKeyPairSync('rsa', {
		modulusLength: 2048,
		privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
		publicKeyEncoding: { type: 'pkcs1', format: 'pem' }
	});
	const ssh = new SshServer({ hostKeys: [privateKey] }, (client) => {
		client.on('error', () => {});
		client.on('authentication', (context) => {
			if (context.method === 'password' && context.password === 'correct') context.accept();
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
	ssh.listen(0, '127.0.0.1');
	await once(ssh, 'listening');
	const port = ssh.address().port;
	const saved = addDevice({ host: '127.0.0.1', port, password: 'wrong' });
	const session = new Session(saved.id);
	try {
		await assert.rejects(session.connect(), /Authentication failed/);
		assert.equal(session.status, 'error');
		updateDevice(saved.id, { password: 'correct' });
		await session.connect();
		assert.equal(session.status, 'connected');
		assert.equal(session.machine, 'reMarkable 2');
		session.disconnect();
		assert.equal(session.status, 'disconnected');
	} finally {
		session.disconnect();
		await new Promise<void>((resolve) => ssh.close(() => resolve()));
	}
});
