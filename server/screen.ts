import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ClientChannel } from 'ssh2';
import type { WebSocket } from 'ws';
import type { ScreenMeta } from '../shared/types';
import { shellQuote } from './http';
import { modelName, type Session } from './session';

interface Plan {
	file: string;
	offset: bigint;
	width: number;
	height: number;
	stride: number;
	format: 'bgra' | 'rgb565' | 'gray16' | 'gray8';
}

const HELPER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'bin');
const REMOTE_DIR = '/home/root/.cache/rm-ui';
const HEADER_SIZE = 10;
const PACKET_HEADER = 8;

function versionAtLeast(version: string | undefined, minimum: string): boolean {
	if (!version) return false;
	const a = version.split('.').map(Number);
	const b = minimum.split('.').map(Number);
	for (let i = 0; i < Math.max(a.length, b.length); i++) {
		const x = a[i] ?? 0;
		const y = b[i] ?? 0;
		if (x !== y) return x > y;
	}
	return true;
}

async function xochitlPid(session: Session): Promise<string> {
	const result = await session.exec('pidof xochitl', { allowFailure: true });
	const pid = result.stdout.toString('utf8').trim().split(/\s+/)[0];
	if (!pid) throw new Error('xochitl is not running');
	return pid;
}

interface Mapping {
	start: bigint;
	end: bigint;
	perms: string;
	path: string;
}

async function mappings(session: Session, pid: string): Promise<Mapping[]> {
	const result = await session.exec(`cat /proc/${pid}/maps`, { allowFailure: true });
	return result.stdout
		.toString('utf8')
		.split('\n')
		.filter(Boolean)
		.map((line) => {
			const [range, perms, , , , ...rest] = line.trim().split(/\s+/);
			const [start, end] = range.split('-');
			return { start: BigInt(`0x${start}`), end: BigInt(`0x${end}`), perms, path: rest.join(' ') };
		});
}

async function mapping(
	session: Session,
	pid: string,
	file: string,
	last: boolean
): Promise<[bigint, bigint]> {
	const matches = (await mappings(session, pid)).filter((entry) => entry.path === file);
	const match = last ? matches[matches.length - 1] : matches[0];
	if (!match) throw new Error(`xochitl has no ${file} mapping`);
	return [match.start, match.end];
}

async function readMemory(
	session: Session,
	pid: string,
	address: bigint,
	count: number
): Promise<Buffer> {
	const result = await session.exec(
		`dd if=/proc/${pid}/mem bs=1 skip=${address} count=${count} 2>/dev/null`,
		{ allowFailure: true }
	);
	if (result.stdout.length !== count) throw new Error('failed to read xochitl memory');
	return result.stdout;
}

async function displaySize(session: Session): Promise<[number, number] | null> {
	const result = await session.exec(
		'cat /proc/device-tree/display-info/display-width /proc/device-tree/display-info/display-height 2>/dev/null',
		{ allowFailure: true }
	);
	if (result.stdout.length !== 8) return null;
	return [result.stdout.readUInt32BE(0), result.stdout.readUInt32BE(4)];
}

async function walkArena(
	session: Session,
	pid: string,
	base: bigint,
	minimum: number
): Promise<bigint | null> {
	let offset = 0n;
	let length = 2;
	for (let i = 0; i < 16 && length - 2 < minimum; i++) {
		offset += BigInt(length - 2);
		try {
			length = (await readMemory(session, pid, base + offset + 8n, 4)).readUInt32LE(0);
		} catch {
			return null;
		}
		if (length < 2) return null;
	}
	return length - 2 >= minimum ? base + offset : null;
}

async function drmFramebuffer(
	session: Session,
	pid: string,
	width: number,
	height: number
): Promise<{ pointer: bigint; stride: number }> {
	const minimum = width * height * 4;
	const maps = await mappings(session, pid);
	for (let i = 0; i < maps.length - 1; i++) {
		const next = maps[i + 1];
		if (
			maps[i].path !== '/dev/dri/card0' ||
			next.start !== maps[i].end ||
			next.path ||
			!next.perms.startsWith('rw') ||
			next.end - next.start < BigInt(minimum)
		) {
			continue;
		}
		const pointer = await walkArena(session, pid, maps[i].end, minimum);
		if (pointer === null) continue;
		const length = (await readMemory(session, pid, pointer + 8n, 4)).readUInt32LE(0);
		const stride = Math.floor((length - 2) / (height * 4));
		return { pointer, stride: stride >= width ? stride : width };
	}
	throw new Error('framebuffer not found in xochitl memory');
}

