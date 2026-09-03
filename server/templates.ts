import { randomUUID } from 'node:crypto';
import type { TemplateFile, TemplateInfo, TemplateInput } from '../shared/types';
import { HttpError, shellQuote } from './http';
import type { Session } from './session';
import { XOCHITL_DIR } from './xochitl';

const TEMPLATE_DIR = '/usr/share/remarkable/templates';
const FILENAME = /^[A-Za-z0-9 _.()+-]+$/;
const STEM = /^[A-Za-z0-9_-]+$/;
const RS = '\x1e';
const US = '\x1f';
const SUPPORTED_SCREENS = ['rm2', 'rmPP'];

interface RawTemplate {
	name: string;
	filename: string;
	iconCode?: string;
	categories?: string[];
	landscape?: boolean;
}

interface TemplateSource {
	name?: unknown;
	categories?: unknown;
	labels?: unknown;
	orientation?: unknown;
	items?: unknown;
}

function assertStem(id: string): string {
	if (!STEM.test(id)) throw new HttpError(400, 'Invalid template id');
	return id;
}

function stringList(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : [];
}

function parseSource(source: string): TemplateSource {
	let parsed: unknown;
	try {
		parsed = JSON.parse(source);
	} catch {
		throw new HttpError(400, 'Template is not valid JSON');
	}
	if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as TemplateSource).items)) {
		throw new HttpError(400, "Template needs an 'items' array");
	}
	return parsed as TemplateSource;
}

async function listSystem(session: Session): Promise<TemplateInfo[]> {
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

async function listCustom(session: Session): Promise<TemplateInfo[]> {
	const command = `cd ${shellQuote(XOCHITL_DIR)} && grep -l '"TemplateType"' -- *.metadata 2>/dev/null | while IFS= read -r f; do id="\${f%.metadata}"; printf '\\036%s\\037' "$id"; cat -- "$id.template" 2>/dev/null; done; true`;
	const result = await session.exec(command);
	const items: TemplateInfo[] = [];
	for (const record of result.stdout.toString('utf8').split(RS).slice(1)) {
		const separator = record.indexOf(US);
		const id = record.slice(0, separator);
		try {
			const doc = JSON.parse(record.slice(separator + 1)) as TemplateSource;
			items.push({
				id,
				name: typeof doc.name === 'string' && doc.name ? doc.name : id,
				filename: id,
				iconCode: '',
				categories: stringList(doc.categories),
				landscape: doc.orientation === 'landscape',
				file: 'template'
			});
		} catch {
			continue;
		}
	}
	return items;
}

export async function listTemplates(session: Session): Promise<TemplateInfo[]> {
	const [system, custom] = await Promise.all([listSystem(session), listCustom(session)]);
	return [...system, ...custom];
}

export async function templateFile(
	session: Session,
	filename: string,
	ext: TemplateFile
): Promise<Buffer> {
	if (!FILENAME.test(filename)) throw new HttpError(400, 'Invalid template name');
	return session.readFile(`${TEMPLATE_DIR}/${filename}.${ext}`);
}

export function customTemplateFile(session: Session, id: string): Promise<Buffer> {
	return session.readFile(`${XOCHITL_DIR}/${assertStem(id)}.template`);
}

async function assertCustom(session: Session, id: string) {
	const data = await session.readFile(`${XOCHITL_DIR}/${assertStem(id)}.metadata`);
	if (!/"TemplateType"/.test(data.toString('utf8'))) {
		throw new HttpError(404, 'Not a custom template');
	}
}

export async function addTemplate(session: Session, input: TemplateInput): Promise<TemplateInfo> {
	const doc = parseSource(input.source);
	const name = input.name.trim();
	if (!name) throw new HttpError(400, 'Template name is required');
	const categories = input.categories.length ? input.categories : ['Custom'];
	const labels = stringList(doc.labels);
	const id = randomUUID();
	const now = String(Date.now());
	const source = {
		author: 'remarkable-webui',
		templateVersion: '1.0.0',
		supportedScreens: SUPPORTED_SCREENS,
		...doc,
		name,
		formatVersion: 1,
		categories,
		labels: labels.length ? labels : categories,
		orientation: input.landscape ? 'landscape' : 'portrait'
	};
	await session.writeFile(`${XOCHITL_DIR}/${id}.template`, JSON.stringify(source, null, 4) + '\n');
	await session.writeFile(`${XOCHITL_DIR}/${id}.content`, '{}\n');
	await session.writeFile(
		`${XOCHITL_DIR}/${id}.metadata`,
		JSON.stringify(
			{
				createdTime: now,
				lastModified: now,
				new: true,
				parent: '',
				pinned: false,
				source: 'remarkable-webui',
				type: 'TemplateType',
				visibleName: name
			},
			null,
			4
		) + '\n'
	);
	session.scheduleRestart();
	return {
		id,
		name,
		filename: id,
		iconCode: '',
		categories,
		landscape: input.landscape,
		file: 'template'
	};
}

export async function updateTemplate(session: Session, id: string, source: string) {
	const doc = parseSource(source);
	await assertCustom(session, id);
	await session.writeFile(`${XOCHITL_DIR}/${id}.template`, JSON.stringify(doc, null, 4) + '\n');
	session.scheduleRestart();
}

export async function removeTemplate(session: Session, id: string) {
	await assertCustom(session, id);
	await session.exec(
		`rm -rf -- ${shellQuote(`${XOCHITL_DIR}/${id}`)} ${shellQuote(`${XOCHITL_DIR}/${id}.`)}*`
	);
	session.scheduleRestart();
}
