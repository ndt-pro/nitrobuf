import { describe, it, expect } from "vitest";
import { Writer, Reader } from "../src/codec/index.js";
import {
  encodeVarint,
  decodeVarint,
  sizeVarint,
  zigzagEncode,
  zigzagDecode,
  encodeVarint64,
  decodeVarint64,
  zigzagEncode64,
  zigzagDecode64,
} from "../src/codec/varint.js";
import { utf8ByteLength, utf8Write, utf8Read } from "../src/codec/utf8.js";

describe("varint", () => {
  it("encodes/decodes 0", () => {
    const buf = new Uint8Array(5);
    const end = encodeVarint(buf, 0, 0);
    expect(end).toBe(1);
    expect(buf[0]).toBe(0);
    const [val, off] = decodeVarint(buf, 0);
    expect(val).toBe(0);
    expect(off).toBe(1);
  });

  it("encodes/decodes 127", () => {
    const buf = new Uint8Array(5);
    encodeVarint(buf, 0, 127);
    const [val] = decodeVarint(buf, 0);
    expect(val).toBe(127);
  });

  it("encodes/decodes 128", () => {
    const buf = new Uint8Array(5);
    const end = encodeVarint(buf, 0, 128);
    expect(end).toBe(2);
    const [val] = decodeVarint(buf, 0);
    expect(val).toBe(128);
  });

  it("encodes/decodes 300", () => {
    const buf = new Uint8Array(5);
    encodeVarint(buf, 0, 300);
    const [val] = decodeVarint(buf, 0);
    expect(val).toBe(300);
  });

  it("encodes/decodes max u32", () => {
    const buf = new Uint8Array(5);
    encodeVarint(buf, 0, 0xffffffff);
    const [val] = decodeVarint(buf, 0);
    expect(val).toBe(0xffffffff);
  });

  it("sizeVarint is correct", () => {
    expect(sizeVarint(0)).toBe(1);
    expect(sizeVarint(127)).toBe(1);
    expect(sizeVarint(128)).toBe(2);
    expect(sizeVarint(16383)).toBe(2);
    expect(sizeVarint(16384)).toBe(3);
    expect(sizeVarint(0xffffffff)).toBe(5);
  });

  it("throws on truncated continuation", () => {
    expect(() => decodeVarint(new Uint8Array([0x80]), 0)).toThrow(RangeError);
    expect(() => decodeVarint(new Uint8Array([0xac]), 0)).toThrow(RangeError);
    expect(() => decodeVarint(new Uint8Array([]), 0)).toThrow(RangeError);
  });
});

describe("zigzag", () => {
  it("encodes/decodes 0", () => {
    expect(zigzagDecode(zigzagEncode(0))).toBe(0);
  });

  it("encodes/decodes positive", () => {
    expect(zigzagDecode(zigzagEncode(1))).toBe(1);
    expect(zigzagDecode(zigzagEncode(300))).toBe(300);
  });

  it("encodes/decodes negative", () => {
    expect(zigzagDecode(zigzagEncode(-1))).toBe(-1);
    expect(zigzagDecode(zigzagEncode(-300))).toBe(-300);
  });

  it("zigzag encoding maps -1 to 1, 1 to 2", () => {
    expect(zigzagEncode(0)).toBe(0);
    expect(zigzagEncode(-1)).toBe(1);
    expect(zigzagEncode(1)).toBe(2);
    expect(zigzagEncode(-2)).toBe(3);
  });
});

describe("varint64", () => {
  it("encodes/decodes 0n", () => {
    const buf = new Uint8Array(10);
    const end = encodeVarint64(buf, 0, 0n);
    expect(end).toBe(1);
    const [val, off] = decodeVarint64(buf, 0);
    expect(val).toBe(0n);
    expect(off).toBe(1);
  });

  it("encodes/decodes large bigint", () => {
    const big = 2n ** 53n;
    const buf = new Uint8Array(10);
    encodeVarint64(buf, 0, big);
    const [val] = decodeVarint64(buf, 0);
    expect(val).toBe(big);
  });

  it("zigzag64 round trips", () => {
    for (const n of [0n, 1n, -1n, 12345678901234n, -12345678901234n]) {
      expect(zigzagDecode64(zigzagEncode64(n))).toBe(n);
    }
  });

  it("throws on truncated continuation", () => {
    expect(() => decodeVarint64(new Uint8Array([0x80]), 0)).toThrow(RangeError);
    expect(() => decodeVarint64(new Uint8Array([]), 0)).toThrow(RangeError);
  });
});

