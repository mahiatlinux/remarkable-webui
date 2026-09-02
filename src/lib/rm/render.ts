import { paragraphs, STYLE, type Paragraph } from './text';
import { orderItems, type Group, type Line, type Point, type Rgba, type Scene } from './scene';

export interface Background {
	href: string;
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface RenderOptions {
	paperSize: [number, number];
	background?: Background | null;
	backgroundMarkup?: string | null;
}

export interface Rendered {
	svg: string;
	minX: number;
	minY: number;
	width: number;
	height: number;
}

const PALETTE: Record<number, Rgba> = {
	0: [0, 0, 0, 255],
	1: [144, 144, 144, 255],
	2: [255, 255, 255, 255],
	3: [251, 247, 25, 255],
	4: [0, 255, 0, 255],
	5: [255, 192, 203, 255],
	6: [78, 105, 201, 255],
	7: [179, 62, 57, 255],
	8: [125, 125, 125, 255],
	9: [251, 247, 25, 255],
	10: [161, 216, 125, 255],
	11: [139, 208, 229, 255],
	12: [183, 130, 205, 255],
	13: [247, 232, 81, 255]
};

const TEXT_TOP_Y = -88;
const LINE_HEIGHT: Record<number, number> = {
	[STYLE.PLAIN]: 70,
	[STYLE.BULLET]: 35,
	[STYLE.BULLET2]: 35,
	[STYLE.BOLD]: 70,
	[STYLE.HEADING]: 150,
	[STYLE.CHECKBOX]: 35,
	[STYLE.CHECKBOX_CHECKED]: 35
};
const FONT_SIZE: Record<number, number> = { [STYLE.HEADING]: 88 };
const TOP_ANCHOR = '0:281474976710654';
const BOTTOM_ANCHOR = '0:281474976710655';

const clamp = (value: number) => Math.min(Math.max(value, 0), 1);
const tilt = (direction: number) => (direction * Math.PI * 2) / 255;

interface Pen {
	segmentLength: number;
	linecap: 'round' | 'square';
	blend: boolean;
	width: (p: Point, last: number) => number;
	color: (p: Point) => string;
	opacity: (p: Point) => number;
}

function rgb(color: Rgba): string {
	return `rgb(${color[0]},${color[1]},${color[2]})`;
}

function penFor(line: Line): Pen {
	const base = line.thickness;
	const color = line.rgba ?? PALETTE[line.color] ?? PALETTE[0];
	const solid = () => rgb(color);
	const one = () => 1;
	const pen: Pen = {
		segmentLength: 1000,
		linecap: 'round',
		blend: false,
		width: () => base,
		color: solid,
		opacity: one
	};
	switch (line.tool) {
		case 0:
		case 12:
			return {
				...pen,
				segmentLength: 2,
				width: (p) =>
					0.7 *
					((1 + (1.4 * p.pressure) / 255) * (p.width / 4) -
						0.5 * tilt(p.direction) -
						p.speed / 4 / 50),
				color: (p) => {
					const intensity = clamp(((p.pressure / 255) ** 1.5 - 0.2 * (p.speed / 4 / 50)) * 1.5);
					const rev = Math.abs(intensity - 1);
					return rgb([
						Math.round(rev * (255 - color[0])),
						Math.round(rev * (255 - color[1])),
						Math.round(rev * (255 - color[2])),
						255
					]);
				}
			};
		case 21:
			return {
				...pen,
				segmentLength: 2,
				width: (p, last) =>
					0.9 * ((1 + p.pressure / 255) * (p.width / 4) - 0.3 * tilt(p.direction)) + 0.1 * last
			};
		case 3:
		case 16:
			return {
				...pen,
				segmentLength: 3,
				width: (p, last) => 0.9 * (p.width / 4 - 0.4 * tilt(p.direction)) + 0.1 * last
			};
		case 2:
		case 15:
			return {
				...pen,
				segmentLength: 5,
				width: (p) => 0.5 + p.pressure / 255 + p.width / 4 - 0.5 * (p.speed / 4 / 50),
				color: (p) => {
					const intensity = clamp(0.1 * -(p.speed / 4 / 35) + (1.2 * p.pressure) / 255 + 0.5);
					const shade = Math.min(Math.round(Math.abs(intensity - 1) * 255), 60);
					return line.color === 0 && !line.rgba ? `rgb(${shade},${shade},${shade})` : solid();
				}
			};
		case 4:
		case 17:
			return { ...pen, width: () => base * 1.8 };
		case 1:
		case 14:
			return {
				...pen,
				segmentLength: 2,
				width: (p) =>
					Math.min(
						0.7 *
							((0.8 * base + (0.5 * p.pressure) / 255) * (p.width / 4) -
								0.25 * tilt(p.direction) ** 1.8 -
								(0.6 * (p.speed / 4)) / 50),
						base * 10
					),
				opacity: (p) => clamp(0.1 * -(p.speed / 4 / 35) + p.pressure / 255) - 0.1
			};
		case 7:
		case 13:
			return { ...pen, width: () => base ** 2, opacity: () => 0.7 };
		case 5:
		case 18:
			return { ...pen, linecap: 'square', blend: true, width: () => 15, opacity: () => 0.9 };
		case 23:
			return { ...pen, blend: true, width: () => 12, opacity: () => 0.35 };
		case 6:
			return { ...pen, linecap: 'square', width: () => base * 2, color: () => 'rgb(255,255,255)' };
		case 8:
			return { ...pen, linecap: 'square', opacity: () => 0 };
		default:
			return pen;
	}
}

function fmt(value: number): string {
	return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function strokeSvg(line: Line): string {
	if (line.points.length === 0) return '';
	const pen = penFor(line);
	const parts: string[] = [];
	let segment: string[] = [];
	let lastWidth = 0;
	let currentStyle = '';
	const flush = () => {
		if (segment.length > 1 || (segment.length === 1 && parts.length === 0)) {
			parts.push(`<polyline ${currentStyle} points="${segment.join(' ')}"/>`);
		}
	};
	line.points.forEach((point, index) => {
		if (index % pen.segmentLength === 0) {
			const previous = segment[segment.length - 1];
			flush();
			const width = Math.max(pen.width(point, lastWidth), 0.3);
			lastWidth = width;
			const blend = pen.blend ? ' style="mix-blend-mode:multiply"' : '';
			currentStyle = `fill="none" stroke="${pen.color(point)}" stroke-width="${fmt(width)}" stroke-opacity="${fmt(clamp(pen.opacity(point)))}" stroke-linecap="${pen.linecap}" stroke-linejoin="round"${blend}`;
			segment = previous ? [previous] : [];
		}
		segment.push(`${fmt(point.x)},${fmt(point.y)}`);
	});
	flush();
	if (line.points.length === 1) {
		const point = line.points[0];
		const width = Math.max(pen.width(point, 0), 0.3);
		return `<circle cx="${fmt(point.x)}" cy="${fmt(point.y)}" r="${fmt(width / 2)}" fill="${pen.color(point)}" fill-opacity="${fmt(clamp(pen.opacity(point)))}"/>`;
	}
	return parts.join('');
}

function escapeXml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

interface TextLayout {
	anchors: Map<string, number>;
	svg: string;
	bottom: number;
}

function wrapRuns(paragraph: Paragraph, maxChars: number): Paragraph['runs'][] {
	const lines: Paragraph['runs'][] = [[]];
	let count = 0;
	for (const run of paragraph.runs) {
		for (const word of run.text.split(/(\s+)/)) {
			if (!word) continue;
			if (count + word.length > maxChars && count > 0 && !/^\s+$/.test(word)) {
				lines.push([]);
				count = 0;
			}
			const line = lines[lines.length - 1];
			const last = line[line.length - 1];
			if (last && last.bold === run.bold && last.italic === run.italic) last.text += word;
			else line.push({ text: word, bold: run.bold, italic: run.italic });
			count += word.length;
		}
	}
	return lines;
}

function layoutText(scene: Scene, paperHeight: number): TextLayout {
	const anchors = new Map<string, number>();
	if (!scene.text) {
		anchors.set(TOP_ANCHOR, 0);
		anchors.set(BOTTOM_ANCHOR, paperHeight);
		return { anchors, svg: '', bottom: 0 };
	}
	const text = scene.text;
	const parts: string[] = [];
	let y = text.y + TEXT_TOP_Y;
	anchors.set(TOP_ANCHOR, y);
	for (const paragraph of paragraphs(text)) {
		const lineHeight = LINE_HEIGHT[paragraph.style] ?? 70;
		const fontSize = FONT_SIZE[paragraph.style] ?? 44;
		anchors.set(paragraph.startId, y);
		for (const id of paragraph.charIds) anchors.set(id, y);
		const prefix =
			paragraph.style === STYLE.BULLET || paragraph.style === STYLE.BULLET2
				? '• '
				: paragraph.style === STYLE.CHECKBOX
					? '☐ '
					: paragraph.style === STYLE.CHECKBOX_CHECKED
						? '☑ '
						: '';
		const indent = paragraph.style === STYLE.BULLET2 ? 60 : 0;
		const lines = wrapRuns(
			paragraph,
			Math.max(8, Math.floor((text.width - indent) / (fontSize * 0.5)))
		);
		lines.forEach((runs, index) => {
			const baseline = y + lineHeight * 0.75;
			const weight =
				paragraph.style === STYLE.HEADING || paragraph.style === STYLE.BOLD ? 'bold' : 'normal';
			const spans = runs
				.map(
					(run) =>
						`<tspan font-weight="${run.bold ? 'bold' : weight}" font-style="${run.italic ? 'italic' : 'normal'}">${escapeXml(run.text)}</tspan>`
				)
				.join('');
			parts.push(
				`<text x="${fmt(text.x + indent)}" y="${fmt(baseline)}" font-size="${fontSize}" font-family="sans-serif" fill="#000">${index === 0 ? escapeXml(prefix) : ''}${spans}</text>`
			);
			y += lineHeight;
		});
		if (lines.length === 0) y += lineHeight;
	}
	anchors.set(BOTTOM_ANCHOR, y);
	return { anchors, svg: parts.join(''), bottom: y };
}

interface Bounds {
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
}

function groupOffset(group: Group, anchors: Map<string, number>): [number, number] {
	if (!group.anchorId) return [0, 0];
	return [group.anchorOriginX, anchors.get(group.anchorId) ?? 0];
}

function extend(
	bounds: Bounds,
	group: Group,
	anchors: Map<string, number>,
	dx: number,
	dy: number
) {
	const [ax, ay] = groupOffset(group, anchors);
	for (const child of group.children) {
		if (!child.value || child.deleted > 0) continue;
		if (child.value.kind === 'group') extend(bounds, child.value, anchors, dx + ax, dy + ay);
		else if (child.value.kind === 'line') {
			for (const point of child.value.points) {
				bounds.minX = Math.min(bounds.minX, point.x + dx + ax);
				bounds.maxX = Math.max(bounds.maxX, point.x + dx + ax);
				bounds.minY = Math.min(bounds.minY, point.y + dy + ay);
				bounds.maxY = Math.max(bounds.maxY, point.y + dy + ay);
			}
		}
	}
}

function groupSvg(group: Group, anchors: Map<string, number>): string {
	const [ax, ay] = groupOffset(group, anchors);
	const children = orderItems(group.children)
		.map((child) => {
			if (!child.value || child.deleted > 0) return '';
			if (child.value.kind === 'group') return groupSvg(child.value, anchors);
			if (child.value.kind === 'line') return strokeSvg(child.value);
			const color = rgb(child.value.rgba ?? PALETTE[child.value.color] ?? PALETTE[9]);
			return child.value.rects
				.map(
					(rect) =>
						`<rect x="${fmt(rect.x)}" y="${fmt(rect.y)}" width="${fmt(rect.w)}" height="${fmt(rect.h)}" fill="${color}" fill-opacity="0.9" style="mix-blend-mode:multiply"/>`
				)
				.join('');
		})
		.join('');
	const transform = ax || ay ? ` transform="translate(${fmt(ax)},${fmt(ay)})"` : '';
	const hidden = group.visible ? '' : ' display="none"';
	return `<g${transform}${hidden}>${children}</g>`;
}

export function renderScene(scene: Scene, options: RenderOptions): Rendered {
	const [paperWidth, paperHeight] = scene.paperSize ?? options.paperSize;
	const text = layoutText(scene, paperHeight);
	const bounds: Bounds = {
		minX: -paperWidth / 2,
		maxX: paperWidth / 2,
		minY: 0,
		maxY: Math.max(paperHeight, text.bottom)
	};
	extend(bounds, scene.root, text.anchors, 0, 0);
	const minX = Math.floor(bounds.minX);
	const minY = Math.floor(bounds.minY);
	const width = Math.ceil(bounds.maxX) - minX;
	const height = Math.ceil(bounds.maxY) - minY;
	const background = options.background
		? `<image href="${options.background.href}" x="${fmt(options.background.x)}" y="${fmt(options.background.y)}" width="${fmt(options.background.width)}" height="${fmt(options.background.height)}" preserveAspectRatio="none"/>`
		: options.backgroundMarkup
			? `<g transform="translate(${fmt(-paperWidth / 2)},0)">${options.backgroundMarkup}</g>`
			: '';
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" width="${width}" height="${height}"><rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="#fff"/>${background}${text.svg}${groupSvg(scene.root, text.anchors)}</svg>`;
	return { svg, minX, minY, width, height };
}
