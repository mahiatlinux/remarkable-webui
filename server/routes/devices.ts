import { Router } from 'express';
import { USB_HOST, addDevice, probeTcp, removeDevice, updateDevice } from '../devices';
import { emit, subscribe } from '../events';
import { allStates, dropSession, getSession } from '../session';

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
