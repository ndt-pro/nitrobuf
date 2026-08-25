/**
 * Closure-based interpreter: safe in all environments (CSP, CF Workers).
 * Composes encode/decode function pairs by walking the IR tree.
 */

import { Writer } from "../codec/writer.js";
import { Reader } from "../codec/reader.js";
import type {
  AnyTypeNode,
  ArrayNode,
  MapNode,
  StructNode,
  OptionalNode,
  NullableNode,
  EnumNode,
  UnionNode,
} from "../schema/types.js";
import { TypeKind, WireType } from "../schema/types.js";
import { dynamicEncode, dynamicDecode } from "../dynamic/index.js";
import { assertInt, assertBigInt } from "./assert-int.js";

export type EncodeFn = (writer: Writer, value: any) => void;
export type DecodeFn = (reader: Reader) => any;

export function buildEncoder(node: AnyTypeNode): EncodeFn {
  switch (node.kind) {
    case TypeKind.U8:
      return (w, v) => {
        assertInt(v, 0, 255, "u8");
        w.writeU8(v);
      };
    case TypeKind.U16:
      return (w, v) => {
        assertInt(v, 0, 65535, "u16");
        w.writeU16(v);
      };
    case TypeKind.U32:
      return (w, v) => {
        assertInt(v, 0, 0xffffffff, "u32");
        w.writeU32(v);
      };
    case TypeKind.U64:
      return (w, v) => {
        assertBigInt(v, 0n, 2n ** 64n - 1n, "u64");
        w.writeU64(v);
      };
    case TypeKind.I8:
      return (w, v) => {
        assertInt(v, -128, 127, "i8");
        w.writeI8(v);
      };
    case TypeKind.I16:
      return (w, v) => {
        assertInt(v, -32768, 32767, "i16");
        w.writeI16(v);
      };
    case TypeKind.I32:
      return (w, v) => {
        assertInt(v, -2147483648, 2147483647, "i32");
        w.writeI32(v);
      };
    case TypeKind.I64:
      return (w, v) => {
        assertBigInt(v, -(2n ** 63n), 2n ** 63n - 1n, "i64");
        w.writeI64(v);
      };
    case TypeKind.F32:
      return (w, v) => w.writeF32(v);
    case TypeKind.F64:
      return (w, v) => w.writeF64(v);
    case TypeKind.UInt:
      return (w, v) => {
        assertInt(v, 0, 0xffffffff, "uint");
        w.writeVarint(v);
      };
    case TypeKind.Int:
      return (w, v) => {
        assertInt(v, -2147483648, 2147483647, "int");
        w.writeSignedVarint(v);
      };
    case TypeKind.Bool:
      return (w, v) => w.writeBool(v);
    case TypeKind.String:
      return (w, v) => w.writeString(v);
    case TypeKind.Bytes:
      return (w, v) => w.writeBytes(v);
    case TypeKind.Date:
      return (w, v) => w.writeSignedVarint64(BigInt(v.getTime()));
    case TypeKind.BigInt:
      return buildBigIntEncoder();
    case TypeKind.Any:
      return (w, v) => dynamicEncode(w, v);

    case TypeKind.Array:
      return buildArrayEncoder(node as ArrayNode);
    case TypeKind.Map:
      return buildMapEncoder(node as MapNode);
    case TypeKind.Struct:
      return buildStructEncoder(node as StructNode);
    case TypeKind.Optional:
      return buildOptionalEncoder(node as OptionalNode);
    case TypeKind.Nullable:
      return buildNullableEncoder(node as NullableNode);
    case TypeKind.Enum:
      return buildEnumEncoder(node as EnumNode);
    case TypeKind.Union:
      return buildUnionEncoder(node as UnionNode);
  }
}

