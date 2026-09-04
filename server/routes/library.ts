import { Router } from 'express';
import { session } from './context';
import { unlink } from 'node:fs/promises';
import type { UploadResult } from '../../shared/types';
import { HttpError, bodyString, bodyStringArray, queryString } from '../http';
import * as xochitl from '../xochitl';
import * as rmdoc from '../rmdoc';
import { proxyDownload, uploadDocument } from '../webui';
import { parseUpload, extension, stageTemp } from '../uploads';

export const device = Router({ mergeParams: true });

device.get('/library', async (req, res) => {
	res.json(await xochitl.listLibrary(session(req)));
});

device.post('/library/folder', async (req, res) => {
	const id = await xochitl.createFolder(
		session(req),
		bodyString(req.body, 'name'),
		(req.body?.parent as string) ?? ''
	);
	res.status(201).json({ id });
});

device.post('/library/notebook', async (req, res) => {
	const id = await xochitl.createNotebook(
		session(req),
		bodyString(req.body, 'name'),
		(req.body?.parent as string) ?? '',
		(req.body?.template as string) || 'Blank',
		Boolean(req.body?.landscape)
	);
	res.status(201).json({ id });
});

device.post('/library/move', async (req, res) => {
	await xochitl.moveItems(
		session(req),
		bodyStringArray(req.body, 'ids'),
		(req.body?.parent as string) ?? ''
	);
	res.status(204).end();
});

device.post('/library/trash', async (req, res) => {
	await xochitl.moveItems(session(req), bodyStringArray(req.body, 'ids'), 'trash');
	res.status(204).end();
});

device.post('/library/restore', async (req, res) => {
	await xochitl.moveItems(session(req), bodyStringArray(req.body, 'ids'), '');
	res.status(204).end();
});

device.post('/library/purge', async (req, res) => {
	await xochitl.purgeItems(session(req), bodyStringArray(req.body, 'ids'));
	res.status(204).end();
});

device.post('/library/upload', async (req, res) => {
	const current = session(req);
	const parent = typeof req.query.parent === 'string' ? req.query.parent : '';
	if (parent) xochitl.assertId(parent);
	const uploaded: string[] = [];
	await parseUpload(req, async (filename, stream) => {
		const ext = extension(filename);
		if (ext !== 'pdf' && ext !== 'epub' && ext !== 'rmdoc') {
			throw new HttpError(
				400,
				`Unsupported file type: ${filename}. Upload PDF, EPUB or rmdoc files.`
			);
		}
		const temp = await stageTemp(stream);
		try {
			await uploadDocument(current, parent, filename, temp);
		} finally {
			await unlink(temp).catch(() => {});
		}
		uploaded.push(filename);
	});
	res.status(201).json({ uploaded } satisfies UploadResult);
});

device.get('/documents/:doc', async (req, res) => {
	res.json(await xochitl.getDocument(session(req), req.params.doc));
});

device.post('/documents/:doc/rename', async (req, res) => {
	await xochitl.renameItem(session(req), req.params.doc, bodyString(req.body, 'name'));
	res.status(204).end();
});

device.post('/documents/:doc/pin', async (req, res) => {
	await xochitl.setPinned(session(req), req.params.doc, Boolean(req.body?.pinned));
	res.status(204).end();
});

device.get('/documents/:doc/pages/:page/lines', async (req, res) => {
	const data = await xochitl.readPageLines(session(req), req.params.doc, req.params.page);
	res.setHeader('Content-Type', 'application/octet-stream');
	res.setHeader('Cache-Control', 'private, max-age=30');
	res.end(data);
});

device.get('/documents/:doc/pages/:page/thumbnail', async (req, res) => {
	const { data, type } = await xochitl.readThumbnail(session(req), req.params.doc, req.params.page);
	res.setHeader('Content-Type', type);
	res.setHeader('Cache-Control', 'private, max-age=60');
	res.end(data);
});

device.get('/documents/:doc/file', async (req, res) => {
	const current = session(req);
	const file = await xochitl.documentFile(current, req.params.doc);
	const sftp = await current.sftp();
	res.setHeader('Content-Type', file.type);
	res.setHeader('Content-Length', String(file.size));
	res.setHeader('Cache-Control', 'private, max-age=300');
	const stream = sftp.createReadStream(file.path);
	stream.on('error', () => res.destroy());
	stream.pipe(res);
});

device.get('/documents/:doc/export/rmdoc', async (req, res) => {
	await rmdoc.exportRmdoc(session(req), req.params.doc, queryString(req, 'name'), res);
});

device.get('/documents/:doc/export/pdf', async (req, res) => {
	const name = queryString(req, 'name');
	await proxyDownload(session(req), xochitl.assertId(req.params.doc), 'pdf', `${name}.pdf`, res);
});

device.post('/xochitl/restart', async (req, res) => {
	await session(req).restartXochitl();
	res.status(204).end();
});
