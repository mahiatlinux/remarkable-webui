import { ZipArchive } from 'archiver';
import yauzl from 'yauzl';
import { pipeline } from 'node:stream/promises';
import type { Response } from 'express';
import { HttpError, contentDisposition, shellQuote } from './http';
import type { Session } from './session';
import { XOCHITL_DIR, assertId, assertParent, ensureDir } from './xochitl';

const ENTRY =
	/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\.[A-Za-z0-9_.-]+|\/[^/]+(\/[^/]+)*|\.thumbnails\/[^/]+|\.highlights\/[^/]+)?$/;

export async function exportRmdoc(session: Session, id: string, name: string, res: Response) {
	assertId(id);
	const listing = await session.exec(
		`cd ${shellQuote(XOCHITL_DIR)} && find ${shellQuote(id)} ${shellQuote(id + '.')}* -type f 2>/dev/null; true`
	);
	const files = listing.stdout.toString('utf8').split('\n').filter(Boolean);
	if (files.length === 0) throw new HttpError(404, 'Document not found');
	const sftp = await session.sftp();
	res.setHeader('Content-Type', 'application/zip');
	res.setHeader('Content-Disposition', contentDisposition(`${name}.rmdoc`));
	const archive = new ZipArchive({ zlib: { level: 6 } });
	archive.on('error', () => res.destroy());
	archive.pipe(res);
	for (const file of files) {
		archive.append(sftp.createReadStream(`${XOCHITL_DIR}/${file}`), { name: file });
	}
	await archive.finalize();
}

function openZip(path: string): Promise<yauzl.ZipFile> {
	return new Promise((resolve, reject) => {
		yauzl.open(path, { lazyEntries: true }, (error, zip) => {
			if (error) reject(new HttpError(400, 'Not a valid rmdoc archive'));
			else resolve(zip);
		});
	});
}

function nextEntry(zip: yauzl.ZipFile): Promise<yauzl.Entry | null> {
	return new Promise((resolve, reject) => {
		zip.once('entry', (entry: yauzl.Entry) => resolve(entry));
		zip.once('end', () => resolve(null));
		zip.once('error', reject);
		zip.readEntry();
	});
}

function entryStream(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<NodeJS.ReadableStream> {
	return new Promise((resolve, reject) => {
		zip.openReadStream(entry, (error, stream) => (error ? reject(error) : resolve(stream)));
	});
}

async function readAll(stream: NodeJS.ReadableStream): Promise<Buffer> {
	const chunks: Buffer[] = [];
	for await (const chunk of stream) chunks.push(chunk as Buffer);
	return Buffer.concat(chunks);
}

export async function importRmdoc(
	session: Session,
	zipPath: string,
	parent: string
): Promise<string[]> {
	assertParent(parent);
	const zip = await openZip(zipPath);
	const sftp = await session.sftp();
	const ids = new Set<string>();
	const createdDirs = new Set<string>();
	try {
		for (let entry = await nextEntry(zip); entry; entry = await nextEntry(zip)) {
			const match = ENTRY.exec(entry.fileName);
			if (!match || entry.fileName.includes('..')) continue;
			if (entry.fileName.endsWith('/')) continue;
			const target = `${XOCHITL_DIR}/${entry.fileName}`;
			const dir = target.slice(0, target.lastIndexOf('/'));
			if (dir !== XOCHITL_DIR && !createdDirs.has(dir)) {
				await ensureDir(session, dir);
				createdDirs.add(dir);
			}
			const stream = await entryStream(zip, entry);
			if (entry.fileName === `${match[1]}.metadata`) {
				const meta = JSON.parse((await readAll(stream)).toString('utf8'));
				meta.parent = parent;
				meta.deleted = false;
				meta.synced = false;
				meta.metadatamodified = true;
				meta.lastModified = String(Date.now());
				await session.writeFile(target, JSON.stringify(meta, null, 4) + '\n');
				ids.add(match[1]);
			} else {
				await pipeline(stream, sftp.createWriteStream(target));
			}
		}
	} finally {
		zip.close();
	}
	if (ids.size === 0) throw new HttpError(400, 'Archive contains no reMarkable documents');
	session.scheduleRestart();
	return [...ids];
}
