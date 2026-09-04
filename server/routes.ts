import { Router, type Response } from 'express';
import { HttpError } from './http';
import { router as devices } from './routes/devices';
import { device as library } from './routes/library';
import { device as files } from './routes/files';
import { device as system } from './routes/system';
import { device as templates } from './routes/templates';

export const router = Router();
router.use(devices);
router.use('/d/:id', library, files, system, templates);

export function sendError(error: Error, res: Response) {
	const status = error instanceof HttpError ? error.status : 500;
	if (res.headersSent) {
		res.destroy();
		return;
	}
	res.status(status).json({ error: error.message });
}
