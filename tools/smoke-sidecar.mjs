import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = execFileSync('rustc', ['--print', 'host-tuple'], { encoding: 'utf8' }).trim();
const config = await mkdtemp(path.join(tmpdir(), 'remarkable-sidecar-'));
const token = 'sidecar-smoke-session';
const child = spawn(
	path.join(
		root,
		'src-tauri/binaries',
		`remarkable-node-${target}${process.platform === 'win32' ? '.exe' : ''}`
	),
	[path.join(root, 'src-tauri/resources/server/index.mjs')],
	{
		env: {
			...process.env,
			PORT: '0',
			NODE_ENV: 'production',
			RM_DESKTOP_TOKEN: token,
			RM_CONFIG_DIR: config
		},
		stdio: ['pipe', 'pipe', 'pipe']
	}
);
let errors = '';
child.stderr.on('data', (data) => {
	errors += data;
});
const exited = once(child, 'exit');
const timeout = setTimeout(() => child.kill(), 15000);
try {
	const lines = createInterface({ input: child.stdout });
	const result = await Promise.race([
		once(lines, 'line').then(([line]) => JSON.parse(line)),
		exited.then(() => {
			throw new Error(errors || 'Backend exited before it was ready');
		})
	]);
	const base = `http://127.0.0.1:${result.port}`;
	assert.equal((await fetch(`${base}/api/devices`)).status, 403);
	const devices = await fetch(`${base}/api/devices?token=${token}`, {
		headers: { Origin: 'tauri://localhost' }
	});
	assert.equal(devices.status, 200);
	assert.deepEqual(await devices.json(), []);
	const socket = new WebSocket(`${base.replace('http:', 'ws:')}/ws/terminal`);
	const [response] = await once(socket, 'error');
	assert.match(response.message, /403/);
	child.stdin.end();
	const [code] = await exited;
	assert.equal(code, 0, errors);
	console.log(
		'Bundled backend: startup, API authentication, WebSocket authentication and parent-exit shutdown passed.'
	);
} finally {
	clearTimeout(timeout);
	if (child.exitCode === null) {
		child.kill();
		await exited;
	}
	await rm(config, { recursive: true });
}
