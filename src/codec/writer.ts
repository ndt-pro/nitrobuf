/**
 * Growable binary writer backed by a Uint8Array.
 */

import { encodeVarint, encodeVarint64, zigzagEncode, zigzagEncode64 } from "./varint.js";
import { utf8ByteLength, utf8Write } from "./utf8.js";

const INITIAL_SIZE = 256;

export class Writer {
  buf: Uint8Array;
  view: DataView;
  pos: number;

  constructor(initialSize: number = INITIAL_SIZE) {
    const size = Math.max(1, initialSize | 0);
    this.buf = new Uint8Array(size);
    this.view = new DataView(this.buf.buffer);
    this.pos = 0;
  }

  private grow(needed: number): void {
    const minSize = this.pos + needed;
    if (minSize <= this.buf.length) return;
    let newSize = this.buf.length;
    while (newSize < minSize) newSize *= 2;
    const newBuf = new Uint8Array(newSize);
    newBuf.set(this.buf);
    this.buf = newBuf;
    this.view = new DataView(newBuf.buffer);
  }

  reset(): void {
    this.pos = 0;
  }

  finish(): Uint8Array {
    return this.buf.slice(0, this.pos);
  }

  writeU8(val: number): void {
    this.grow(1);
    this.buf[this.pos++] = val;
  }

  writeU16(val: number): void {
    this.grow(2);
    this.view.setUint16(this.pos, val, true);
    this.pos += 2;
  }

  writeU32(val: number): void {
    this.grow(4);
    this.view.setUint32(this.pos, val, true);
    this.pos += 4;
  }

  writeI8(val: number): void {
    this.grow(1);
    this.view.setInt8(this.pos, val);
    this.pos += 1;
  }

  writeI16(val: number): void {
    this.grow(2);
    this.view.setInt16(this.pos, val, true);
    this.pos += 2;
  }

  writeI32(val: number): void {
    this.grow(4);
    this.view.setInt32(this.pos, val, true);
    this.pos += 4;
  }

  writeF32(val: number): void {
    this.grow(4);
    this.view.setFloat32(this.pos, val, true);
    this.pos += 4;
  }

  writeF64(val: number): void {
    this.grow(8);
    this.view.setFloat64(this.pos, val, true);
    this.pos += 8;
  }

  writeU64(val: bigint): void {
    this.grow(8);
    this.view.setBigUint64(this.pos, val, true);
    this.pos += 8;
  }

  writeI64(val: bigint): void {
    this.grow(8);
    this.view.setBigInt64(this.pos, val, true);
    this.pos += 8;
  }

  writeVarint(val: number): void {
    this.grow(5);
    this.pos = encodeVarint(this.buf, this.pos, val >>> 0);
  }

  writeSignedVarint(val: number): void {
    this.writeVarint(zigzagEncode(val));
  }

  writeVarint64(val: bigint): void {
    this.grow(10);
    this.pos = encodeVarint64(this.buf, this.pos, val);
  }

  writeSignedVarint64(val: bigint): void {
    this.writeVarint64(zigzagEncode64(val));
  }

  writeBool(val: boolean): void {
    this.writeU8(val ? 1 : 0);
  }

  writeString(val: string): void {
    const byteLen = utf8ByteLength(val);
    this.writeVarint(byteLen);
    this.grow(byteLen);
    utf8Write(this.buf, this.pos, val);
    this.pos += byteLen;
  }

  writeBytes(val: Uint8Array): void {
    this.writeVarint(val.length);
    this.grow(val.length);
    this.buf.set(val, this.pos);
    this.pos += val.length;
  }

  writeRaw(data: Uint8Array): void {
    this.grow(data.length);
    this.buf.set(data, this.pos);
    this.pos += data.length;
  }
}
