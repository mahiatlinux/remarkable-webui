import { END_MARKER, RmReader, TAG, idKey, type CrdtId } from './reader';

export interface Point {
	x: number;
	y: number;
	speed: number;
	direction: number;
	width: number;
	pressure: number;
}

export type Rgba = [number, number, number, number];

export interface Line {
	kind: 'line';
	tool: number;
	color: number;
	rgba: Rgba | null;
	thickness: number;
	points: Point[];
}

export interface GlyphRange {
	kind: 'glyph';
	color: number;
	rgba: Rgba | null;
	text: string;
	rects: { x: number; y: number; w: number; h: number }[];
}

export interface Group {
	kind: 'group';
	id: string;
	label: string;
	visible: boolean;
	anchorId: string | null;
	anchorOriginX: number;
	children: SeqItem<SceneItem>[];
}

export type SceneItem = Line | GlyphRange | Group;

export interface SeqItem<T> {
	id: string;
	left: string;
	right: string;
	deleted: number;
	value: T | null;
}

export interface TextItem {
	id: string;
	left: string;
	right: string;
	deleted: number;
	value: string | number;
	crdt: CrdtId;
}

export interface RootText {
	items: TextItem[];
	styles: Map<string, number>;
	x: number;
	y: number;
	width: number;
}

export interface Scene {
	root: Group;
	text: RootText | null;
	paperSize: [number, number] | null;
}

const ROOT_ID = '0:1';

function newGroup(id: string): Group {
	return {
		kind: 'group',
		id,
		label: '',
		visible: true,
		anchorId: null,
		anchorOriginX: 0,
		children: []
	};
}

function readPoint(r: RmReader, version: number): Point {
	const x = r.f32();
	const y = r.f32();
	if (version === 1) {
		const speed = r.f32() * 4;
		const direction = (255 * r.f32()) / (Math.PI * 2);
		const width = Math.round(r.f32() * 4);
		const pressure = r.f32() * 255;
		return { x, y, speed, direction, width, pressure };
	}
	const speed = r.u16();
	const width = r.u16();
	const direction = r.u8();
	const pressure = r.u8();
	return { x, y, speed, direction, width, pressure };
}

function readLine(r: RmReader, version: number): Line {
	const tool = r.int(1);
	const color = r.int(2);
	const thickness = r.double(3);
	r.float(4);
	const end = r.subblock(5);
	const pointSize = version === 1 ? 24 : 14;
	const count = Math.floor((end - r.pos) / pointSize);
	const points: Point[] = [];
	r.within(end, () => {
		for (let i = 0; i < count; i++) points.push(readPoint(r, version));
	});
	r.id(6);
	if (r.remaining >= 3 && r.hasTag(7, TAG.ID)) r.id(7);
	const rgba = r.colorOptional(8);
	return { kind: 'line', tool, color, rgba, thickness, points };
}

function readGlyph(r: RmReader): GlyphRange {
	if (r.hasTag(2, TAG.BYTE4)) r.int(2);
	if (r.hasTag(3, TAG.BYTE4)) r.int(3);
	const color = r.int(4);
	const text = r.string(5);
	const rects = r.within(r.subblock(6), () => {
		const count = r.varuint();
		const result = [];
		for (let i = 0; i < count; i++) {
			result.push({ x: r.f64(), y: r.f64(), w: r.f64(), h: r.f64() });
		}
		return result;
	});
	const rgba = r.colorOptional(10);
	return { kind: 'glyph', color, rgba, text, rects };
}

function readTextItem(r: RmReader): TextItem {
	return r.within(r.subblock(0), () => {
		const crdt = r.idRaw(2);
		const left = r.id(3);
		const right = r.id(4);
		const deleted = r.int(5);
		let value: string | number = '';
		if (r.hasSubblock(6)) {
			const [text, format] = r.stringWithFormat(6);
			value = format ?? text;
		}
		return { id: idKey(crdt), left, right, deleted, value, crdt };
	});
}

function readRootText(r: RmReader): RootText {
	r.id(1);
	const items: TextItem[] = [];
	const styles = new Map<string, number>();
	r.within(r.subblock(2), () => {
		r.within(r.subblock(1), () => {
			r.within(r.subblock(1), () => {
				const count = r.varuint();
				for (let i = 0; i < count; i++) items.push(readTextItem(r));
			});
		});
		r.within(r.subblock(2), () => {
			r.within(r.subblock(1), () => {
				const count = r.varuint();
				for (let i = 0; i < count; i++) {
					const charId = idKey(r.crdtId());
					r.id(1);
					const style = r.within(r.subblock(2), () => {
						r.u8();
						return r.u8();
					});
					styles.set(charId, style);
				}
			});
		});
	});
	const [x, y] = r.within(r.subblock(3), () => [r.f64(), r.f64()]);
	const width = r.float(4);
	return { items, styles, x, y, width };
}

