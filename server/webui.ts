import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { Socket } from 'node:net';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Response } from 'express';
import { emit } from './events';
import { HttpError, contentDisposition } from './http';
import type { Session } from './session';

const WEB_HOST = '10.11.99.1';
const UNREACHABLE =
	'The tablet web interface is unreachable. Connect the USB cable and enable "USB web interface" under Settings > Storage.';

interface WebBody {
	headers: http.OutgoingHttpHeaders;
	stream: Readable;
}

export async function deviceWebRequest(
	session: Session,
	path: string,
	timeoutMs = 20000,
	body?: WebBody
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
				method: body ? 'POST' : 'GET',
				headers: { Host: WEB_HOST, Connection: 'close', ...body?.headers },
				createConnection: () => channel as unknown as Socket
			},
			resolve
		);
		// ssh2 channels lack socket.setTimeout, so cap the whole exchange with a timer instead
		const timer = setTimeout(() => request.destroy(new Error('timeout')), timeoutMs);
		request.on('close', () => clearTimeout(timer));
		request.on('error', () => reject(new HttpError(502, UNREACHABLE)));
		if (body) pipeline(body.stream, request).catch((error) => request.destroy(error));
		else request.end();
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

async function* multipart(head: Buffer, file: string, tail: Buffer) {
	yield head;
	yield* createReadStream(file);
	yield tail;
}

async function readBody(response: http.IncomingMessage): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of response) chunks.push(chunk as Buffer);
	return Buffer.concat(chunks).toString('utf8');
}

// xochitl imports uploads into the folder listed by the most recent /documents request
export async function uploadDocument(
	session: Session,
	parent: string,
	filename: string,
	file: string
) {
	const listing = await deviceWebRequest(session, `/documents/${parent}`);
	listing.resume();
	if (listing.statusCode !== 200) throw new HttpError(404, 'Folder not found on the tablet');
	const boundary = `----remarkable-webui-${randomUUID()}`;
	const safeName = filename.replace(/["\r\n]/g, encodeURIComponent);
	const head = Buffer.from(
		`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${safeName}"\r\nContent-Type: application/octet-stream\r\n\r\n`
	);
	const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
	const { size } = await stat(file);
	const response = await deviceWebRequest(session, '/upload', 600000, {
		headers: {
			'Content-Type': `multipart/form-data; boundary=${boundary}`,
			'Content-Length': head.length + size + tail.length
		},
		stream: Readable.from(multipart(head, file, tail))
	});
	const body = await readBody(response);
	if (response.statusCode !== 201) {
		const reason = /"status":"([^"]*)"/.exec(body)?.[1] || `HTTP ${response.statusCode}`;
		throw new HttpError(502, `The tablet rejected ${filename}: ${reason}`);
	}
	emit({ type: 'library', deviceId: session.id });
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
