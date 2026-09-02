import http from 'node:http';
import type { Socket } from 'node:net';
import type { Response } from 'express';
import { HttpError, contentDisposition } from './http';
import type { Session } from './session';

const WEB_HOST = '10.11.99.1';
const UNREACHABLE =
	'The tablet web interface is unreachable. Connect the USB cable and enable "USB web interface" under Settings > Storage.';

export async function deviceWebRequest(
	session: Session,
	path: string,
	timeoutMs = 20000
): Promise<http.IncomingMessage> {
	let channel;
	try {
		channel = await session.forwardOut(WEB_HOST, 80);
	} catch {
		throw new HttpError(502, UNREACHABLE);
	}
	return new Promise((resolve, reject) => {
		const request = http.request(
			{
				host: WEB_HOST,
				path,
				method: 'GET',
				headers: { Host: WEB_HOST, Connection: 'close' },
				createConnection: () => channel as unknown as Socket
			},
			resolve
		);
		request.setTimeout(timeoutMs, () => {
			request.destroy(new Error('timeout'));
		});
		request.on('error', () => reject(new HttpError(502, UNREACHABLE)));
		request.end();
	});
}

export async function webInterfaceReachable(session: Session): Promise<boolean> {
	try {
		const response = await deviceWebRequest(session, '/documents/', 3000);
		response.resume();
		return response.statusCode === 200;
	} catch {
		return false;
	}
}

export async function proxyDownload(
	session: Session,
	id: string,
	kind: 'pdf' | 'rmdoc',
	filename: string,
	res: Response
) {
	const response = await deviceWebRequest(session, `/download/${id}/${kind}`, 120000);
	if (response.statusCode !== 200) {
		response.resume();
		throw new HttpError(502, `The tablet refused the export (HTTP ${response.statusCode})`);
	}
	res.setHeader('Content-Type', response.headers['content-type'] ?? 'application/octet-stream');
	if (response.headers['content-length']) {
		res.setHeader('Content-Length', response.headers['content-length']);
	}
	res.setHeader('Content-Disposition', contentDisposition(filename));
	response.pipe(res);
}
