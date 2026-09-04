import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createApp } from './app';
import { desktopAccess } from './desktop';
import { getSession, disconnectAll } from './session';
import { streamScreen } from './screen';
import { attachTerminal } from './terminal';

const port = Number(process.env.PORT ?? 8787);
const production = process.env.NODE_ENV === 'production';
const token = process.env.RM_DESKTOP_TOKEN;
const access = token ? desktopAccess(token, process.env.RM_DESKTOP_ORIGIN) : undefined;
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');

const app = createApp(token, process.env.RM_DESKTOP_ORIGIN);

if (production && !token) {
	app.use(express.static(dist));
	app.get('/{*splat}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
	if (access && !access.authorized(req)) {
		socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
		return;
	}
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
	const address = server.address();
	if (!address || typeof address === 'string') return;
	console.log(
		token
			? JSON.stringify({ port: address.port })
			: `remarkable-webui server listening on http://127.0.0.1:${address.port}`
	);
});

function shutdown() {
	disconnectAll();
	for (const client of wss.clients) client.terminate();
	server.close(() => process.exit(0));
	server.closeAllConnections();
	setTimeout(() => process.exit(0), 2000).unref();
}

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
if (token) {
	process.stdin.resume();
	process.stdin.once('end', shutdown);
}