describe("utf8", () => {
  it("measures ASCII byte length", () => {
    expect(utf8ByteLength("hello")).toBe(5);
  });

  it("measures multi-byte char lengths", () => {
    expect(utf8ByteLength("é")).toBe(2);
    expect(utf8ByteLength("中")).toBe(3);
    expect(utf8ByteLength("😀")).toBe(4);
  });

  it("write/read round-trip ASCII", () => {
    const buf = new Uint8Array(20);
    const end = utf8Write(buf, 0, "hello");
    expect(end).toBe(5);
    expect(utf8Read(buf, 0, 5)).toBe("hello");
  });

  it("write/read round-trip unicode", () => {
    const str = "Hello 世界 😀 é";
    const len = utf8ByteLength(str);
    const buf = new Uint8Array(len);
    utf8Write(buf, 0, str);
    expect(utf8Read(buf, 0, len)).toBe(str);
  });

  it("empty string", () => {
    expect(utf8ByteLength("")).toBe(0);
    expect(utf8Read(new Uint8Array(0), 0, 0)).toBe("");
  });

  it("unpaired high surrogate matches TextEncoder and keeps following chars", () => {
    const str = "\uD800\u20ACEND";
    const encoded = new TextEncoder().encode(str);
    expect(utf8ByteLength(str)).toBe(encoded.length);

    const buf = new Uint8Array(encoded.length);
    const end = utf8Write(buf, 0, str);
    expect(end).toBe(encoded.length);
    expect(Array.from(buf)).toEqual(Array.from(encoded));
    expect(utf8Read(buf, 0, encoded.length)).toBe("\uFFFD\u20ACEND");
  });

  it("unpaired surrogate in long string matches TextEncoder byte length", () => {
    const str = "\uD800\u20AC" + "a".repeat(200);
    const encoded = new TextEncoder().encode(str);
    expect(utf8ByteLength(str)).toBe(encoded.length);

    const w = new Writer();
    w.writeString(str);
    const bytes = w.finish();
    const r = new Reader(bytes);
    expect(r.readString()).toBe(new TextDecoder().decode(encoded));
  });
});

