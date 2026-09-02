import type { TemplateFile, TemplateInfo } from '../shared/types';
import { HttpError, shellQuote } from './http';
import type { Session } from './session';

const TEMPLATE_DIR = '/usr/share/remarkable/templates';
const FILENAME = /^[A-Za-z0-9 _.()+-]+$/;

interface RawTemplate {
	name: string;
	filename: string;
	iconCode?: string;
	categories?: string[];
	landscape?: boolean;
}

export async function listTemplates(session: Session): Promise<TemplateInfo[]> {
	const [data, listing] = await Promise.all([
		session.readFile(`${TEMPLATE_DIR}/templates.json`).catch(() => {
			throw new HttpError(404, 'This device has no templates.json');
		}),
		session.exec(`ls ${shellQuote(TEMPLATE_DIR)}`)
	]);
	const files = new Set(listing.stdout.toString('utf8').split('\n'));
	const parsed = JSON.parse(data.toString('utf8')) as { templates: RawTemplate[] };
	return parsed.templates.map((template) => ({
		name: template.name,
		filename: template.filename,
		iconCode: template.iconCode ?? '',
		categories: template.categories ?? [],
		landscape: Boolean(template.landscape),
		file:
			(['template', 'svg', 'png'] as TemplateFile[]).find((ext) =>
				files.has(`${template.filename}.${ext}`)
			) ?? null
	}));
}

export async function templateFile(
	session: Session,
	filename: string,
	ext: TemplateFile
): Promise<Buffer> {
	if (!FILENAME.test(filename)) throw new HttpError(400, 'Invalid template name');
	return session.readFile(`${TEMPLATE_DIR}/${filename}.${ext}`);
}
