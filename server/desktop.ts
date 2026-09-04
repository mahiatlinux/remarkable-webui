import type { IncomingMessage } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';

export function desktopAccess(token: string, devOrigin?: string) {
	const origins = new Set([
		'tauri://localhost',
		'http://tauri.localhost',
		'https://tauri.localhost'
	]);
	if (devOrigin) origins.add(devOrigin);

	function authorized(req: IncomingMessage): boolean {
		if (req.headers.origin && !origins.has(req.headers.origin)) return false;
		const url = new URL(req.url ?? '/', 'http://127.0.0.1');
		const supplied =
			req.headers.authorization?.replace(/^Bearer /, '') ?? url.searchParams.get('token') ?? '';
		const value = Buffer.from(supplied);
		const expected = Buffer.from(token);
		return value.length === expected.length && timingSafeEqual(value, expected);
	}

	const middleware: RequestHandler = (req, res, next) => {
		const origin = req.headers.origin;
		if (origin && origins.has(origin)) {
			res.setHeader('Access-Control-Allow-Origin', origin);
			res.setHeader('Vary', 'Origin');
			res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
			if (req.method === 'OPTIONS') {
				res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE');
				res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
				res.status(204).end();
				return;
			}
		}
		if (!authorized(req)) {
			res.status(403).json({ error: 'Desktop session required' });
			return;
		}
		next();
	};
	return { authorized, middleware };
}
