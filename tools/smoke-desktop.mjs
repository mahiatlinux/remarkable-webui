import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

if (process.platform !== 'win32') throw new Error('This smoke test requires Windows and WebView2.');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const executable = path.resolve(
	process.argv[2] ?? path.join(root, 'src-tauri/target/release/remarkable-webui.exe')
);
const profile = await mkdtemp(path.join(tmpdir(), 'remarkable-native-smoke-'));
const listener = createServer();
listener.listen(0, '127.0.0.1');
await once(listener, 'listening');
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
const debugUrl = `http://127.0.0.1:${port}`;
const child = spawn(executable, [], {
	windowsHide: true,
	env: {
		...process.env,
		WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1`,
		WEBVIEW2_USER_DATA_FOLDER: path.join(profile, 'webview'),
		RM_CONFIG_DIR: path.join(profile, 'config')
	},
	stdio: ['ignore', 'pipe', 'pipe']
});
let errors = '';
child.stdout.on('data', () => {});
child.stderr.on('data', (data) => {
	errors += data;
});
const exited = once(child, 'exit');
let browser;
let serviceUrl;
try {
	const deadline = Date.now() + 60000;
	while (true) {
		if (child.exitCode !== null) throw new Error(`Desktop exited before startup: ${errors}`);
		try {
			if ((await fetch(`${debugUrl}/json/version`)).ok) break;
		} catch {}
		if (Date.now() > deadline) throw new Error(`WebView2 debugging did not start: ${errors}`);
		await new Promise((resolve) => setTimeout(resolve, 200));
	}
	browser = await chromium.connectOverCDP(debugUrl);
	const context = browser.contexts()[0];
	const page = context.pages()[0] ?? (await context.waitForEvent('page', { timeout: 10000 }));
	await page.waitForURL('http://tauri.localhost/**', { timeout: 20000 });
	await page.getByRole('heading', { name: 'Connect your reMarkable' }).waitFor({ timeout: 20000 });
	const result = await page.evaluate(async () => {
		const connection = await window.__TAURI_INTERNALS__.invoke('backend_connection');
		const response = await fetch(`${connection.url}/api/devices?token=${connection.token}`);
		const unauthenticated = await fetch(`${connection.url}/api/devices`);
		return {
			url: connection.url,
			status: response.status,
			devices: await response.json(),
			unauthenticated: unauthenticated.status
		};
	});
	serviceUrl = result.url;
	assert.equal(result.status, 200);
	assert.deepEqual(result.devices, []);
	assert.equal(result.unauthenticated, 403);
	console.log(
		'Windows desktop: native startup, resource paths and authenticated WebView2 requests passed.'
	);
	await page
		.evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:window|close', { label: 'main' }))
		.catch((error) => {
			if (!error.message.includes('Target page, context or browser has been closed')) throw error;
		});
	await Promise.race([
		exited,
		new Promise((_, reject) => {
			const timer = setTimeout(() => reject(new Error('Desktop did not close')), 10000);
			timer.unref();
		})
	]);
	await assert.rejects(fetch(`${serviceUrl}/api/devices`));
	console.log('Windows desktop: native close stopped the tablet service.');
} finally {
	await browser?.close().catch(() => {});
	if (child.exitCode === null) {
		child.kill();
		await exited;
	}
	await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
