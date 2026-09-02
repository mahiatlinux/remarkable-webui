import type { Request } from 'express';

export class HttpError extends Error {
	status: number;
	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

export function queryString(req: Request, name: string): string {
	const value = req.query[name];
	if (typeof value !== 'string' || !value)
		throw new HttpError(400, `Missing query parameter: ${name}`);
	return value;
}

export function bodyString(body: unknown, name: string): string {
	const value = (body as Record<string, unknown> | null)?.[name];
	if (typeof value !== 'string' || !value) throw new HttpError(400, `Missing field: ${name}`);
	return value;
}

export function bodyStringArray(body: unknown, name: string): string[] {
	const value = (body as Record<string, unknown> | null)?.[name];
	if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
		throw new HttpError(400, `Missing field: ${name}`);
	}
	return value;
}

export function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function contentDisposition(filename: string): string {
	const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
	return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
