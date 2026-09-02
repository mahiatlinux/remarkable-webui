import { Router, type Request, type Response } from 'express';
import busboy from 'busboy';
import { createWriteStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import type { SystemAction, UploadResult } from '../shared/types';
import { USB_HOST, addDevice, probeTcp, removeDevice, updateDevice } from './devices';
import { emit, subscribe } from './events';
import { HttpError, bodyString, bodyStringArray, contentDisposition, queryString } from './http';
import { allStates, dropSession, getSession, type Session } from './session';
import * as xochitl from './xochitl';
import * as rmdoc from './rmdoc';
import * as fs from './fs';
import { proxyDownload, webInterfaceReachable } from './webui';
import { runAction, systemInfo } from './system';
import { listTemplates, templateFile } from './templates';

export const router = Router();

router.get('/events', (_req, res) => subscribe(res));

router.get('/usb', async (_req, res) => {
	res.json({ reachable: await probeTcp(USB_HOST, 22), host: USB_HOST });
});

router.get('/devices', (_req, res) => res.json(allStates()));

router.post('/devices', (req, res) => {
	const device = addDevice(req.body ?? {});
	res.status(201).json(getSession(device.id).state());
});

router.patch('/devices/:id', (req, res) => {
	const device = updateDevice(req.params.id, req.body ?? {});
	const session = getSession(device.id);
	emit({ type: 'device', device: session.state() });
	res.json(session.state());
});

router.delete('/devices/:id', (req, res) => {
	dropSession(req.params.id);
	removeDevice(req.params.id);
	res.status(204).end();
});

router.post('/devices/:id/connect', async (req, res) => {
	const session = getSession(req.params.id);
	await session.connect();
	res.json(session.state());
});

router.post('/devices/:id/disconnect', (req, res) => {
	const session = getSession(req.params.id);
	session.disconnect();
	res.json(session.state());
});

const device = Router({ mergeParams: true });
router.use('/d/:id', device);

function session(req: Request): Session {
	return getSession((req.params as { id: string }).id);
}

function parseUpload(
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

function extension(filename: string): string {
	return path.posix.extname(filename).slice(1).toLowerCase();
}

function baseName(filename: string): string {
	return path.posix.basename(filename, path.posix.extname(filename));
}

async function stageTemp(stream: Readable): Promise<string> {
	const target = path.join(tmpdir(), `rm-ui-${randomUUID()}.zip`);
	await pipeline(stream, createWriteStream(target));
	return target;
}

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
	xochitl.assertParent(parent);
	const created: UploadResult['created'] = [];
	await parseUpload(req, async (filename, stream) => {
		const ext = extension(filename);
		const name = baseName(filename);
		if (ext === 'pdf' || ext === 'epub') {
			created.push({ id: await xochitl.createDocument(current, name, parent, ext, stream), name });
			return;
		}
		if (ext === 'rmdoc' || ext === 'zip') {
			const temp = await stageTemp(stream);
			try {
				for (const id of await rmdoc.importRmdoc(current, temp, parent)) created.push({ id, name });
			} finally {
				await unlink(temp).catch(() => {});
			}
			return;
		}
		throw new HttpError(
			400,
			`Unsupported file type: ${filename}. Upload PDF, EPUB or rmdoc files.`
		);
	});
	res.status(201).json({ created } satisfies UploadResult);
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

device.get('/fs', async (req, res) => {
	res.json(await fs.listDir(session(req), queryString(req, 'path')));
});

device.get('/fs/download', async (req, res) => {
	await fs.download(session(req), queryString(req, 'path'), res);
});

device.get('/fs/text', async (req, res) => {
	res.json({ text: await fs.readText(session(req), queryString(req, 'path')) });
});

device.put('/fs/text', async (req, res) => {
	await fs.writeText(session(req), queryString(req, 'path'), req.body as string);
	res.status(204).end();
});

device.post('/fs/mkdir', async (req, res) => {
	await fs.makeDir(session(req), bodyString(req.body, 'path'));
	res.status(204).end();
});

device.post('/fs/rename', async (req, res) => {
	await fs.renamePath(session(req), bodyString(req.body, 'from'), bodyString(req.body, 'to'));
	res.status(204).end();
});

device.post('/fs/delete', async (req, res) => {
	await fs.removePaths(session(req), bodyStringArray(req.body, 'paths'));
	res.status(204).end();
});

device.post('/fs/upload', async (req, res) => {
	const current = session(req);
	const target = queryString(req, 'path');
	const names: string[] = [];
	await parseUpload(req, async (filename, stream) => {
		await fs.uploadFile(current, target, filename, stream);
		names.push(filename);
	});
	res.status(201).json({ uploaded: names });
});

device.get('/system', async (req, res) => {
	res.json(await systemInfo(session(req)));
});

device.post('/system/:action', async (req, res) => {
	await runAction(session(req), req.params.action as SystemAction);
	res.status(204).end();
});

device.get('/webui/status', async (req, res) => {
	res.json({ reachable: await webInterfaceReachable(session(req)) });
});

device.get('/templates', async (req, res) => {
	res.json(await listTemplates(session(req)));
});

device.get('/templates/file/:name', async (req, res) => {
	const name = req.params.name;
	const ext = extension(name);
	if (ext !== 'svg' && ext !== 'png' && ext !== 'template') {
		throw new HttpError(400, 'Template files are template, svg or png');
	}
	const data = await templateFile(session(req), baseName(name), ext);
	res.setHeader(
		'Content-Type',
		ext === 'svg' ? 'image/svg+xml' : ext === 'png' ? 'image/png' : 'application/json'
	);
	res.setHeader('Cache-Control', 'private, max-age=3600');
	res.end(data);
});

export function sendError(error: Error, res: Response) {
	const status = error instanceof HttpError ? error.status : 500;
	if (res.headersSent) {
		res.destroy();
		return;
	}
	res.status(status).json({ error: error.message });
}

export { contentDisposition };
