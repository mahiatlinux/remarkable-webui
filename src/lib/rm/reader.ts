export interface CrdtId {
	p1: number;
	p2: number;
}

export const END_MARKER = '0:0';

export const TAG = {
	ID: 0xf,
	LENGTH4: 0xc,
	BYTE8: 0x8,
	BYTE4: 0x4,
	BYTE1: 0x1
} as const;

export type TagType = (typeof TAG)[keyof typeof TAG];

export interface Lww<T> {
	timestamp: string;
	value: T;
}

const HEADER = 'reMarkable .lines file, version=6          ';
const decoder = new TextDecoder();

export function idKey(id: CrdtId): string {
	return `${id.p1}:${id.p2}`;
}

export class RmReader {
	pos = 0;
	limit: number;
	private view: DataView;
	private bytesView: Uint8Array;

	constructor(buffer: ArrayBuffer) {
		this.view = new DataView(buffer);
		this.bytesView = new Uint8Array(buffer);
		this.limit = buffer.byteLength;
	}

	get length(): number {
		return this.view.byteLength;
	}

	get remaining(): number {
		return this.limit - this.pos;
	}

	readHeader() {
		const header = decoder.decode(this.bytes(HEADER.length));
		if (header !== HEADER) throw new Error('Not a reMarkable v6 lines file');
	}

	bytes(count: number): Uint8Array {
		if (this.pos + count > this.view.byteLength) throw new Error('Unexpected end of data');
		const slice = this.bytesView.subarray(this.pos, this.pos + count);
		this.pos += count;
		return slice;
	}

	u8(): number {
		const value = this.view.getUint8(this.pos);
		this.pos += 1;
		return value;
	}

	u16(): number {
		const value = this.view.getUint16(this.pos, true);
		this.pos += 2;
		return value;
	}

	u32(): number {
		const value = this.view.getUint32(this.pos, true);
		this.pos += 4;
		return value;
	}

	f32(): number {
		const value = this.view.getFloat32(this.pos, true);
		this.pos += 4;
		return value;
	}

	f64(): number {
		const value = this.view.getFloat64(this.pos, true);
		this.pos += 8;
		return value;
	}

	varuint(): number {
		let shift = 0;
		let result = 0;
		for (;;) {
			const byte = this.u8();
			result += (byte & 0x7f) * 2 ** shift;
			shift += 7;
			if (!(byte & 0x80)) return result;
		}
	}

	crdtId(): CrdtId {
		return { p1: this.u8(), p2: this.varuint() };
	}

	private peekTag(): { index: number; type: number } | null {
		if (this.pos >= this.limit) return null;
		const start = this.pos;
		try {
			const raw = this.varuint();
			return { index: raw >> 4, type: raw & 0xf };
		} catch {
			return null;
		} finally {
			this.pos = start;
		}
	}

	hasTag(index: number, type: TagType): boolean {
		const tag = this.peekTag();
		return tag !== null && tag.index === index && tag.type === type;
	}

	private readTag(index: number, type: TagType) {
		const raw = this.varuint();
		const found = { index: raw >> 4, type: raw & 0xf };
		if (found.index !== index || found.type !== type) {
			throw new Error(
				`Expected tag ${index}/${type.toString(16)}, found ${found.index}/${found.type.toString(16)} at ${this.pos}`
			);
		}
	}

	idRaw(index: number): CrdtId {
		this.readTag(index, TAG.ID);
		return this.crdtId();
	}

	id(index: number): string {
		return idKey(this.idRaw(index));
	}

	bool(index: number): boolean {
		this.readTag(index, TAG.BYTE1);
		return this.u8() !== 0;
	}

	byte(index: number): number {
		this.readTag(index, TAG.BYTE1);
		return this.u8();
	}

	int(index: number): number {
		this.readTag(index, TAG.BYTE4);
		return this.u32();
	}

	float(index: number): number {
		this.readTag(index, TAG.BYTE4);
		return this.f32();
	}

	double(index: number): number {
		this.readTag(index, TAG.BYTE8);
		return this.f64();
	}

	subblock(index: number): number {
		this.readTag(index, TAG.LENGTH4);
		const length = this.u32();
		return this.pos + length;
	}

	hasSubblock(index: number): boolean {
		return this.hasTag(index, TAG.LENGTH4);
	}

	within<T>(end: number, read: () => T): T {
		const previousLimit = this.limit;
		this.limit = end;
		try {
			return read();
		} finally {
			this.limit = previousLimit;
			this.pos = end;
		}
	}

	lwwId(index: number): Lww<string> {
		return this.within(this.subblock(index), () => ({ timestamp: this.id(1), value: this.id(2) }));
	}

	lwwBool(index: number): Lww<boolean> {
		return this.within(this.subblock(index), () => ({
			timestamp: this.id(1),
			value: this.bool(2)
		}));
	}

	lwwByte(index: number): Lww<number> {
		return this.within(this.subblock(index), () => ({
			timestamp: this.id(1),
			value: this.byte(2)
		}));
	}

	lwwFloat(index: number): Lww<number> {
		return this.within(this.subblock(index), () => ({
			timestamp: this.id(1),
			value: this.float(2)
		}));
	}

	lwwString(index: number): Lww<string> {
		return this.within(this.subblock(index), () => ({
			timestamp: this.id(1),
			value: this.string(2)
		}));
	}

	string(index: number): string {
		return this.within(this.subblock(index), () => {
			const length = this.varuint();
			this.u8();
			return decoder.decode(this.bytes(length));
		});
	}

	stringWithFormat(index: number): [string, number | null] {
		return this.within(this.subblock(index), () => {
			const length = this.varuint();
			this.u8();
			const text = decoder.decode(this.bytes(length));
			const format = this.hasTag(2, TAG.BYTE4) ? this.int(2) : null;
			return [text, format];
		});
	}

	intPair(index: number): [number, number] {
		return this.within(this.subblock(index), () => [this.u32(), this.u32()]);
	}

	colorOptional(index: number): [number, number, number, number] | null {
		if (!this.hasTag(index, TAG.BYTE4)) return null;
		const packed = this.int(index);
		return [(packed >>> 16) & 0xff, (packed >>> 8) & 0xff, packed & 0xff, (packed >>> 24) & 0xff];
	}
}
