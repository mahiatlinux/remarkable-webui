import { Router } from 'express';
import { session } from './context';
import { bodyString, bodyStringArray, queryString } from '../http';
import * as fs from '../fs';
import { parseUpload } from '../uploads';

export const device = Router({ mergeParams: true });

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