export function buildDecoder(node: AnyTypeNode): DecodeFn {
  switch (node.kind) {
    case TypeKind.U8:
      return (r) => r.readU8();
    case TypeKind.U16:
      return (r) => r.readU16();
    case TypeKind.U32:
      return (r) => r.readU32();
    case TypeKind.U64:
      return (r) => r.readU64();
    case TypeKind.I8:
      return (r) => r.readI8();
    case TypeKind.I16:
      return (r) => r.readI16();
    case TypeKind.I32:
      return (r) => r.readI32();
    case TypeKind.I64:
      return (r) => r.readI64();
    case TypeKind.F32:
      return (r) => r.readF32();
    case TypeKind.F64:
      return (r) => r.readF64();
    case TypeKind.UInt:
      return (r) => r.readVarint();
    case TypeKind.Int:
      return (r) => r.readSignedVarint();
    case TypeKind.Bool:
      return (r) => r.readBool();
    case TypeKind.String:
      return (r) => r.readString();
    case TypeKind.Bytes:
      return (r) => r.readBytes();
    case TypeKind.Date:
      return (r) => new Date(Number(r.readSignedVarint64()));
    case TypeKind.BigInt:
      return buildBigIntDecoder();
    case TypeKind.Any:
      return (r) => dynamicDecode(r);

    case TypeKind.Array:
      return buildArrayDecoder(node as ArrayNode);
    case TypeKind.Map:
      return buildMapDecoder(node as MapNode);
    case TypeKind.Struct:
      return buildStructDecoder(node as StructNode);
    case TypeKind.Optional:
      return buildOptionalDecoder(node as OptionalNode);
    case TypeKind.Nullable:
      return buildNullableDecoder(node as NullableNode);
    case TypeKind.Enum:
      return buildEnumDecoder(node as EnumNode);
    case TypeKind.Union:
      return buildUnionDecoder(node as UnionNode);
  }
}

function buildBigIntEncoder(): EncodeFn {
  return (w, v: bigint) => {
    if (v < 0n) {
      w.writeU8(1);
      const abs = -v;
      encodeBigIntMagnitude(w, abs);
    } else {
      w.writeU8(0);
      encodeBigIntMagnitude(w, v);
    }
  };
}

function encodeBigIntMagnitude(w: Writer, v: bigint): void {
  const bytes: number[] = [];
  if (v === 0n) {
    w.writeVarint(0);
    return;
  }
  let val = v;
  while (val > 0n) {
    bytes.push(Number(val & 0xffn));
    val >>= 8n;
  }
  w.writeVarint(bytes.length);
  for (const b of bytes) w.writeU8(b);
}

function buildBigIntDecoder(): DecodeFn {
  return (r) => {
    const sign = r.readU8();
    const len = r.readVarint();
    r.ensureCount(len);
    let val = 0n;
    for (let i = 0; i < len; i++) {
      val |= BigInt(r.readU8()) << BigInt(i * 8);
    }
    return sign ? -val : val;
  };
}

function buildArrayEncoder(node: ArrayNode): EncodeFn {
  const encodeEl = buildEncoder(node.element);
  return (w, v: any[]) => {
    w.writeVarint(v.length);
    for (let i = 0; i < v.length; i++) encodeEl(w, v[i]);
  };
}

function buildArrayDecoder(node: ArrayNode): DecodeFn {
  const decodeEl = buildDecoder(node.element);
  return (r) => {
    const len = r.readVarint();
    r.ensureCount(len);
    const arr = new Array(len);
    for (let i = 0; i < len; i++) arr[i] = decodeEl(r);
    return arr;
  };
}

function buildMapEncoder(node: MapNode): EncodeFn {
  const encodeKey = buildEncoder(node.key);
  const encodeVal = buildEncoder(node.value);
  return (w, v: Map<any, any>) => {
    w.writeVarint(v.size);
    for (const [k, val] of v) {
      encodeKey(w, k);
      encodeVal(w, val);
    }
  };
}

function buildMapDecoder(node: MapNode): DecodeFn {
  const decodeKey = buildDecoder(node.key);
  const decodeVal = buildDecoder(node.value);
  return (r) => {
    const len = r.readVarint();
    r.ensureCount(len);
    const map = new Map();
    for (let i = 0; i < len; i++) {
      map.set(decodeKey(r), decodeVal(r));
    }
    return map;
  };
}

function buildOptionalEncoder(node: OptionalNode): EncodeFn {
  const encodeInner = buildEncoder(node.inner);
  return (w, v) => {
    if (v === undefined) {
      w.writeU8(0);
    } else {
      w.writeU8(1);
      encodeInner(w, v);
    }
  };
}

function buildOptionalDecoder(node: OptionalNode): DecodeFn {
  const decodeInner = buildDecoder(node.inner);
  return (r) => {
    const present = r.readU8();
    return present ? decodeInner(r) : undefined;
  };
}

function buildNullableEncoder(node: NullableNode): EncodeFn {
  const encodeInner = buildEncoder(node.inner);
  return (w, v) => {
    if (v === null) {
      w.writeU8(0);
    } else {
      w.writeU8(1);
      encodeInner(w, v);
    }
  };
}

