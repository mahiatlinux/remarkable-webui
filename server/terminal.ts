import type { WebSocket } from 'ws';
import type { Session } from './session';

export async function attachTerminal(session: Session, ws: WebSocket, cols: number, rows: number) {
	let channel;
	try {
		channel = await session.shell(cols, rows);
	} catch (error) {
		ws.send(JSON.stringify({ type: 'error', message: (error as Error).message }));
		ws.close();
		return;
	}
	channel.on('data', (data: Buffer) => ws.send(data));
	channel.stderr.on('data', (data: Buffer) => ws.send(data));
	channel.on('close', () => ws.close());
	ws.on('message', (raw) => {
		const message = JSON.parse(raw.toString()) as
			{ type: 'input'; data: string } | { type: 'resize'; cols: number; rows: number };
		if (message.type === 'input') channel.write(message.data);
		else channel.setWindow(message.rows, message.cols, 0, 0);
	});
	ws.on('close', () => channel.close());
}
