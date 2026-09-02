import { evaluate, type Scope } from './expression';

type Expr = string | number;

interface BoundingBox {
	x: Expr;
	y: Expr;
	width: Expr;
	height: Expr;
}

interface Repeat {
	rows?: Expr;
	columns?: Expr;
}

interface GroupItem {
	type: 'group';
	boundingBox: BoundingBox;
	repeat?: Repeat;
	children: TemplateItem[];
}

interface PathItem {
	type: 'path';
	data: Expr[];
	strokeWidth?: Expr;
	strokeColor?: string;
	fillColor?: string;
}

interface TextItem {
	type: 'text';
	text: string;
	fontSize: Expr;
	position: { x: Expr; y: Expr };
}

export type TemplateItem = GroupItem | PathItem | TextItem;

export interface TemplateDocument {
	name: string;
	orientation?: 'portrait' | 'landscape';
	constants?: Record<string, Expr>[];
	items: TemplateItem[];
}

const measureCanvas = typeof document === 'undefined' ? null : document.createElement('canvas');

function textWidth(text: string, fontSize: number): number {
	const context = measureCanvas?.getContext('2d');
	if (!context) return text.length * fontSize * 0.55;
	context.font = `${fontSize}px sans-serif`;
	return context.measureText(text).width;
}

function fmt(value: number): string {
	return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function escapeXml(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function safeColor(value: string | undefined, fallback: string): string {
	return value && /^#[0-9a-f]{3,8}$/i.test(value) ? value : fallback;
}

function tileOffsets(
	mode: Expr | undefined,
	start: number,
	size: number,
	limit: number,
	scope: Scope
): number[] {
	if (mode === undefined || size <= 0) return [0];
	if (
		mode === 'infinite' ||
		mode === 'down' ||
		mode === 'right' ||
		mode === 'up' ||
		mode === 'left'
	) {
		const offsets: number[] = [];
		const forward = mode !== 'up' && mode !== 'left';
		const backward = mode !== 'down' && mode !== 'right';
		if (forward) for (let k = 0; start + k * size < limit && k < 10000; k++) offsets.push(k);
		if (backward)
			for (let k = forward ? -1 : 0; start + (k + 1) * size > 0 && k > -10000; k--) offsets.push(k);
		return offsets;
	}
	const count = Math.max(0, Math.floor(evaluate(mode, scope)));
	return Array.from({ length: Math.min(count, 10000) }, (_, k) => k);
}

function pathData(data: Expr[], scope: Scope): string {
	return data
		.map((part) =>
			typeof part === 'string' && /^[A-Za-z]$/.test(part) ? part : fmt(evaluate(part, scope))
		)
		.join(' ');
}

function renderItems(items: TemplateItem[], scope: Scope, width: number, height: number): string {
	let output = '';
	for (const item of items) {
		if (item.type === 'group') {
			const x = evaluate(item.boundingBox.x, scope);
			const y = evaluate(item.boundingBox.y, scope);
			const boxWidth = evaluate(item.boundingBox.width, scope);
			const boxHeight = evaluate(item.boundingBox.height, scope);
			const inner: Scope = { ...scope, parentWidth: boxWidth, parentHeight: boxHeight };
			const children = renderItems(item.children ?? [], inner, width, height);
			if (!children) continue;
			const columns = tileOffsets(item.repeat?.columns, x, boxWidth, width, scope);
			const rows = tileOffsets(item.repeat?.rows, y, boxHeight, height, scope);
			for (const row of rows) {
				for (const column of columns) {
					output += `<g transform="translate(${fmt(x + column * boxWidth)},${fmt(y + row * boxHeight)})">${children}</g>`;
				}
			}
		} else if (item.type === 'path') {
			const fill = item.fillColor ? safeColor(item.fillColor, '#000') : 'none';
			const strokeWidth = item.strokeWidth !== undefined ? evaluate(item.strokeWidth, scope) : 1;
			const stroke =
				item.strokeColor || item.strokeWidth !== undefined || !item.fillColor
					? safeColor(item.strokeColor, '#000')
					: 'none';
			output += `<path d="${pathData(item.data, scope)}" fill="${fill}" stroke="${stroke}" stroke-width="${fmt(strokeWidth)}"/>`;
		} else if (item.type === 'text') {
			const fontSize = evaluate(item.fontSize, scope);
			const inner: Scope = { ...scope, textWidth: textWidth(item.text, fontSize) };
			const x = evaluate(item.position.x, inner);
			const y = evaluate(item.position.y, inner);
			output += `<text x="${fmt(x)}" y="${fmt(y)}" font-size="${fmt(fontSize)}" font-family="sans-serif" fill="#000" dominant-baseline="text-before-edge">${escapeXml(item.text)}</text>`;
		}
	}
	return output;
}

export function renderTemplate(template: TemplateDocument, width: number, height: number): string {
	const scope: Scope = {
		templateWidth: width,
		templateHeight: height,
		paperOriginX: 0,
		paperOriginY: 0,
		parentWidth: width,
		parentHeight: height
	};
	for (const constant of template.constants ?? []) {
		for (const [name, expression] of Object.entries(constant))
			scope[name] = evaluate(expression, scope);
	}
	return renderItems(template.items, scope, width, height);
}

export function templateSvg(template: TemplateDocument, width: number, height: number): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#fff"/>${renderTemplate(template, width, height)}</svg>`;
}