export function emptyScene(): Scene {
	return { root: newGroup(ROOT_ID), text: null, paperSize: null };
}

export function parseScene(buffer: ArrayBuffer): Scene {
	const r = new RmReader(buffer);
	r.readHeader();
	const nodes = new Map<string, Group>([[ROOT_ID, newGroup(ROOT_ID)]]);
	const node = (id: string): Group => {
		let group = nodes.get(id);
		if (!group) {
			group = newGroup(id);
			nodes.set(id, group);
		}
		return group;
	};
	let text: RootText | null = null;
	let paperSize: [number, number] | null = null;

	while (r.pos + 8 <= r.length) {
		const length = r.u32();
		r.u8();
		r.u8();
		const version = r.u8();
		const type = r.u8();
		const end = Math.min(r.pos + length, r.length);
		r.within(end, () => {
			try {
				if (type === 0x01) {
					const treeId = r.id(1);
					r.id(2);
					r.bool(3);
					r.within(r.subblock(4), () => r.id(1));
					node(treeId);
				} else if (type === 0x02) {
					const group = node(r.id(1));
					group.label = r.lwwString(2).value;
					group.visible = r.lwwBool(3).value;
					if (r.remaining > 0) {
						group.anchorId = r.lwwId(7).value;
						r.lwwByte(8);
						r.lwwFloat(9);
						group.anchorOriginX = r.lwwFloat(10).value;
					}
				} else if (type >= 0x03 && type <= 0x08 && type !== 0x07) {
					const parentId = r.id(1);
					const item: SeqItem<SceneItem> = {
						id: r.id(2),
						left: r.id(3),
						right: r.id(4),
						deleted: r.int(5),
						value: null
					};
					if (r.hasSubblock(6)) {
						r.within(r.subblock(6), () => {
							const itemType = r.u8();
							if (itemType === 0x01) item.value = readGlyph(r);
							else if (itemType === 0x02) item.value = node(r.id(2));
							else if (itemType === 0x03) item.value = readLine(r, version);
						});
					}
					if (type !== 0x08) node(parentId).children.push(item);
				} else if (type === 0x07) {
					text = readRootText(r);
				} else if (type === 0x0d) {
					r.lwwId(1);
					if (r.hasSubblock(2)) r.lwwBool(2);
					if (r.hasSubblock(3)) r.lwwBool(3);
					if (r.hasSubblock(5)) paperSize = r.intPair(5);
				}
			} catch {
				return;
			}
		});
	}

	return { root: nodes.get(ROOT_ID)!, text, paperSize };
}

function sortKey(id: string): [number, number] {
	const [p1, p2] = id.split(':').map(Number);
	return [-p1, p2];
}

export function orderItems<T extends { id: string; left: string; right: string }>(items: T[]): T[] {
	if (items.length < 2) return items;
	const byId = new Map(items.map((item) => [item.id, item]));
	const START = '__start';
	const END = '__end';
	const side = (id: string, start: boolean) =>
		id === END_MARKER || !byId.has(id) ? (start ? START : END) : id;
	const inDegree = new Map<string, number>([
		[START, 0],
		[END, 0]
	]);
	const dependents = new Map<string, string[]>();
	const push = (from: string, to: string) => {
		inDegree.set(to, (inDegree.get(to) ?? 0) + 1);
		if (!inDegree.has(from)) inDegree.set(from, 0);
		const list = dependents.get(from);
		if (list) list.push(to);
		else dependents.set(from, [to]);
	};
	for (const item of items) {
		push(side(item.left, true), item.id);
		push(item.id, side(item.right, false));
	}
	const compare = (a: string, b: string) => {
		if (a === b) return 0;
		if (a === START || b === END) return -1;
		if (b === START || a === END) return 1;
		const [a1, a2] = sortKey(a);
		const [b1, b2] = sortKey(b);
		return a1 - b1 || a2 - b2;
	};
	const ready = [...inDegree.entries()].filter(([, degree]) => degree === 0).map(([id]) => id);
	const ordered: T[] = [];
	const seen = new Set<string>();
	while (ready.length) {
		ready.sort(compare);
		const current = ready.shift()!;
		const item = byId.get(current);
		if (item) {
			ordered.push(item);
			seen.add(current);
		}
		if (current === END) break;
		for (const dependent of dependents.get(current) ?? []) {
			const degree = inDegree.get(dependent)! - 1;
			inDegree.set(dependent, degree);
			if (degree === 0) ready.push(dependent);
		}
	}
	for (const item of items) if (!seen.has(item.id)) ordered.push(item);
	return ordered;
}
