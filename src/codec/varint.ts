/**
 * LEB128 unsigned varint and zigzag signed varint encoding/decoding.
 */

const MAX_VARINT_BYTES = 10; // 64-bit values need at most 10 bytes

export function encodeVarint(buf: Uint8Array, offset: number, value: number): number {
  while (value > 0x7f) {
    buf[offset++] = (value & 0x7f) | 0x80;
    value >>>= 7;
  }
  buf[offset++] = value;
  return offset;
}

export function decodeVarint(buf: Uint8Array, offset: number): [value: number, newOffset: number] {
  let value = 0;
  let shift = 0;
  let b: number;
  do {
    if (shift >= 35) throw new RangeError("varint too long");
    if (offset >= buf.length) throw new RangeError("varint truncated");
    b = buf[offset++];
    value |= (b & 0x7f) << shift;
    shift += 7;
  } while (b & 0x80);
  return [value >>> 0, offset];
}

export function sizeVarint(value: number): number {
  if (value < 0) value = value >>> 0;
  if (value < 0x80) return 1;
  if (value < 0x4000) return 2;
  if (value < 0x200000) return 3;
  if (value < 0x10000000) return 4;
  return 5;
}

export function zigzagEncode(n: number): number {
  return ((n << 1) ^ (n >> 31)) >>> 0;
}

export function zigzagDecode(n: number): number {
  return (n >>> 1) ^ -(n & 1);
}

export function encodeVarint64(buf: Uint8Array, offset: number, value: bigint): number {
  if (value < 0n) throw new RangeError("encodeVarint64 expects unsigned bigint");
  for (let i = 0; i < MAX_VARINT_BYTES; i++) {
    if (value <= 0x7fn) {
      buf[offset++] = Number(value);
      return offset;
    }
    buf[offset++] = Number(value & 0x7fn) | 0x80;
    value >>= 7n;
  }
  throw new RangeError("varint64 too long");
}

export function decodeVarint64(
  buf: Uint8Array,
  offset: number,
): [value: bigint, newOffset: number] {
  let value = 0n;
  let shift = 0n;
  let b: number;
  do {
    if (shift >= 70n) throw new RangeError("varint64 too long");
    if (offset >= buf.length) throw new RangeError("varint64 truncated");
    b = buf[offset++];
    value |= BigInt(b & 0x7f) << shift;
    shift += 7n;
  } while (b & 0x80);
  return [value, offset];
}

export function sizeVarint64(value: bigint): number {
  if (value < 0n) value = -value;
  let size = 1;
  while (value > 0x7fn) {
    size++;
    value >>= 7n;
  }
  return size;
}

export function zigzagEncode64(n: bigint): bigint {
  return (n << 1n) ^ (n >> 63n);
}

export function zigzagDecode64(n: bigint): bigint {
  return (n >> 1n) ^ -(n & 1n);
}