function buildNullableDecoder(node: NullableNode): DecodeFn {
  const decodeInner = buildDecoder(node.inner);
  return (r) => {
    const present = r.readU8();
    return present ? decodeInner(r) : null;
  };
}

function buildEnumEncoder(node: EnumNode): EncodeFn {
  const indexMap = new Map<string, number>();
  for (let i = 0; i < node.variants.length; i++) indexMap.set(node.variants[i], i);
  return (w, v: string) => {
    const idx = indexMap.get(v);
    if (idx === undefined) throw new Error(`Unknown enum variant: ${v}`);
    w.writeVarint(idx);
  };
}

function buildEnumDecoder(node: EnumNode): DecodeFn {
  return (r) => {
    const idx = r.readVarint();
    if (idx >= node.variants.length) throw new Error(`Enum index out of range: ${idx}`);
    return node.variants[idx];
  };
}

function buildUnionEncoder(node: UnionNode): EncodeFn {
  const tagMap = new Map<string, number>();
  const encoders: EncodeFn[] = [];
  for (let i = 0; i < node.variants.length; i++) {
    tagMap.set(node.variants[i].tag, i);
    encoders.push(buildEncoder(node.variants[i].type));
  }
  return (w, v: { tag: string; value: any }) => {
    const idx = tagMap.get(v.tag);
    if (idx === undefined) throw new Error(`Unknown union tag: ${v.tag}`);
    w.writeVarint(idx);
    encoders[idx](w, v.value);
  };
}

function buildUnionDecoder(node: UnionNode): DecodeFn {
  const decoders: DecodeFn[] = node.variants.map((v) => buildDecoder(v.type));
  const tags = node.variants.map((v) => v.tag);
  return (r) => {
    const idx = r.readVarint();
    if (idx >= decoders.length) throw new Error(`Union discriminant out of range: ${idx}`);
    return { tag: tags[idx], value: decoders[idx](r) };
  };
}

// Positional struct with optional bitmask
function buildStructEncoder(node: StructNode): EncodeFn {
  if (node.tagged) return buildTaggedStructEncoder(node);

  const fieldEncoders: EncodeFn[] = node.fields.map((f) =>
    f.type.kind === TypeKind.Optional
      ? buildEncoder((f.type as OptionalNode).inner)
      : buildEncoder(f.type),
  );
  const optionalIndices: number[] = [];
  for (let i = 0; i < node.fields.length; i++) {
    if (node.fields[i].type.kind === TypeKind.Optional) optionalIndices.push(i);
  }
  const hasOptionals = optionalIndices.length > 0;
  const bitmaskBytes = hasOptionals ? Math.ceil(optionalIndices.length / 8) : 0;

  return (w, v: Record<string, any>) => {
    if (hasOptionals) {
      const bitmask = new Uint8Array(bitmaskBytes);
      for (let i = 0; i < optionalIndices.length; i++) {
        const fieldName = node.fields[optionalIndices[i]].name;
        if (v[fieldName] !== undefined) {
          bitmask[i >> 3] |= 1 << (i & 7);
        }
      }
      w.writeRaw(bitmask);
    }

    for (let i = 0; i < node.fields.length; i++) {
      const field = node.fields[i];
      if (field.type.kind === TypeKind.Optional) {
        if (v[field.name] !== undefined) {
          fieldEncoders[i](w, v[field.name]);
        }
      } else {
        fieldEncoders[i](w, v[field.name]);
      }
    }
  };
}

function buildStructDecoder(node: StructNode): DecodeFn {
  if (node.tagged) return buildTaggedStructDecoder(node);

  const fieldDecoders: DecodeFn[] = node.fields.map((f) =>
    f.type.kind === TypeKind.Optional
      ? buildDecoder((f.type as OptionalNode).inner)
      : buildDecoder(f.type),
  );
  const optionalIndices: number[] = [];
  for (let i = 0; i < node.fields.length; i++) {
    if (node.fields[i].type.kind === TypeKind.Optional) optionalIndices.push(i);
  }
  const hasOptionals = optionalIndices.length > 0;
  const bitmaskBytes = hasOptionals ? Math.ceil(optionalIndices.length / 8) : 0;

  return (r) => {
    const obj: Record<string, any> = {};
    let bitmask: Uint8Array | null = null;

    if (hasOptionals) {
      bitmask = new Uint8Array(bitmaskBytes);
      for (let i = 0; i < bitmaskBytes; i++) bitmask[i] = r.readU8();
    }

    let optIdx = 0;
    for (let i = 0; i < node.fields.length; i++) {
      const field = node.fields[i];
      if (field.type.kind === TypeKind.Optional) {
        const present = bitmask !== null && (bitmask[optIdx >> 3] & (1 << (optIdx & 7))) !== 0;
        optIdx++;
        if (present) {
          obj[field.name] = fieldDecoders[i](r);
        }
      } else {
        obj[field.name] = fieldDecoders[i](r);
      }
    }
    return obj;
  };
}