async function buildPlan(session: Session): Promise<Plan> {
	const machine = (session.machine ?? '').toLowerCase();
	if (machine.includes('remarkable 1')) {
		return {
			file: '/dev/fb0',
			offset: 8n,
			width: 1404,
			height: 1872,
			stride: 1408,
			format: 'rgb565'
		};
	}
	if (machine.includes('remarkable 2')) {
		if (await session.fileExists('/dev/shm/swtfb.01')) {
			return {
				file: '/dev/shm/swtfb.01',
				offset: 0n,
				width: 1404,
				height: 1872,
				stride: 1404,
				format: 'rgb565'
			};
		}
		const pid = await xochitlPid(session);
		const [start] = await mapping(session, pid, '/dev/fb0', false);
		const file = `/proc/${pid}/mem`;
		const firmware = session.firmware;
		if (versionAtLeast(firmware, '3.24')) {
			const skip = versionAtLeast(firmware, '3.27.1.0') ? 4705256n : 2629636n;
			return {
				file,
				offset: start + skip,
				width: 1404,
				height: 1872,
				stride: 1404,
				format: 'bgra'
			};
		}
		return {
			file,
			offset: start + 8n,
			width: 1872,
			height: 1404,
			stride: 1872,
			format: versionAtLeast(firmware, '3.7.0.1930') ? 'gray16' : 'gray8'
		};
	}
	const size = (await displaySize(session)) ?? (machine.includes('ferrari') ? [1620, 2160] : null);
	if (!size) {
		throw new Error(`Screen capture is not supported on "${session.machine ?? 'unknown device'}"`);
	}
	const pid = await xochitlPid(session);
	const { pointer, stride } = await drmFramebuffer(session, pid, size[0], size[1]);
	return {
		file: `/proc/${pid}/mem`,
		offset: pointer,
		width: size[0],
		height: size[1],
		stride,
		format: 'bgra'
	};
}

const helpers = new Map<string, { local: string; remote: string; data: Buffer }>();

function helperFor(arch: string) {
	let helper = helpers.get(arch);
	if (!helper) {
		const local = path.join(HELPER_DIR, `rmfb-${arch}`);
		let data: Buffer;
		try {
			data = readFileSync(local);
		} catch {
			throw new Error(`No screen helper built for ${arch}`);
		}
		const hash = createHash('sha256').update(data).digest('hex').slice(0, 12);
		helper = { local, remote: `${REMOTE_DIR}/rmfb-${hash}`, data };
		helpers.set(arch, helper);
	}
	return helper;
}

async function ensureHelper(session: Session): Promise<string> {
	const arch = (await session.exec('uname -m')).stdout.toString('utf8').trim();
	const helper = helperFor(arch);
	if (await session.fileExists(helper.remote)) return helper.remote;
	await session.exec(
		`mkdir -p ${shellQuote(REMOTE_DIR)} && rm -f ${shellQuote(REMOTE_DIR)}/rmfb-*`
	);
	await session.writeFile(helper.remote, helper.data);
	await session.exec(`chmod 755 ${shellQuote(helper.remote)}`);
	return helper.remote;
}

function channelsFor(session: Session): number {
	const machine = (session.machine ?? '').toLowerCase();
	return machine.includes('ferrari') || machine.includes('chiappa') ? 3 : 1;
}

function parseStream(ws: WebSocket, onMeta: (header: Buffer) => void) {
	let pending: Buffer = Buffer.alloc(0);
	let headerSeen = false;
	return (chunk: Buffer) => {
		pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
		for (;;) {
			if (!headerSeen) {
				if (pending.length < HEADER_SIZE) return;
				onMeta(pending.subarray(0, HEADER_SIZE));
				pending = pending.subarray(HEADER_SIZE);
				headerSeen = true;
			}
			if (pending.length < PACKET_HEADER) return;
			const length = PACKET_HEADER + pending.readUInt32LE(4);
			if (pending.length < length) return;
			if (ws.readyState === ws.OPEN && ws.bufferedAmount < 32 * 1024 * 1024) {
				ws.send(pending.subarray(0, length));
			}
			pending = pending.subarray(length);
		}
	};
}

export async function streamScreen(session: Session, ws: WebSocket) {
	let channel: ClientChannel | null = null;
	let attempts = 0;
	const fail = (message: string) => {
		if (ws.readyState === ws.OPEN) {
			ws.send(JSON.stringify({ type: 'error', message }));
			ws.close();
		}
	};
	ws.on('close', () => channel?.close());

	const start = async (): Promise<void> => {
		attempts += 1;
		const [plan, helper] = await Promise.all([buildPlan(session), ensureHelper(session)]);
		const channels = channelsFor(session);
		const command = `${shellQuote(helper)} ${shellQuote(plan.file)} ${plan.offset} ${plan.width} ${plan.height} ${plan.stride} ${plan.format} ${channels} 12 40`;
		const current = await session.execStream(command);
		channel = current;
		let stderr = '';
		const feed = parseStream(ws, (header) => {
			if (header.toString('latin1', 0, 4) !== 'RMFB') throw new Error('unexpected helper output');
			const meta: ScreenMeta = {
				type: 'meta',
				width: header.readUInt16LE(6),
				height: header.readUInt16LE(8),
				visibleWidth: header.readUInt16LE(6),
				channels: header[5],
				model: modelName(session.machine ?? '')
			};
			ws.send(JSON.stringify(meta));
		});
		current.on('data', (chunk: Buffer) => {
			try {
				feed(chunk);
			} catch (error) {
				current.close();
				fail((error as Error).message);
			}
		});
		current.stderr.on('data', (chunk: Buffer) => {
			stderr += chunk.toString('utf8');
		});
		current.on('close', () => {
			if (ws.readyState !== ws.OPEN || channel !== current) return;
			retry(stderr.trim() || 'Screen helper stopped');
		});
	};

	const retry = (message: string) => {
		if (attempts >= 5) {
			fail(message);
			return;
		}
		setTimeout(() => start().catch((error: Error) => retry(error.message)), 1500);
	};

	start().catch((error: Error) => retry(error.message));
}
