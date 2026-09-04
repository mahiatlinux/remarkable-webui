import { Router } from 'express';
import { session } from './context';
import type { SystemAction } from '../../shared/types';
import { runAction, systemInfo } from '../system';
import { webInterfaceReachable } from '../webui';

export const device = Router({ mergeParams: true });

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
