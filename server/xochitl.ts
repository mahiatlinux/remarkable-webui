import { randomUUID } from 'node:crypto';
import type { DocumentDetail, DocumentPage, LibraryItem, LibraryItemType } from '../shared/types';
import { HttpError, shellQuote } from './http';
import type { Session } from './session';

export const XOCHITL_DIR = '/home/root/.local/share/remarkable/xochitl';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RS = '\x1e';
const US = '\x1f';

interface Metadata {
	visibleName: string;
	type: 'DocumentType' | 'CollectionType' | 'TemplateType';
	parent: string;
	pinned: boolean;
	deleted: boolean;
	lastModified: string;
	lastOpened?: string;
	lastOpenedPage?: number;
	metadatamodified?: boolean;
	modified?: boolean;
	synced?: boolean;
	version?: number;
	createdTime?: string;
}

interface ContentPage {
	id: string;
	template?: { value: string };
	redir?: { value: number };
	deleted?: boolean | { value?: number };
}

interface Content {
	fileType?: string;
	pageCount?: number;
	pages?: string[];
	cPages?: { pages: ContentPage[] };
	redirectionPageMap?: number[];
	coverPageNumber?: number;
	orientation?: string;
	tags?: { name: string }[];
}

export function assertId(id: string): string {
	if (!UUID.test(id)) throw new HttpError(400, 'Invalid document id');
	return id;
}

export function assertParent(parent: string): string {
	if (parent === '' || parent === 'trash') return parent;
	return assertId(parent);
}

function itemType(meta: Metadata, content: Content | undefined): LibraryItemType {
	if (meta.type === 'CollectionType') return 'folder';
	const fileType = content?.fileType;
	return fileType === 'pdf' || fileType === 'epub' ? fileType : 'notebook';
}

function livePages(content: Content): ContentPage[] {
	if (content.cPages) {
		return content.cPages.pages.filter((page) => {
			const deleted = page.deleted;
			return !(deleted === true || (typeof deleted === 'object' && deleted?.value));
		});
	}
	return (content.pages ?? []).map((id) => ({ id }));
}

function toItem(
	id: string,
	meta: Metadata,
	content: Content | undefined,
	sizeKb: number
): LibraryItem {
	const pages = content ? livePages(content) : [];
	const currentPage = meta.lastOpenedPage ?? 0;
	const cover = content?.coverPageNumber ?? 0;
	const coverIndex = cover >= 0 ? cover : currentPage;
	return {
		id,
		name: meta.visibleName,
		type: itemType(meta, content),
		parent: meta.parent ?? '',
		pinned: Boolean(meta.pinned),
		lastModified: Number(meta.lastModified) || 0,
		lastOpened: Number(meta.lastOpened) || 0,
		pageCount: pages.length || content?.pageCount || 0,
		currentPage,
		coverPageId: pages[coverIndex]?.id ?? pages[0]?.id ?? null,
		tags: content?.tags?.map((tag) => tag.name) ?? [],
		sizeKb
	};
}

export async function listLibrary(session: Session): Promise<LibraryItem[]> {
	const command = `cd ${shellQuote(XOCHITL_DIR)} && for f in *.metadata *.content; do [ -f "$f" ] || continue; printf '\\036%s\\037' "$f"; cat "$f"; done; printf '\\036du\\037'; du -sk -- * 2>/dev/null; true`;
	const result = await session.exec(command);
	const metadata = new Map<string, Metadata>();
	const contents = new Map<string, Content>();
	const sizes = new Map<string, number>();
	for (const record of result.stdout.toString('utf8').split(RS).slice(1)) {
		const separator = record.indexOf(US);
		const name = record.slice(0, separator);
		const body = record.slice(separator + 1);
		if (name === 'du') {
			for (const line of body.split('\n')) {
				const [size, entry] = line.split('\t');
				if (!entry) continue;
				const id = entry.split('.')[0];
				sizes.set(id, (sizes.get(id) ?? 0) + Number(size));
			}
			continue;
		}
		const dot = name.lastIndexOf('.');
		const id = name.slice(0, dot);
		const ext = name.slice(dot + 1);
		try {
			const parsed = JSON.parse(body);
			if (ext === 'metadata') metadata.set(id, parsed);
			else contents.set(id, parsed);
		} catch {
			continue;
		}
	}
	const items: LibraryItem[] = [];
	for (const [id, meta] of metadata) {
		if (meta.deleted || meta.type === 'TemplateType' || !UUID.test(id)) continue;
		items.push(toItem(id, meta, contents.get(id), sizes.get(id) ?? 0));
	}
	return items;
}

