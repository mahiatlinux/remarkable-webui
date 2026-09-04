import { readFileSync } from 'node:fs';
import { Client, type ClientChannel, type SFTPWrapper } from 'ssh2';
import type { DeviceState, SessionStatus } from '../shared/types';
import { getDevice, listDevices, toPublic, type StoredDevice } from './devices';
import { emit } from './events';
import { HttpError } from './http';

export interface ExecResult {
	stdout: Buffer;
	stderr: string;
	code: number;
}

export interface ExecOptions {
	stdin?: Buffer | string;
	allowFailure?: boolean;
}

const sessions = new Map<string, Session>();

export class Session {
	readonly id: string;
	status: SessionStatus = 'disconnected';
	error?: string;
	machine?: string;
	firmware?: string;
	pendingRestart = false;
	private client: Client | null = null;
	private sftpWrapper: SFTPWrapper | null = null;
	private connecting: Promise<void> | null = null;
	private restartTimer: NodeJS.Timeout | null = null;

	constructor(id: string) {
		this.id = id;
	}

	get device(): StoredDevice {
		return getDevice(this.id);
	}

	state(): DeviceState {
		return {
			...toPublic(this.device),
			status: this.status,
			error: this.error,
			machine: this.machine,
			model: this.machine ? modelName(this.machine) : undefined,
			pendingRestart: this.pendingRestart
		};
	}

	private setStatus(status: SessionStatus, error?: string) {
		this.status = status;
		this.error = error;
		emit({ type: 'device', device: this.state() });
	}

	connect(): Promise<void> {
		if (this.status === 'connected') return Promise.resolve();
		if (this.connecting) return this.connecting;
		this.connecting = this.open().finally(() => {
			this.connecting = null;
		});
		return this.connecting;
	}

	private open(): Promise<void> {
		const device = this.device;
		this.setStatus('connecting');
		return new Promise((resolve, reject) => {
			const client = new Client();
			let settled = false;
			const fail = (message: string) => {
				if (!settled) {
					settled = true;
					this.client = null;
					this.setStatus('error', message);
					reject(new HttpError(502, message));
				}
			};
			client.on('ready', async () => {
				this.client = client;
				try {
					await this.loadIdentity(client);
				} catch (error) {
					client.end();
					fail(`Connected but failed to identify device: ${(error as Error).message}`);
					return;
				}
				settled = true;
				this.setStatus('connected');
				resolve();
			});
			client.on('error', (error) => fail(describeSshError(error, device)));
			client.on('close', () => {
				this.sftpWrapper = null;
				if (this.client === client) {
					this.client = null;
					if (this.status !== 'error') this.setStatus('disconnected');
				}
				fail('Connection closed');
			});
			client.connect({
				host: device.host,
				port: device.port,
				username: device.username,
				password: device.password,
				privateKey: device.keyPath ? readKey(device.keyPath) : undefined,
				readyTimeout: 10000,
				keepaliveInterval: 15000,
				keepaliveCountMax: 3
			});
		});
	}

