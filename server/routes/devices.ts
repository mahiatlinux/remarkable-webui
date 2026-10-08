import { Router } from 'express';
import { USB_HOST, addDevice, listDevices, probeTcp, removeDevice, updateDevice } from '../devices';
import { isUsbDevice } from '../../shared/devices';
import { emit, subscribe } from '../events';
import { allStates, dropSession, getSession } from '../session';
import { setupWifi } from '../wifi';

export const router = Router();

router.get('/events', (_req, res) => subscribe(res));

router.get('/usb', async (_req, res) => {
	const endpoints = [
		...listDevices()
			.filter(isUsbDevice)
			.map(({ host, port }) => ({ host, port })),
		{ host: USB_HOST, port: 22 }
	];
	const results = await Promise.all(
		endpoints.map(async (endpoint) => ({
			...endpoint,
			reachable: await probeTcp(endpoint.host, endpoint.port)
		}))
	);
	res.json(results.find((result) => result.reachable) ?? results[0]);
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

router.post('/devices/:id/wifi', async (req, res) => {
	res.json(await setupWifi(getSession(req.params.id)));
});

router.post('/devices/:id/disconnect', (req, res) => {
	const session = getSession(req.params.id);
	session.disconnect();
	res.json(session.state());
});