async function readJson<T>(session: Session, path: string): Promise<T> {
	const data = await session.readFile(path);
	try {
		return JSON.parse(data.toString('utf8')) as T;
	} catch {
		throw new HttpError(502, `Corrupt JSON at ${path}`);
	}
}

function writeJson(session: Session, path: string, value: unknown) {
	return session.writeFile(path, JSON.stringify(value, null, 4) + '\n');
}

export function paperSizeFor(machine: string | undefined, landscape: boolean): [number, number] {
	const size: [number, number] = machine?.toLowerCase().includes('ferrari')
		? [1620, 2160]
		: [1404, 1872];
	return landscape ? [size[1], size[0]] : size;
}

export async function getDocument(session: Session, id: string): Promise<DocumentDetail> {
	assertId(id);
	const [meta, content, listing] = await Promise.all([
		readJson<Metadata>(session, `${XOCHITL_DIR}/${id}.metadata`),
		readJson<Content>(session, `${XOCHITL_DIR}/${id}.content`),
		session.exec(`ls ${shellQuote(`${XOCHITL_DIR}/${id}`)} 2>/dev/null; true`)
	]);
	const lines = new Set(listing.stdout.toString('utf8').split('\n'));
	const item = toItem(id, meta, content, 0);
	const pages = livePages(content).map((page, index): DocumentPage => ({
		id: page.id,
		template: page.template?.value ?? null,
		hasLines: lines.has(`${page.id}.rm`),
		pdfPage:
			item.type !== 'pdf'
				? null
				: content.cPages
					? (page.redir?.value ?? null)
					: content.redirectionPageMap
						? content.redirectionPageMap[index] >= 0
							? content.redirectionPageMap[index]
							: null
						: index
	}));
	const orientation = content.orientation === 'landscape' ? 'landscape' : 'portrait';
	return {
		item,
		pages,
		orientation,
		currentPage: Math.min(item.currentPage, Math.max(pages.length - 1, 0)),
		paperSize: paperSizeFor(session.machine, orientation === 'landscape')
	};
}

export async function readPageLines(session: Session, id: string, pageId: string): Promise<Buffer> {
	return session.readFile(`${XOCHITL_DIR}/${assertId(id)}/${assertId(pageId)}.rm`);
}

export async function readThumbnail(
	session: Session,
	id: string,
	pageId: string
): Promise<{ data: Buffer; type: string }> {
	const base = `${XOCHITL_DIR}/${assertId(id)}.thumbnails/${assertId(pageId)}`;
	try {
		return { data: await session.readFile(`${base}.png`), type: 'image/png' };
	} catch {
		return { data: await session.readFile(`${base}.jpg`), type: 'image/jpeg' };
	}
}

export async function documentFile(
	session: Session,
	id: string
): Promise<{ path: string; type: string; size: number }> {
	assertId(id);
	const content = await readJson<Content>(session, `${XOCHITL_DIR}/${id}.content`);
	if (content.fileType !== 'pdf' && content.fileType !== 'epub') {
		throw new HttpError(404, 'Document has no source file');
	}
	const path = `${XOCHITL_DIR}/${id}.${content.fileType}`;
	const sftp = await session.sftp();
	const size = await new Promise<number>((resolve, reject) => {
		sftp.stat(path, (error, stats) =>
			error ? reject(new HttpError(404, 'Source file missing')) : resolve(stats.size)
		);
	});
	return {
		path,
		type: content.fileType === 'pdf' ? 'application/pdf' : 'application/epub+zip',
		size
	};
}