	private async loadIdentity(client: Client) {
		const result = await this.run(
			client,
			"cat /sys/devices/soc0/machine 2>/dev/null || tr -d '\\0' < /proc/device-tree/model 2>/dev/null; echo; grep -h -E '^(REMARKABLE_RELEASE_VERSION|IMG_VERSION)=' /usr/share/remarkable/update.conf /etc/os-release 2>/dev/null | head -n1",
			{ allowFailure: true }
		);
		const [machine, version] = result.stdout.toString('utf8').split('\n');
		this.machine = machine.trim() || 'unknown';
		this.firmware = version?.split('=')[1]?.replace(/"/g, '').trim() || undefined;
	}

	disconnect() {
		if (this.restartTimer) clearTimeout(this.restartTimer);
		this.restartTimer = null;
		const client = this.client;
		this.client = null;
		this.sftpWrapper = null;
		client?.end();
		this.setStatus('disconnected');
	}

	private async ready(): Promise<Client> {
		await this.connect();
		if (!this.client) throw new HttpError(502, this.error ?? 'Device not connected');
		return this.client;
	}

	async exec(command: string, options: ExecOptions = {}): Promise<ExecResult> {
		return this.run(await this.ready(), command, options);
	}

	private run(client: Client, command: string, options: ExecOptions): Promise<ExecResult> {
		return new Promise((resolve, reject) => {
			client.exec(command, (error, channel) => {
				if (error) return reject(new HttpError(502, error.message));
				const stdout: Buffer[] = [];
				const stderr: Buffer[] = [];
				channel.on('data', (chunk: Buffer) => stdout.push(chunk));
				channel.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
				channel.on('close', (code: number | null) => {
					const result = {
						stdout: Buffer.concat(stdout),
						stderr: Buffer.concat(stderr).toString('utf8'),
						code: code ?? 0
					};
					if (result.code !== 0 && !options.allowFailure) {
						reject(
							new HttpError(
								502,
								result.stderr.trim() || `Command failed with exit code ${result.code}`
							)
						);
					} else {
						resolve(result);
					}
				});
				if (options.stdin !== undefined) channel.end(options.stdin);
			});
		});
	}

	async execStream(command: string): Promise<ClientChannel> {
		const client = await this.ready();
		return new Promise((resolve, reject) => {
			client.exec(command, (error, channel) => {
				if (error) return reject(new HttpError(502, error.message));
				resolve(channel);
			});
		});
	}

	async shell(cols: number, rows: number): Promise<ClientChannel> {
		const client = await this.ready();
		return new Promise((resolve, reject) => {
			client.shell({ term: 'xterm-256color', cols, rows }, (error, channel) => {
				if (error) return reject(new HttpError(502, error.message));
				resolve(channel);
			});
		});
	}

	async forwardOut(host: string, port: number): Promise<ClientChannel> {
		const client = await this.ready();
		return new Promise((resolve, reject) => {
			client.forwardOut('127.0.0.1', 0, host, port, (error, channel) => {
				if (error) return reject(new HttpError(502, error.message));
				resolve(channel);
			});
		});
	}

	async sftp(): Promise<SFTPWrapper> {
		const client = await this.ready();
		if (this.sftpWrapper) return this.sftpWrapper;
		return new Promise((resolve, reject) => {
			client.sftp((error, sftp) => {
				if (error) return reject(new HttpError(502, error.message));
				sftp.on('close', () => {
					if (this.sftpWrapper === sftp) this.sftpWrapper = null;
				});
				this.sftpWrapper = sftp;
				resolve(sftp);
			});
		});
	}

	async readFile(path: string): Promise<Buffer> {
		const sftp = await this.sftp();
		return new Promise((resolve, reject) => {
			sftp.readFile(path, (error, data) =>
				error ? reject(sftpError(error, path)) : resolve(data)
			);
		});
	}

	async writeFile(path: string, data: Buffer | string): Promise<void> {
		const sftp = await this.sftp();
		return new Promise((resolve, reject) => {
			sftp.writeFile(path, data, (error) => (error ? reject(sftpError(error, path)) : resolve()));
		});
	}

	async fileExists(path: string): Promise<boolean> {
		const sftp = await this.sftp();
		return new Promise((resolve) => sftp.stat(path, (error) => resolve(!error)));
	}

	scheduleRestart() {
		this.pendingRestart = true;
		emit({ type: 'restart', deviceId: this.id, pending: true });
		if (!this.device.autoRestart) return;
		if (this.restartTimer) clearTimeout(this.restartTimer);
		this.restartTimer = setTimeout(() => {
			this.restartTimer = null;
			this.restartXochitl().catch(() => {});
		}, 1500);
	}

	async restartXochitl() {
		await this.exec('systemctl restart xochitl');
		this.pendingRestart = false;
		emit({ type: 'restart', deviceId: this.id, pending: false });
		emit({ type: 'library', deviceId: this.id });
	}
}

function readKey(keyPath: string): Buffer {
	try {
		return readFileSync(keyPath.replace(/^~(?=$|\/)/, process.env.HOME ?? ''));
	} catch {
		throw new HttpError(400, `Cannot read private key at ${keyPath}`);
	}
}

function describeSshError(error: Error & { level?: string }, device: StoredDevice): string {
	if (error.level === 'client-authentication') {
		return 'Authentication failed. Check the password from Settings > Help > Copyrights and licenses.';
	}
	if ((error as NodeJS.ErrnoException).code === 'ECONNREFUSED') {
		return `Connection refused by ${device.host}:${device.port}. Is SSH enabled on the tablet?`;
	}
	if (
		(error as NodeJS.ErrnoException).code === 'EHOSTUNREACH' ||
		error.message.includes('Timed out')
	) {
		return `Cannot reach ${device.host}. Check the cable or wifi connection.`;
	}
	return error.message;
}

function sftpError(error: Error & { code?: number }, path: string): HttpError {
	if (error.code === 2) return new HttpError(404, `Not found: ${path}`);
	if (error.code === 3) return new HttpError(403, `Permission denied: ${path}`);
	return new HttpError(502, `${error.message}: ${path}`);
}

export function modelName(machine: string): string {
	const lower = machine.toLowerCase();
	if (lower.includes('remarkable 1')) return 'reMarkable 1';
	if (lower.includes('remarkable 2')) return 'reMarkable 2';
	if (lower.includes('ferrari')) return 'reMarkable Paper Pro';
	if (lower.includes('chiappa')) return 'reMarkable Paper Pro Move';
	return machine;
}

export function getSession(id: string): Session {
	getDevice(id);
	let session = sessions.get(id);
	if (!session) {
		session = new Session(id);
		sessions.set(id, session);
	}
	return session;
}

export function dropSession(id: string) {
	sessions.get(id)?.disconnect();
	sessions.delete(id);
}

export function allStates(): DeviceState[] {
	return listDevices().map((device) => getSession(device.id).state());
}

export function disconnectAll() {
	for (const session of sessions.values()) session.disconnect();
}
