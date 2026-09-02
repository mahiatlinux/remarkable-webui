import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import type { Response } from 'express';
import type { Stats } from 'ssh2';
import type { FsEntry, FsListing } from '../shared/types';
import { HttpError, contentDisposition, shellQuote } from './http';
import type { Session } from './session';

export function normalizePath(input: string): string {
	const normalized = path.posix.normalize(input.startsWith('/') ? input : `/${input}`);
	return normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized;
}

function stat(session: Session, target: string): Promise<Stats> {
	return session.sftp().then(
		(sftp) =>
			new Promise((resolve, reject) => {
				sftp.stat(target, (error, stats) =>
					error ? reject(new HttpError(404, `Not found: ${target}`)) : resolve(stats)
				);
			})
	);
}

function readlink(session: Session, target: string): Promise<string> {
	return session.sftp().then(
		(sftp) =>
			new Promise((resolve) => {
				sftp.readlink(target, (error, link) => resolve(error ? '' : link));
			})
	);
}

export async function listDir(session: Session, dirPath: string): Promise<FsListing> {
	const target = normalizePath(dirPath);
	const sftp = await session.sftp();
	const raw = await new Promise<{ filename: string; attrs: Stats }[]>((resolve, reject) => {
		sftp.readdir(target, (error, list) =>
			error ? reject(new HttpError(404, `Cannot open ${target}: ${error.message}`)) : resolve(list)
		);
	});
	const entries = await Promise.all(
		raw
			.filter((entry) => entry.filename !== '.' && entry.filename !== '..')
			.map(async (entry): Promise<FsEntry> => {
				const attrs = entry.attrs;
				const full = path.posix.join(target, entry.filename);
				if (attrs.isSymbolicLink()) {
					const link = await readlink(session, full);
					const resolved = await stat(session, full).catch(() => null);
					return {
						name: entry.filename,
						type: resolved?.isDirectory() ? 'dir' : resolved ? 'file' : 'symlink',
						size: resolved?.size ?? 0,
						mtime: attrs.mtime * 1000,
						mode: attrs.mode,
						target: link
					};
				}
				return {
					name: entry.filename,
					type: attrs.isDirectory() ? 'dir' : attrs.isFile() ? 'file' : 'other',
					size: attrs.size,
					mtime: attrs.mtime * 1000,
					mode: attrs.mode
				};
			})
	);
	entries.sort((a, b) =>
		a.type === b.type || (a.type !== 'dir' && b.type !== 'dir')
			? a.name.localeCompare(b.name)
			: a.type === 'dir'
				? -1
				: 1
	);
	return { path: target, entries };
}

export async function readText(session: Session, filePath: string): Promise<string> {
	const target = normalizePath(filePath);
	const stats = await stat(session, target);
	if (stats.size > 2 * 1024 * 1024) throw new HttpError(413, 'File is larger than 2 MB');
	const data = await session.readFile(target);
	if (data.subarray(0, 8000).includes(0)) throw new HttpError(415, 'Binary file');
	return data.toString('utf8');
}

export async function writeText(session: Session, filePath: string, text: string) {
	await session.writeFile(normalizePath(filePath), text);
}

export async function makeDir(session: Session, dirPath: string) {
	const target = normalizePath(dirPath);
	const sftp = await session.sftp();
	await new Promise<void>((resolve, reject) => {
		sftp.mkdir(target, (error) =>
			error ? reject(new HttpError(502, `Cannot create ${target}: ${error.message}`)) : resolve()
		);
	});
}

export async function renamePath(session: Session, from: string, to: string) {
	const source = normalizePath(from);
	const destination = normalizePath(to);
	const sftp = await session.sftp();
	await new Promise<void>((resolve, reject) => {
		sftp.rename(source, destination, (error) =>
			error ? reject(new HttpError(502, `Cannot rename ${source}: ${error.message}`)) : resolve()
		);
	});
}

export async function removePaths(session: Session, paths: string[]) {
	const targets = paths.map(normalizePath);
	if (targets.some((target) => target === '/' || target === '/home' || target === '/home/root')) {
		throw new HttpError(400, 'Refusing to delete a system root');
	}
	await session.exec(`rm -rf -- ${targets.map(shellQuote).join(' ')}`);
}

export async function download(session: Session, filePath: string, res: Response) {
	const target = normalizePath(filePath);
	const stats = await stat(session, target);
	const name = path.posix.basename(target) || 'root';
	if (stats.isDirectory()) {
		const parent = path.posix.dirname(target);
		const channel = await session.execStream(
			`tar -czf - -C ${shellQuote(parent)} ${shellQuote(name)}`
		);
		res.setHeader('Content-Type', 'application/gzip');
		res.setHeader('Content-Disposition', contentDisposition(`${name}.tar.gz`));
		channel.stderr.resume();
		channel.pipe(res);
		return;
	}
	const sftp = await session.sftp();
	res.setHeader('Content-Type', 'application/octet-stream');
	res.setHeader('Content-Length', String(stats.size));
	res.setHeader('Content-Disposition', contentDisposition(name));
	const stream = sftp.createReadStream(target);
	stream.on('error', () => res.destroy());
	stream.pipe(res);
}

export async function uploadFile(
	session: Session,
	dirPath: string,
	filename: string,
	stream: Readable
) {
	if (!filename || filename.includes('/') || filename === '..') {
		throw new HttpError(400, 'Invalid filename');
	}
	const sftp = await session.sftp();
	await pipeline(stream, sftp.createWriteStream(path.posix.join(normalizePath(dirPath), filename)));
}
