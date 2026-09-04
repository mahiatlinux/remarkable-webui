import express, { type NextFunction, type Request, type Response } from 'express';
import { router, sendError } from './routes';
import { desktopAccess } from './desktop';

export function createApp(token?: string, devOrigin?: string) {
	const app = express();
	app.disable('x-powered-by');
	if (token) app.use(desktopAccess(token, devOrigin).middleware);
	app.use('/api/d/:id/fs/text', express.text({ type: '*/*', limit: '8mb' }));
	app.use(express.json({ limit: '1mb' }));
	app.use('/api', router);
	app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
	app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
		sendError(error, res);
	});
	return app;
}
