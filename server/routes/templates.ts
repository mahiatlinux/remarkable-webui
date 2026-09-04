import { Router } from 'express';
import { session } from './context';
import { HttpError, bodyString, bodyStringArray } from '../http';
import { extension, baseName } from '../uploads';
import {
	addTemplate,
	customTemplateFile,
	listTemplates,
	removeTemplate,
	templateFile,
	updateTemplate
} from '../templates';

export const device = Router({ mergeParams: true });

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

device.get('/templates/custom/:template', async (req, res) => {
	const data = await customTemplateFile(session(req), req.params.template);
	res.setHeader('Content-Type', 'application/json');
	res.setHeader('Cache-Control', 'no-store');
	res.end(data);
});

device.post('/templates', async (req, res) => {
	const created = await addTemplate(session(req), {
		name: bodyString(req.body, 'name'),
		categories: bodyStringArray(req.body, 'categories'),
		landscape: Boolean(req.body?.landscape),
		source: bodyString(req.body, 'source')
	});
	res.status(201).json(created);
});

device.put('/templates/custom/:template', async (req, res) => {
	await updateTemplate(session(req), req.params.template, bodyString(req.body, 'source'));
	res.status(204).end();
});

device.delete('/templates/custom/:template', async (req, res) => {
	await removeTemplate(session(req), req.params.template);
	res.status(204).end();
});