describe("Writer/Reader", () => {
  it("writes and reads u8", () => {
    const w = new Writer();
    w.writeU8(0);
    w.writeU8(255);
    const r = new Reader(w.finish());
    expect(r.readU8()).toBe(0);
    expect(r.readU8()).toBe(255);
  });

  it("writes and reads u16", () => {
    const w = new Writer();
    w.writeU16(0);
    w.writeU16(65535);
    const r = new Reader(w.finish());
    expect(r.readU16()).toBe(0);
    expect(r.readU16()).toBe(65535);
  });

  it("writes and reads u32", () => {
    const w = new Writer();
    w.writeU32(0);
    w.writeU32(0xffffffff);
    const r = new Reader(w.finish());
    expect(r.readU32()).toBe(0);
    expect(r.readU32()).toBe(0xffffffff);
  });

  it("writes and reads i8", () => {
    const w = new Writer();
    w.writeI8(-128);
    w.writeI8(127);
    const r = new Reader(w.finish());
    expect(r.readI8()).toBe(-128);
    expect(r.readI8()).toBe(127);
  });

  it("writes and reads i16", () => {
    const w = new Writer();
    w.writeI16(-32768);
    w.writeI16(32767);
    const r = new Reader(w.finish());
    expect(r.readI16()).toBe(-32768);
    expect(r.readI16()).toBe(32767);
  });

  it("writes and reads i32", () => {
    const w = new Writer();
    w.writeI32(-2147483648);
    w.writeI32(2147483647);
    const r = new Reader(w.finish());
    expect(r.readI32()).toBe(-2147483648);
    expect(r.readI32()).toBe(2147483647);
  });

  it("writes and reads f32", () => {
    const w = new Writer();
    w.writeF32(3.14);
    const r = new Reader(w.finish());
    expect(r.readF32()).toBeCloseTo(3.14, 5);
  });

  it("writes and reads f64", () => {
    const w = new Writer();
    w.writeF64(Math.PI);
    w.writeF64(NaN);
    w.writeF64(Infinity);
    w.writeF64(-Infinity);
    w.writeF64(-0);
    const r = new Reader(w.finish());
    expect(r.readF64()).toBe(Math.PI);
    expect(r.readF64()).toBeNaN();
    expect(r.readF64()).toBe(Infinity);
    expect(r.readF64()).toBe(-Infinity);
    expect(Object.is(r.readF64(), -0)).toBe(true);
  });

  it("writes and reads u64/i64", () => {
    const w = new Writer();
    w.writeU64(0n);
    w.writeU64(2n ** 64n - 1n);
    w.writeI64(-9223372036854775808n);
    w.writeI64(9223372036854775807n);
    const r = new Reader(w.finish());
    expect(r.readU64()).toBe(0n);
    expect(r.readU64()).toBe(18446744073709551615n);
    expect(r.readI64()).toBe(-9223372036854775808n);
    expect(r.readI64()).toBe(9223372036854775807n);
  });

  it("writes and reads varint", () => {
    const w = new Writer();
    w.writeVarint(0);
    w.writeVarint(127);
    w.writeVarint(128);
    w.writeVarint(0xffffffff);
    const r = new Reader(w.finish());
    expect(r.readVarint()).toBe(0);
    expect(r.readVarint()).toBe(127);
    expect(r.readVarint()).toBe(128);
    expect(r.readVarint()).toBe(0xffffffff);
  });

  it("writes and reads signed varint", () => {
    const w = new Writer();
    w.writeSignedVarint(0);
    w.writeSignedVarint(-1);
    w.writeSignedVarint(1);
    w.writeSignedVarint(-2147483648);
    const r = new Reader(w.finish());
    expect(r.readSignedVarint()).toBe(0);
    expect(r.readSignedVarint()).toBe(-1);
    expect(r.readSignedVarint()).toBe(1);
    expect(r.readSignedVarint()).toBe(-2147483648);
  });

  it("writes and reads bool", () => {
    const w = new Writer();
    w.writeBool(true);
    w.writeBool(false);
    const r = new Reader(w.finish());
    expect(r.readBool()).toBe(true);
    expect(r.readBool()).toBe(false);
  });

  it("writes and reads string", () => {
    const w = new Writer();
    w.writeString("");
    w.writeString("hello");
    w.writeString("世界 😀");
    const r = new Reader(w.finish());
    expect(r.readString()).toBe("");
    expect(r.readString()).toBe("hello");
    expect(r.readString()).toBe("世界 😀");
  });

  it("writes and reads bytes", () => {
    const w = new Writer();
    w.writeBytes(new Uint8Array([1, 2, 3]));
    w.writeBytes(new Uint8Array(0));
    const r = new Reader(w.finish());
    expect(r.readBytes()).toEqual(new Uint8Array([1, 2, 3]));
    expect(r.readBytes()).toEqual(new Uint8Array(0));
  });

  it("grows buffer automatically", () => {
    const w = new Writer(4);
    for (let i = 0; i < 1000; i++) w.writeU8(i & 0xff);
    const r = new Reader(w.finish());
    for (let i = 0; i < 1000; i++) expect(r.readU8()).toBe(i & 0xff);
  });

  it("grows from zero or negative initial size", () => {
    for (const size of [0, -1]) {
      const w = new Writer(size);
      w.writeU8(1);
      expect(Array.from(w.finish())).toEqual([1]);
    }
  });

  it("reset clears position", () => {
    const w = new Writer();
    w.writeU8(42);
    w.reset();
    w.writeU8(99);
    const buf = w.finish();
    expect(buf.length).toBe(1);
    expect(buf[0]).toBe(99);
  });

  it("reader throws on underflow", () => {
    const r = new Reader(new Uint8Array(1));
    r.readU8();
    expect(() => r.readU8()).toThrow(/Buffer underflow/);
  });
});