async function patchMetadata(session: Session, id: string, patch: Partial<Metadata>) {
	const path = `${XOCHITL_DIR}/${assertId(id)}.metadata`;
	const meta = await readJson<Metadata>(session, path);
	await writeJson(session, path, {
		...meta,
		...patch,
		lastModified: String(Date.now()),
		metadatamodified: true,
		synced: false
	});
}

export async function renameItem(session: Session, id: string, name: string) {
	await patchMetadata(session, id, { visibleName: name });
	session.scheduleRestart();
}

export async function moveItems(session: Session, ids: string[], parent: string) {
	assertParent(parent);
	for (const id of ids) await patchMetadata(session, id, { parent });
	session.scheduleRestart();
}

export async function setPinned(session: Session, id: string, pinned: boolean) {
	await patchMetadata(session, id, { pinned });
	session.scheduleRestart();
}

export async function purgeItems(session: Session, ids: string[]) {
	const targets = ids
		.map(assertId)
		.flatMap((id) => [
			shellQuote(`${XOCHITL_DIR}/${id}`),
			shellQuote(`${XOCHITL_DIR}/${id}.`) + '*'
		]);
	await session.exec(`rm -rf -- ${targets.join(' ')}`);
	session.scheduleRestart();
}

function newMetadata(name: string, parent: string, type: Metadata['type']): Metadata {
	const now = String(Date.now());
	return {
		createdTime: now,
		deleted: false,
		lastModified: now,
		lastOpened: '0',
		lastOpenedPage: 0,
		metadatamodified: false,
		modified: false,
		parent,
		pinned: false,
		synced: false,
		type,
		version: 0,
		visibleName: name
	};
}

export async function createFolder(
	session: Session,
	name: string,
	parent: string
): Promise<string> {
	const id = randomUUID();
	await writeJson(
		session,
		`${XOCHITL_DIR}/${id}.metadata`,
		newMetadata(name, assertParent(parent), 'CollectionType')
	);
	await writeJson(session, `${XOCHITL_DIR}/${id}.content`, { tags: [] });
	session.scheduleRestart();
	return id;
}

const TEMPLATE_NAME = /^[A-Za-z0-9 _.()+-]+$/;

export async function createNotebook(
	session: Session,
	name: string,
	parent: string,
	template: string,
	landscape: boolean
): Promise<string> {
	if (!TEMPLATE_NAME.test(template)) throw new HttpError(400, 'Invalid template name');
	const id = randomUUID();
	const pageId = randomUUID();
	const [width, height] = paperSizeFor(session.machine, false);
	await writeJson(
		session,
		`${XOCHITL_DIR}/${id}.metadata`,
		newMetadata(name, assertParent(parent), 'DocumentType')
	);
	await writeJson(session, `${XOCHITL_DIR}/${id}.content`, {
		cPages: {
			lastOpened: { timestamp: '1:1', value: pageId },
			original: { timestamp: '1:1', value: -1 },
			pages: [
				{
					id: pageId,
					idx: { timestamp: '1:2', value: 'ba' },
					template: { timestamp: '1:2', value: template }
				}
			],
			uuids: [{ first: randomUUID(), second: 1 }]
		},
		coverPageNumber: -1,
		customZoomCenterX: 0,
		customZoomCenterY: height / 2,
		customZoomOrientation: landscape ? 'landscape' : 'portrait',
		customZoomPageHeight: height,
		customZoomPageWidth: width,
		customZoomScale: 1,
		documentMetadata: {},
		extraMetadata: {},
		fileType: 'notebook',
		fontName: '',
		formatVersion: 2,
		lineHeight: -1,
		orientation: landscape ? 'landscape' : 'portrait',
		pageCount: 1,
		pageTags: [],
		sizeInBytes: '0',
		tags: [],
		textAlignment: 'justify',
		textScale: 1,
		zoomMode: 'bestFit'
	});
	await writeJson(session, `${XOCHITL_DIR}/${id}.local`, { contentFormatVersion: 2 });
	session.scheduleRestart();
	return id;
}
