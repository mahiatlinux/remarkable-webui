import express, { type NextFunction, type Request, type Response } from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { router, sendError } from './routes';
import { getSession } from './session';
import { streamScreen } from './screen';
import { attachTerminal } from './terminal';

const port = Number(process.env.PORT ?? 8787);
const production = process.env.NODE_ENV === 'production';
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');

const app = express();
app.disable('x-powered-by');
app.use('/api/d/:id/fs/text', express.text({ type: '*/*', limit: '8mb' }));
app.use(express.json({ limit: '1mb' }));
app.use('/api', router);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

if (production) {
	app.use(express.static(dist));
	app.get('*splat', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
	sendError(error, res);
});

const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
	const url = new URL(req.url ?? '/', 'http://localhost');
	if (url.pathname !== '/ws/terminal' && url.pathname !== '/ws/screen') {
		socket.destroy();
		return;
	}
	wss.handleUpgrade(req, socket, head, (ws) => {
		let session;
		try {
			session = getSession(url.searchParams.get('device') ?? '');
		} catch (error) {
			ws.send(JSON.stringify({ type: 'error', message: (error as Error).message }));
			ws.close();
			return;
		}
		if (url.pathname === '/ws/screen') {
			void streamScreen(session, ws);
			return;
		}
		void attachTerminal(
			session,
			ws,
			Number(url.searchParams.get('cols') ?? 80),
			Number(url.searchParams.get('rows') ?? 24)
		);
	});
});

server.listen(port, '127.0.0.1', () => {
	console.log(`rm-ui server listening on http://127.0.0.1:${port}`);
});
