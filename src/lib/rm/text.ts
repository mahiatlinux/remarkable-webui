import { END_MARKER } from './reader';
import { orderItems, type RootText } from './scene';

export const STYLE = {
	BASIC: 0,
	PLAIN: 1,
	HEADING: 2,
	BOLD: 3,
	BULLET: 4,
	BULLET2: 5,
	CHECKBOX: 6,
	CHECKBOX_CHECKED: 7
} as const;

export interface TextRun {
	text: string;
	bold: boolean;
	italic: boolean;
}

export interface Paragraph {
	startId: string;
	style: number;
	runs: TextRun[];
	charIds: string[];
}

interface CharItem {
	id: string;
	left: string;
	right: string;
	value: string | number;
}

function expand(text: RootText): CharItem[] {
	const chars: CharItem[] = [];
	for (const item of text.items) {
		if (typeof item.value === 'number') {
			chars.push({ id: item.id, left: item.left, right: item.right, value: item.value });
			continue;
		}
		const values = item.deleted > 0 ? Array<string>(item.deleted).fill('') : [...item.value];
		if (values.length === 0) continue;
		let left = item.left;
		let p2 = item.crdt.p2;
		for (let i = 0; i < values.length; i++) {
			const id = `${item.crdt.p1}:${p2}`;
			const last = i === values.length - 1;
			const right = last ? item.right : `${item.crdt.p1}:${p2 + 1}`;
			chars.push({ id, left, right, value: values[i] });
			left = id;
			p2 += 1;
		}
	}
	return orderItems(chars);
}

export function paragraphs(text: RootText): Paragraph[] {
	const chars = expand(text);
	const result: Paragraph[] = [];
	let index = 0;
	let bold = false;
	let italic = false;
	while (index < chars.length) {
		let startId = END_MARKER;
		if (chars[index].value === '\n') {
			startId = chars[index].id;
			index += 1;
		}
		const paragraph: Paragraph = {
			startId,
			style: text.styles.get(startId) ?? STYLE.PLAIN,
			runs: [],
			charIds: []
		};
		while (index < chars.length) {
			const char = chars[index];
			if (typeof char.value === 'number') {
				if (char.value === 1) bold = true;
				else if (char.value === 2) bold = false;
				else if (char.value === 3) italic = true;
				else if (char.value === 4) italic = false;
			} else if (char.value === '\n') {
				break;
			} else {
				const last = paragraph.runs[paragraph.runs.length - 1];
				if (last && last.bold === bold && last.italic === italic) last.text += char.value;
				else paragraph.runs.push({ text: char.value, bold, italic });
				paragraph.charIds.push(char.id);
			}
			index += 1;
		}
		result.push(paragraph);
	}
	return result;
}
