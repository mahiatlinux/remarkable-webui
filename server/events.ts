import type { Response } from 'express';
import type { ServerEvent } from '../shared/types';

const clients = new Set<Response>();

export function subscribe(res: Response) {
	res.writeHead(200, {
		'Content-Type': 'text/event-stream',
		'Cache-Control': 'no-cache',
		Connection: 'keep-alive'
	});
	res.write(': connected\n\n');
	clients.add(res);
	const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);
	res.on('close', () => {
		clearInterval(heartbeat);
		clients.delete(res);
	});
}

export function emit(event: ServerEvent) {
	const payload = `data: ${JSON.stringify(event)}\n\n`;
	for (const client of clients) client.write(payload);
}
