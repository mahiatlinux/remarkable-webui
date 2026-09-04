import type { Request } from 'express';
import busboy from 'busboy';
import { createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';

export function parseUpload(
	req: Request,
	onFile: (filename: string, stream: Readable) => Promise<void>
): Promise<void> {
	return new Promise((resolve, reject) => {
		const parser = busboy({ headers: req.headers, limits: { files: 50 } });
		let chain: Promise<void> = Promise.resolve();
		let failed: Error | null = null;
		parser.on('file', (_field, stream, info) => {
			chain = chain
				.then(() => (failed ? (stream.resume(), undefined) : onFile(info.filename, stream)))
				.catch((error: Error) => {
					failed = error;
					stream.resume();
				});
		});
		parser.on('error', (error: Error) => reject(error));
		parser.on('close', () => {
			chain.then(() => (failed ? reject(failed) : resolve()));
		});
		req.pipe(parser);
	});
}

export function extension(filename: string): string {
	return path.posix.extname(filename).slice(1).toLowerCase();
}

export function baseName(filename: string): string {
	return path.posix.basename(filename, path.posix.extname(filename));
}

export async function stageTemp(stream: Readable): Promise<string> {
	const target = path.join(tmpdir(), `remarkable-webui-${randomUUID()}`);
	await pipeline(stream, createWriteStream(target));
	return target;
}
