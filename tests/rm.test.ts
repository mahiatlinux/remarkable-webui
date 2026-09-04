import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseScene, orderItems } from '../src/lib/rm/scene';
import { RmReader } from '../src/lib/rm/reader';
import { compareItems, folderCrumbs } from '../src/lib/components/library/contents';
import type { LibraryItem } from '../shared/types';

const header = Buffer.from('reMarkable .lines file, version=6          ');
const u32 = (value: number) => {
	const bytes = Buffer.alloc(4);
	bytes.writeUInt32LE(value);
	return bytes;
};
const block = (type: number, value: Buffer) =>
	Buffer.concat([u32(value.length), Buffer.from([0, 1, 2, type]), value]);
const array = (bytes: Buffer) => Uint8Array.from(bytes).buffer;

test('v6 scene parsing skips unknown blocks and reads paper dimensions', () => {
	const metadata = Buffer.concat([
		Buffer.from([0x1c]),
		u32(6),
		Buffer.from([0x1f, 1, 1, 0x2f, 0, 1]),
		Buffer.from([0x5c]),
		u32(8),
		u32(1620),
		u32(2160)
	]);
	const scene = parseScene(
		array(Buffer.concat([header, block(0xff, Buffer.from([1, 2, 3])), block(0x0d, metadata)]))
	);
	assert.deepEqual(scene.paperSize, [1620, 2160]);
	assert.equal(scene.root.id, '0:1');
});

test('unsupported headers fail and truncated files are handled', () => {
	assert.throws(() => parseScene(array(Buffer.from('invalid'))), /Unexpected end of data/);
	assert.throws(
		() => parseScene(array(Buffer.from(header.toString().replace('version=6', 'version=5')))),
		/Not a reMarkable v6/
	);
	assert.deepEqual(
		parseScene(array(Buffer.concat([header, block(0x03, Buffer.from([0x1f]))]))).root.children,
		[]
	);
});

test('tagged reader keeps Unicode strings and rejects truncated bytes', () => {
	const text = Buffer.from('Kia ora, 世界');
	const reader = new RmReader(
		array(
			Buffer.concat([
				Buffer.from([0x1c]),
				u32(text.length + 2),
				Buffer.from([text.length, 1]),
				text
			])
		)
	);
	assert.equal(reader.string(1), 'Kia ora, 世界');
	assert.equal(reader.remaining, 0);
	assert.throws(() => reader.bytes(1), /Unexpected end of data/);
});

test('CRDT ordering respects neighbours even when blocks arrive out of order', () => {
	const a = { id: '1:1', left: '0:0', right: '1:2' };
	const b = { id: '1:2', left: '1:1', right: '1:3' };
	const c = { id: '1:3', left: '1:2', right: '0:0' };
	assert.deepEqual(orderItems([c, a, b]), [a, b, c]);
});

test('folder sorting and breadcrumbs tolerate cyclic tablet metadata', () => {
	const make = (id: string, parent: string, type: LibraryItem['type'], pinned = false) =>
		({ id, parent, type, pinned, name: id, lastModified: 1 }) as LibraryItem;
	const folder = make('a', 'b', 'folder');
	const parent = make('b', 'a', 'folder');
	const doc = make('c', '', 'notebook', true);
	assert.deepEqual([doc, folder].sort(compareItems('name')), [folder, doc]);
	assert.deepEqual(
		folderCrumbs(
			new Map([
				[folder.id, folder],
				[parent.id, parent]
			]),
			folder.id
		),
		[parent, folder]
	);
});
