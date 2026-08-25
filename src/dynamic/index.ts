/**
 * Dynamic schemaless codec — msgpack-like type-tagged format.
 * Used for nb.any and as socket.io fallback for unregistered events.
 *
 * Type tags (1 byte):
 *   0x00 = null, 0x01 = undefined, 0x02 = false, 0x03 = true,
 *   0x04 = uint (varint), 0x05 = int (zigzag varint),
 *   0x06 = f64, 0x07 = string, 0x08 = bytes,
 *   0x09 = array, 0x0A = object, 0x0B = bigint,
 *   0x0C = date
 */

import { Writer } from "../codec/writer.js";
import { Reader } from "../codec/reader.js";

const enum DynTag {
  Null = 0x00,
  Undefined = 0x01,
  False = 0x02,
  True = 0x03,
  UInt = 0x04,
  Int = 0x05,
  F64 = 0x06,
  String = 0x07,
  Bytes = 0x08,
  Array = 0x09,
  Object = 0x0a,
  BigInt = 0x0b,
  Date = 0x0c,
}

export function dynamicEncode(w: Writer, value: unknown): void {
  if (value === null) {
    w.writeU8(DynTag.Null);
    return;
  }
  if (value === undefined) {
    w.writeU8(DynTag.Undefined);
    return;
  }

  switch (typeof value) {
    case "boolean":
      w.writeU8(value ? DynTag.True : DynTag.False);
      return;

    case "number":
      if (Number.isInteger(value) && value >= 0 && value <= 0xffffffff) {
        w.writeU8(DynTag.UInt);
        w.writeVarint(value);
      } else if (Number.isInteger(value) && value >= -2147483648 && value < 0) {
        w.writeU8(DynTag.Int);
        w.writeSignedVarint(value);
      } else {
        w.writeU8(DynTag.F64);
        w.writeF64(value);
      }
      return;

    case "string":
      w.writeU8(DynTag.String);
      w.writeString(value);
      return;

    case "bigint":
      w.writeU8(DynTag.BigInt);
      encodeBigInt(w, value);
      return;

    case "object": {
      if (value instanceof Date) {
        w.writeU8(DynTag.Date);
        w.writeSignedVarint64(BigInt(value.getTime()));
        return;
      }
      if (value instanceof Uint8Array) {
        w.writeU8(DynTag.Bytes);
        w.writeBytes(value);
        return;
      }
      if (ArrayBuffer.isView(value)) {
        w.writeU8(DynTag.Bytes);
        const u8 = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
        w.writeBytes(u8);
        return;
      }
      if (value instanceof ArrayBuffer) {
        w.writeU8(DynTag.Bytes);
        w.writeBytes(new Uint8Array(value));
        return;
      }
      if (Array.isArray(value)) {
        w.writeU8(DynTag.Array);
        w.writeVarint(value.length);
        for (let i = 0; i < value.length; i++) dynamicEncode(w, value[i]);
        return;
      }
      if (value instanceof Map || value instanceof Set) {
        throw new Error(`dynamicEncode: unsupported type ${value.constructor.name}`);
      }
      // Plain object
      w.writeU8(DynTag.Object);
      const keys = Object.keys(value as Record<string, unknown>);
      w.writeVarint(keys.length);
      for (const key of keys) {
        w.writeString(key);
        dynamicEncode(w, (value as Record<string, unknown>)[key]);
      }
      return;
    }
    default:
      throw new Error(`dynamicEncode: unsupported type ${typeof value}`);
  }
}

export function dynamicDecode(r: Reader): unknown {
  const tag = r.readU8();
  switch (tag) {
    case DynTag.Null:
      return null;
    case DynTag.Undefined:
      return undefined;
    case DynTag.False:
      return false;
    case DynTag.True:
      return true;
    case DynTag.UInt:
      return r.readVarint();
    case DynTag.Int:
      return r.readSignedVarint();
    case DynTag.F64:
      return r.readF64();
    case DynTag.String:
      return r.readString();
    case DynTag.Bytes:
      return r.readBytes();
    case DynTag.BigInt:
      return decodeBigInt(r);
    case DynTag.Date:
      return new Date(Number(r.readSignedVarint64()));

    case DynTag.Array: {
      const len = r.readVarint();
      r.ensureCount(len);
      const arr = new Array(len);
      for (let i = 0; i < len; i++) arr[i] = dynamicDecode(r);
      return arr;
    }
    case DynTag.Object: {
      const len = r.readVarint();
      r.ensureCount(len);
      const obj: Record<string, unknown> = Object.create(null);
      for (let i = 0; i < len; i++) {
        const key = r.readString();
        obj[key] = dynamicDecode(r);
      }
      return obj;
    }
    default:
      throw new Error(`dynamicDecode: unknown tag 0x${tag.toString(16)}`);
  }
}

function encodeBigInt(w: Writer, value: bigint): void {
  if (value < 0n) {
    w.writeU8(1);
    encodeMagnitude(w, -value);
  } else {
    w.writeU8(0);
    encodeMagnitude(w, value);
  }
}

function encodeMagnitude(w: Writer, v: bigint): void {
  if (v === 0n) {
    w.writeVarint(0);
    return;
  }
  const bytes: number[] = [];
  let val = v;
  while (val > 0n) {
    bytes.push(Number(val & 0xffn));
    val >>= 8n;
  }
  w.writeVarint(bytes.length);
  for (const b of bytes) w.writeU8(b);
}

function decodeBigInt(r: Reader): bigint {
  const sign = r.readU8();
  const len = r.readVarint();
  r.ensureCount(len);
  let val = 0n;
  for (let i = 0; i < len; i++) {
    val |= BigInt(r.readU8()) << BigInt(i * 8);
  }
  return sign ? -val : val;
}

/**
 * Encode an arbitrary JS value to a Uint8Array using the dynamic codec.
 */
export function dynamicEncodeToBytes(value: unknown): Uint8Array {
  const w = new Writer(256);
  dynamicEncode(w, value);
  return w.finish();
}

/**
 * Decode a Uint8Array to a JS value using the dynamic codec.
 */
export function dynamicDecodeFromBytes(buf: Uint8Array): unknown {
  const r = new Reader(buf);
  return dynamicDecode(r);
}
