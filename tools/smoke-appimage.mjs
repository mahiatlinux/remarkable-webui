import { execFile, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, readlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';

const execute = promisify(execFile);

async function optionalRead(filename, reader = readFile) {
	try {
		return await reader(filename, 'utf8');
	} catch (error) {
		if (['ENOENT', 'ESRCH', 'EACCES'].includes(error.code)) return null;
		throw error;
	}
}

async function processInfo(pid) {
	const stat = await optionalRead(`/proc/${pid}/stat`);
	if (!stat) return null;
	const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
	return { pid, parent: Number(fields[1]), state: fields[0], started: fields[19] };
}

async function descendants(pid) {
	const processes = await Promise.all(
		(await readdir('/proc'))
			.filter((name) => /^\d+$/.test(name))
			.map((name) => processInfo(Number(name)))
	);
	const tree = new Map();
	const root = processes.find((entry) => entry?.pid === pid);
	if (root) tree.set(pid, root);
	let size;
	do {
		size = tree.size;
		for (const entry of processes) {
			if (entry && tree.has(entry.parent)) tree.set(entry.pid, entry);
		}
	} while (tree.size !== size);
	return tree;
}

async function visibleWindow() {
	const options = { timeout: 3000, env: { ...process.env, LC_ALL: 'C' } };
	const { stdout } = await execute('xwininfo', ['-root', '-tree'], options);
	const windows = [...stdout.matchAll(/^\s*(0x[\da-f]+) "reMarkable WebUI"/gm)];
	for (const [, id] of windows) {
		try {
			const result = await execute('xwininfo', ['-id', id], options);
			if (/Map State:\s+IsViewable/.test(result.stdout)) return true;
		} catch (error) {
			if (error.code !== 1) throw error;
		}
	}
	return false;
}

async function backendConnection(tree, config) {
	const binaries = new Map();
	for (const entry of tree.values()) {
		const executable = await optionalRead(`/proc/${entry.pid}/exe`, readlink);
		if (executable) binaries.set(entry.pid, executable);
	}
	for (const entry of tree.values()) {
		const executable = binaries.get(entry.pid);
		if (!executable?.endsWith('/usr/bin/remarkable-node')) continue;
		if (binaries.get(entry.parent) !== path.join(path.dirname(executable), 'remarkable-webui')) {
			throw new Error('The bundled backend was not started by the native desktop process');
		}
		const environment = await optionalRead(`/proc/${entry.pid}/environ`);
		if (!environment) continue;
		const values = new Map(
			environment.split('\0').map((item) => {
				const separator = item.indexOf('=');
				return [item.slice(0, separator), item.slice(separator + 1)];
			})
		);
		const token = values.get('RM_DESKTOP_TOKEN');
		if (!token || values.get('RM_CONFIG_DIR') !== config) {
			throw new Error('The bundled backend has no isolated authenticated desktop session');
		}
		const sockets = new Set();
		for (const fd of await readdir(`/proc/${entry.pid}/fd`)) {
			const target = await optionalRead(`/proc/${entry.pid}/fd/${fd}`, readlink);
			const match = target?.match(/^socket:\[(\d+)\]$/);
			if (match) sockets.add(match[1]);
		}
		const tcp = await optionalRead(`/proc/${entry.pid}/net/tcp`);
		for (const line of tcp?.trim().split('\n').slice(1) ?? []) {
			const fields = line.trim().split(/\s+/);
			if (fields[3] !== '0A' || !sockets.has(fields[9])) continue;
			const [address, port] = fields[1].split(':');
			if (address !== '0100007F') throw new Error('The bundled backend is not loopback-only');
			return { url: `http://127.0.0.1:${parseInt(port, 16)}`, token };
		}
	}
	return null;
}

async function checkBackend({ url, token }) {
	const unauthorized = await fetch(`${url}/api/devices`, { signal: AbortSignal.timeout(3000) });
	if (unauthorized.status !== 403)
		throw new Error('The bundled backend accepted an unauthenticated request');
	await unauthorized.arrayBuffer();
	const response = await fetch(`${url}/api/devices`, {
		headers: { Authorization: `Bearer ${token}`, Origin: 'tauri://localhost' },
		signal: AbortSignal.timeout(3000)
	});
	if (response.status !== 200) throw new Error('The bundled backend rejected its desktop session');
	const devices = await response.json();
	if (!Array.isArray(devices) || devices.length !== 0) {
		throw new Error('The bundled backend did not load an empty isolated device profile');
	}
}

async function stopDesktop(child, tracked) {
	if (!child.pid) return;
	for (const [pid, entry] of await descendants(child.pid)) tracked.set(pid, entry);
	for (const signal of ['SIGTERM', 'SIGKILL']) {
		try {
			process.kill(-child.pid, signal);
		} catch (error) {
			if (error.code !== 'ESRCH') throw error;
		}
		for (const [pid, entry] of tracked) {
			if ((await processInfo(pid))?.started !== entry.started) continue;
			try {
				process.kill(pid, signal);
			} catch (error) {
				if (error.code !== 'ESRCH') throw error;
			}
		}
		const deadline = Date.now() + (signal === 'SIGTERM' ? 3000 : 2000);
		do {
			for (const [pid, entry] of tracked) {
				const current = await processInfo(pid);
				if (!current || current.started !== entry.started || current.state === 'Z')
					tracked.delete(pid);
			}
			if (!tracked.size) return;
			await delay(100);
		} while (Date.now() < deadline);
	}
	throw new Error('Desktop processes did not stop after SIGKILL');
}

async function main() {
	if (process.platform !== 'linux') throw new Error('This smoke test requires Linux');
	if (process.argv.length !== 3) throw new Error('Usage: node tools/smoke-appimage.mjs <AppImage>');
	if (!process.env.DISPLAY || !process.env.DBUS_SESSION_BUS_ADDRESS) {
		throw new Error('Run this smoke test inside xvfb-run -a dbus-run-session');
	}
	await execute('xwininfo', ['-root'], { timeout: 3000 });
	const executable = path.resolve(process.argv[2]);
	const profile = await mkdtemp(path.join(tmpdir(), 'remarkable-appimage-smoke-'));
	const env = {
		...process.env,
		APPIMAGE_EXTRACT_AND_RUN: '1',
		GDK_BACKEND: 'x11',
		HOME: path.join(profile, 'home'),
		TMPDIR: path.join(profile, 'tmp'),
		RM_CONFIG_DIR: path.join(profile, 'devices'),
		XDG_CONFIG_HOME: path.join(profile, 'config'),
		XDG_DATA_HOME: path.join(profile, 'data'),
		XDG_CACHE_HOME: path.join(profile, 'cache'),
		XDG_STATE_HOME: path.join(profile, 'state'),
		XDG_RUNTIME_DIR: path.join(profile, 'runtime')
	};
	delete env.WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS;
	delete env.WAYLAND_DISPLAY;
	const tracked = new Map();
	let child;
	let failure;
	let stderr = '';
	const tokens = new Set();
	let interrupted;
	const interrupt = (signal) => {
		interrupted = signal;
	};
	process.once('SIGINT', interrupt);
	process.once('SIGTERM', interrupt);
	try {
		for (const name of [
			'HOME',
			'TMPDIR',
			'RM_CONFIG_DIR',
			'XDG_CONFIG_HOME',
			'XDG_DATA_HOME',
			'XDG_CACHE_HOME',
			'XDG_STATE_HOME',
			'XDG_RUNTIME_DIR'
		]) {
			await mkdir(env[name], { recursive: true, mode: 0o700 });
		}
		child = spawn(executable, [], {
			cwd: profile,
			env,
			detached: true,
			stdio: ['ignore', 'ignore', 'pipe']
		});
		child.stderr.setEncoding('utf8');
		child.stderr.on('data', (data) => {
			stderr += data;
			if (stderr.length > 8192) stderr = stderr.slice(-8192).replace(/^[^\n]*(?:\n|$)/, '');
		});
		let launchError;
		child.once('error', (error) => {
			launchError = error;
		});
		const started = Date.now();
		let windowReady = false;
		let backendReady = false;
		let readySince;
		while (Date.now() - started < 60000) {
			if (interrupted) throw new Error(`Smoke test interrupted by ${interrupted}`);
			if (launchError) throw new Error(`Desktop failed to launch: ${launchError.message}`);
			if (child.exitCode !== null || child.signalCode !== null) {
				throw new Error(`Desktop exited during startup (${child.signalCode ?? child.exitCode})`);
			}
			if (child.pid) {
				const tree = await descendants(child.pid);
				for (const [pid, entry] of tree) tracked.set(pid, entry);
				const connection = await backendConnection(tree, env.RM_CONFIG_DIR);
				if (connection) tokens.add(connection.token);
				windowReady = await visibleWindow();
				backendReady = connection !== null;
				readySince = windowReady && connection ? (readySince ?? Date.now()) : undefined;
				if (readySince && connection && Date.now() - readySince >= 12000) {
					await checkBackend(connection);
					if (child.exitCode !== null || child.signalCode !== null) {
						throw new Error('Desktop exited while checking its backend');
					}
					return;
				}
			}
			await delay(250);
		}
		throw new Error(
			`Desktop startup timed out (mapped window: ${windowReady}, bundled backend: ${backendReady})`
		);
	} catch (error) {
		for (const token of tokens) stderr = stderr.replaceAll(token, '[redacted]');
		stderr = stderr
			.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[redacted]')
			.replace(/((?:[?&]token=|RM_DESKTOP_TOKEN[=:]|Bearer\s+))[^\s"'&]+/gi, '$1[redacted]')
			.trim();
		failure = new Error([error.message, stderr].filter(Boolean).join('\n'));
	} finally {
		try {
			if (child) await stopDesktop(child, tracked);
		} catch (error) {
			failure ??= error;
		}
		try {
			await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
		} catch (error) {
			failure ??= error;
		}
		process.removeListener('SIGINT', interrupt);
		process.removeListener('SIGTERM', interrupt);
		if (failure) throw failure;
	}
}

try {
	await main();
	console.log(
		'Linux AppImage: mapped native window, 12-second startup and bundled backend authentication passed.'
	);
} catch (error) {
	console.error(`AppImage smoke failed: ${error.message}`);
	process.exitCode = 1;
}
