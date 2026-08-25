/**
 * Binary reader with cursor over a Uint8Array.
 */

import { decodeVarint, decodeVarint64, zigzagDecode, zigzagDecode64 } from "./varint.js";
import { utf8Read } from "./utf8.js";

export class Reader {
  readonly buf: Uint8Array;
  readonly view: DataView;
  pos: number;

  constructor(buf: Uint8Array) {
    this.buf = buf;
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    this.pos = 0;
  }

  get remaining(): number {
    return this.buf.length - this.pos;
  }

  ensureCount(count: number): void {
    if (!Number.isFinite(count) || count < 0 || count > this.remaining) {
      throw new RangeError(
        `Invalid length ${count}: remaining ${this.remaining} bytes at offset ${this.pos}`,
      );
    }
  }

  private check(n: number): void {
    if (this.pos + n > this.buf.length) {
      throw new RangeError(
        `Buffer underflow: need ${n} bytes at offset ${this.pos}, have ${this.remaining}`,
      );
    }
  }

  readU8(): number {
    this.check(1);
    return this.buf[this.pos++];
  }

  readU16(): number {
    this.check(2);
    const val = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return val;
  }

  readU32(): number {
    this.check(4);
    const val = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return val;
  }

  readI8(): number {
    this.check(1);
    const val = this.view.getInt8(this.pos);
    this.pos += 1;
    return val;
  }

  readI16(): number {
    this.check(2);
    const val = this.view.getInt16(this.pos, true);
    this.pos += 2;
    return val;
  }

  readI32(): number {
    this.check(4);
    const val = this.view.getInt32(this.pos, true);
    this.pos += 4;
    return val;
  }

  readF32(): number {
    this.check(4);
    const val = this.view.getFloat32(this.pos, true);
    this.pos += 4;
    return val;
  }

  readF64(): number {
    this.check(8);
    const val = this.view.getFloat64(this.pos, true);
    this.pos += 8;
    return val;
  }

  readU64(): bigint {
    this.check(8);
    const val = this.view.getBigUint64(this.pos, true);
    this.pos += 8;
    return val;
  }

  readI64(): bigint {
    this.check(8);
    const val = this.view.getBigInt64(this.pos, true);
    this.pos += 8;
    return val;
  }

  readVarint(): number {
    const [value, newOffset] = decodeVarint(this.buf, this.pos);
    this.pos = newOffset;
    return value;
  }

  readSignedVarint(): number {
    return zigzagDecode(this.readVarint());
  }

  readVarint64(): bigint {
    const [value, newOffset] = decodeVarint64(this.buf, this.pos);
    this.pos = newOffset;
    return value;
  }

  readSignedVarint64(): bigint {
    return zigzagDecode64(this.readVarint64());
  }

  readBool(): boolean {
    return this.readU8() !== 0;
  }

  readString(): string {
    const len = this.readVarint();
    this.check(len);
    const val = utf8Read(this.buf, this.pos, len);
    this.pos += len;
    return val;
  }

  readBytes(): Uint8Array {
    const len = this.readVarint();
    this.check(len);
    const val = this.buf.slice(this.pos, this.pos + len);
    this.pos += len;
    return val;
  }

  skip(n: number): void {
    this.check(n);
    this.pos += n;
  }
}