// Tagged struct: [varint key = (fieldId << 3) | wireType][payload]... [0x00 terminator]
function buildTaggedStructEncoder(node: StructNode): EncodeFn {
  const fieldEncoders: {
    fieldId: number;
    wireType: WireType;
    encode: EncodeFn;
    name: string;
    isOptional: boolean;
  }[] = [];

  for (const field of node.fields) {
    const fieldId = field.fieldId;
    if (fieldId === undefined || fieldId < 1) {
      throw new RangeError(`tagged field "${field.name}" requires fieldId >= 1`);
    }
    const actualType =
      field.type.kind === TypeKind.Optional ? (field.type as OptionalNode).inner : field.type;
    fieldEncoders.push({
      fieldId,
      wireType: actualType.wireType,
      encode: buildEncoder(actualType),
      name: field.name,
      isOptional: field.type.kind === TypeKind.Optional,
    });
  }

  return (w, v: Record<string, any>) => {
    for (const fe of fieldEncoders) {
      const val = v[fe.name];
      if (fe.isOptional && val === undefined) continue;

      const key = (fe.fieldId << 3) | fe.wireType;
      w.writeVarint(key);

      if (fe.wireType === WireType.LengthDelimited) {
        const tmpWriter = new Writer(64);
        fe.encode(tmpWriter, val);
        const encoded = tmpWriter.finish();
        w.writeVarint(encoded.length);
        w.writeRaw(encoded);
      } else {
        fe.encode(w, val);
      }
    }
    w.writeU8(0x00);
  };
}

function buildTaggedStructDecoder(node: StructNode): DecodeFn {
  const fieldMap = new Map<
    number,
    { name: string; decode: DecodeFn; wireType: WireType; isOptional: boolean }
  >();
  for (const field of node.fields) {
    const fieldId = field.fieldId;
    if (fieldId === undefined || fieldId < 1) {
      throw new RangeError(`tagged field "${field.name}" requires fieldId >= 1`);
    }
    const actualType =
      field.type.kind === TypeKind.Optional ? (field.type as OptionalNode).inner : field.type;
    fieldMap.set(fieldId, {
      name: field.name,
      decode: buildDecoder(actualType),
      wireType: actualType.wireType,
      isOptional: field.type.kind === TypeKind.Optional,
    });
  }

  return (r) => {
    const obj: Record<string, any> = {};

    while (true) {
      if (r.remaining <= 0) break;
      const key = r.readVarint();
      if (key === 0) break;

      const fieldId = key >> 3;
      const wireType = (key & 7) as WireType;

      const fieldInfo = fieldMap.get(fieldId);
      if (fieldInfo) {
        if (wireType !== fieldInfo.wireType) {
          skipField(r, wireType);
          continue;
        }
        if (wireType === WireType.LengthDelimited) {
          const len = r.readVarint();
          r.ensureCount(len);
          const sub = new Reader(r.buf.subarray(r.pos, r.pos + len));
          obj[fieldInfo.name] = fieldInfo.decode(sub);
          r.pos += len;
        } else {
          obj[fieldInfo.name] = fieldInfo.decode(r);
        }
      } else {
        skipField(r, wireType);
      }
    }
    return obj;
  };
}

function skipField(r: Reader, wireType: WireType): void {
  switch (wireType) {
    case WireType.Varint:
      r.readVarint64();
      break;
    case WireType.Fixed64:
      r.skip(8);
      break;
    case WireType.LengthDelimited: {
      const len = r.readVarint();
      r.skip(len);
      break;
    }
    case WireType.Fixed32:
      r.skip(4);
      break;
    case WireType.Fixed8:
      r.skip(1);
      break;
    case WireType.Fixed16:
      r.skip(2);
      break;
    default:
      throw new Error(`Unknown wire type: ${wireType}`);
  }
}

export function compileInterpreter(node: AnyTypeNode): { encode: EncodeFn; decode: DecodeFn } {
  return { encode: buildEncoder(node), decode: buildDecoder(node) };
}
