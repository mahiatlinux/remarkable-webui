import type { Request } from 'express';
import { getSession, type Session } from '../session';

export function session(req: Request): Session {
	return getSession((req.params as { id: string }).id);
}
