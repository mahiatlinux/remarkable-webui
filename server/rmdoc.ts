import { ZipArchive } from 'archiver';
import type { Response } from 'express';
import { HttpError, contentDisposition, shellQuote } from './http';
import type { Session } from './session';
import { XOCHITL_DIR, assertId } from './xochitl';

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
