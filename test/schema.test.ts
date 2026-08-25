import { describe, it, expect } from "vitest";
import { nb } from "../src/index.js";

function roundTrip<T>(schema: any, value: T): T {
  const encoded = schema.encode(value);
  expect(encoded).toBeInstanceOf(Uint8Array);
  return schema.decode(encoded);
}

describe("primitive schemas", () => {
  it("u8", () => {
    expect(roundTrip(nb.u8, 0)).toBe(0);
    expect(roundTrip(nb.u8, 255)).toBe(255);
  });

  it("u16", () => {
    expect(roundTrip(nb.u16, 0)).toBe(0);
    expect(roundTrip(nb.u16, 65535)).toBe(65535);
  });

  it("u32", () => {
    expect(roundTrip(nb.u32, 0)).toBe(0);
    expect(roundTrip(nb.u32, 0xffffffff)).toBe(0xffffffff);
  });

  it("u64", () => {
    expect(roundTrip(nb.u64, 0n)).toBe(0n);
    expect(roundTrip(nb.u64, 2n ** 64n - 1n)).toBe(18446744073709551615n);
  });

  it("i8", () => {
    expect(roundTrip(nb.i8, -128)).toBe(-128);
    expect(roundTrip(nb.i8, 127)).toBe(127);
  });

  it("i16", () => {
    expect(roundTrip(nb.i16, -32768)).toBe(-32768);
    expect(roundTrip(nb.i16, 32767)).toBe(32767);
  });

  it("i32", () => {
    expect(roundTrip(nb.i32, -2147483648)).toBe(-2147483648);
    expect(roundTrip(nb.i32, 2147483647)).toBe(2147483647);
  });

  it("i64", () => {
    expect(roundTrip(nb.i64, -9223372036854775808n)).toBe(-9223372036854775808n);
    expect(roundTrip(nb.i64, 9223372036854775807n)).toBe(9223372036854775807n);
  });

  it("f32", () => {
    const val = roundTrip(nb.f32, 3.14);
    expect(val).toBeCloseTo(3.14, 5);
  });

  it("f64", () => {
    expect(roundTrip(nb.f64, Math.PI)).toBe(Math.PI);
    expect(roundTrip(nb.f64, Infinity)).toBe(Infinity);
    expect(roundTrip(nb.f64, -Infinity)).toBe(-Infinity);
    expect(Number.isNaN(roundTrip(nb.f64, NaN))).toBe(true);
  });

  it("uint (varint)", () => {
    expect(roundTrip(nb.uint, 0)).toBe(0);
    expect(roundTrip(nb.uint, 127)).toBe(127);
    expect(roundTrip(nb.uint, 128)).toBe(128);
    expect(roundTrip(nb.uint, 100000)).toBe(100000);
  });

  it("int (zigzag varint)", () => {
    expect(roundTrip(nb.int, 0)).toBe(0);
    expect(roundTrip(nb.int, -1)).toBe(-1);
    expect(roundTrip(nb.int, 1)).toBe(1);
    expect(roundTrip(nb.int, -100000)).toBe(-100000);
  });

  it("bool", () => {
    expect(roundTrip(nb.bool, true)).toBe(true);
    expect(roundTrip(nb.bool, false)).toBe(false);
  });

  it("string", () => {
    expect(roundTrip(nb.string, "")).toBe("");
    expect(roundTrip(nb.string, "hello")).toBe("hello");
    expect(roundTrip(nb.string, "世界 😀 é")).toBe("世界 😀 é");
  });

  it("bytes", () => {
    const val = new Uint8Array([1, 2, 3, 4, 5]);
    expect(roundTrip(nb.bytes, val)).toEqual(val);
    expect(roundTrip(nb.bytes, new Uint8Array(0))).toEqual(new Uint8Array(0));
  });

  it("date", () => {
    const now = new Date();
    const result = roundTrip(nb.date, now);
    expect(result.getTime()).toBe(now.getTime());
  });

  it("bigint", () => {
    expect(roundTrip(nb.bigint, 0n)).toBe(0n);
    expect(roundTrip(nb.bigint, 123456789012345678901234567890n)).toBe(
      123456789012345678901234567890n,
    );
    expect(roundTrip(nb.bigint, -42n)).toBe(-42n);
  });
});

describe("compound schemas", () => {
  it("array of uint", () => {
    const schema = nb.array(nb.uint);
    expect(roundTrip(schema, [])).toEqual([]);
    expect(roundTrip(schema, [1, 2, 3])).toEqual([1, 2, 3]);
  });

  it("array of string", () => {
    const schema = nb.array(nb.string);
    expect(roundTrip(schema, ["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("nested array", () => {
    const schema = nb.array(nb.array(nb.uint));
    expect(roundTrip(schema, [[1, 2], [3]])).toEqual([[1, 2], [3]]);
  });

  it("map of string -> uint", () => {
    const schema = nb.map(nb.string, nb.uint);
    const m = new Map([
      ["a", 1],
      ["b", 2],
    ]);
    const result = roundTrip(schema, m);
    expect(result).toBeInstanceOf(Map);
    expect(result.get("a")).toBe(1);
    expect(result.get("b")).toBe(2);
  });

  it("optional present", () => {
    const schema = nb.optional(nb.string);
    expect(roundTrip(schema, "hello")).toBe("hello");
  });

  it("optional absent", () => {
    const schema = nb.optional(nb.string);
    expect(roundTrip(schema, undefined)).toBe(undefined);
  });

  it("nullable present", () => {
    const schema = nb.nullable(nb.string);
    expect(roundTrip(schema, "hello")).toBe("hello");
  });

  it("nullable null", () => {
    const schema = nb.nullable(nb.string);
    expect(roundTrip(schema, null)).toBe(null);
  });

  it("enum", () => {
    const schema = nb.enumOf(["admin", "user", "guest"]);
    expect(roundTrip(schema, "admin")).toBe("admin");
    expect(roundTrip(schema, "user")).toBe("user");
    expect(roundTrip(schema, "guest")).toBe("guest");
  });

  it("enum rejects unknown variant", () => {
    const schema = nb.enumOf(["admin", "user"]);
    expect(() => schema.encode("unknown" as any)).toThrow(/Unknown enum/);
  });

  it("union", () => {
    const schema = nb.union({
      text: nb.string,
      number: nb.uint,
    });
    expect(roundTrip(schema, { tag: "text", value: "hello" })).toEqual({
      tag: "text",
      value: "hello",
    });
    expect(roundTrip(schema, { tag: "number", value: 42 })).toEqual({ tag: "number", value: 42 });
  });

  it("any", () => {
    expect(roundTrip(nb.any, null)).toBe(null);
    expect(roundTrip(nb.any, 42)).toBe(42);
    expect(roundTrip(nb.any, "hello")).toBe("hello");
    expect(roundTrip(nb.any, [1, "two", null])).toEqual([1, "two", null]);
    expect(roundTrip(nb.any, { a: 1, b: "two" })).toEqual({ a: 1, b: "two" });
  });
});

describe("struct", () => {
  it("simple struct", () => {
    const schema = nb.struct({
      id: nb.uint,
      name: nb.string,
      active: nb.bool,
    });
    const val = { id: 42, name: "Alice", active: true };
    expect(roundTrip(schema, val)).toEqual(val);
  });

  it("struct with optional fields", () => {
    const schema = nb.struct({
      id: nb.uint,
      name: nb.string,
      email: nb.optional(nb.string),
      age: nb.optional(nb.uint),
    });

    const withAll = { id: 1, name: "Alice", email: "a@b.com", age: 30 };
    expect(roundTrip(schema, withAll)).toEqual(withAll);

    const withNone = { id: 2, name: "Bob" };
    const result = roundTrip(schema, withNone);
    expect(result.id).toBe(2);
    expect(result.name).toBe("Bob");
    expect(result.email).toBeUndefined();
    expect(result.age).toBeUndefined();
  });

  it("struct with more than 8 optional fields (multi-byte bitmask)", () => {
    const fields: Record<string, any> = { required: nb.uint };
    for (let i = 0; i < 12; i++) fields[`opt${i}`] = nb.optional(nb.uint);
    const schema = nb.struct(fields);

    const allPresent: Record<string, any> = { required: 1 };
    for (let i = 0; i < 12; i++) allPresent[`opt${i}`] = i;
    expect(roundTrip(schema, allPresent)).toEqual(allPresent);

    const nonePresent = { required: 1 };
    const result = roundTrip(schema, nonePresent);
    expect(result.required).toBe(1);
    for (let i = 0; i < 12; i++) expect(result[`opt${i}`]).toBeUndefined();
  });

  it("nested struct", () => {
    const Address = nb.struct({
      street: nb.string,
      city: nb.string,
    });
    const Person = nb.struct({
      name: nb.string,
      address: Address,
    });
    const val = { name: "Alice", address: { street: "123 Main", city: "NYC" } };
    expect(roundTrip(Person, val)).toEqual(val);
  });

  it("struct with array field", () => {
    const schema = nb.struct({
      name: nb.string,
      tags: nb.array(nb.string),
    });
    const val = { name: "Alice", tags: ["a", "b", "c"] };
    expect(roundTrip(schema, val)).toEqual(val);
  });

  it("struct with enum field", () => {
    const schema = nb.struct({
      name: nb.string,
      role: nb.enumOf(["admin", "user"]),
    });
    const val = { name: "Alice", role: "admin" };
    expect(roundTrip(schema, val)).toEqual(val);
  });

  it("encode is safe when a getter re-enters another schema.encode", () => {
    const other = nb.u32;
    const schema = nb.struct({ a: nb.u32, b: nb.u32 });
    const val = {
      a: 1,
      get b() {
        other.encode(99);
        return 2;
      },
    };
    expect(Array.from(schema.encode(val))).toEqual(Array.from(schema.encode({ a: 1, b: 2 })));
  });
});

describe("tagged struct (schema evolution)", () => {
  it("basic tagged struct", () => {
    const schema = nb.struct(
      {
        id: nb.uint.id(1),
        name: nb.string.id(2),
      },
      { tagged: true },
    );

    const val = { id: 42, name: "Alice" };
    expect(roundTrip(schema, val)).toEqual(val);
  });

  it("forward compat: decoder ignores unknown fields", () => {
    const V2 = nb.struct(
      {
        id: nb.uint.id(1),
        name: nb.string.id(2),
        extra: nb.string.id(3),
      },
      { tagged: true },
    );

    const V1 = nb.struct(
      {
        id: nb.uint.id(1),
        name: nb.string.id(2),
      },
      { tagged: true },
    );

    const encoded = V2.encode({ id: 1, name: "Alice", extra: "x" });
    const decoded = V1.decode(encoded);
    expect(decoded.id).toBe(1);
    expect(decoded.name).toBe("Alice");
    expect((decoded as any).extra).toBeUndefined();
  });

  it("forward compat: decoder skips unknown date fields", () => {
    const V2 = nb.struct(
      {
        id: nb.uint.id(1),
        name: nb.string.id(2),
        createdAt: nb.date.id(3),
      },
      { tagged: true },
    );

    const V1 = nb.struct(
      {
        id: nb.uint.id(1),
        name: nb.string.id(2),
      },
      { tagged: true },
    );

    const createdAt = new Date("2024-06-15T12:00:00.000Z");
    const decoded = V1.decode(V2.encode({ id: 1, name: "Alice", createdAt }));
    expect(decoded.id).toBe(1);
    expect(decoded.name).toBe("Alice");
    expect((decoded as any).createdAt).toBeUndefined();
  });

  it("backward compat: missing fields become undefined", () => {
    const V1 = nb.struct(
      {
        id: nb.uint.id(1),
        name: nb.string.id(2),
      },
      { tagged: true },
    );

    const V2 = nb.struct(
      {
        id: nb.uint.id(1),
        name: nb.string.id(2),
        email: nb.optional(nb.string).id(3),
      },
      { tagged: true },
    );

    const encoded = V1.encode({ id: 1, name: "Alice" });
    const decoded = V2.decode(encoded);
    expect(decoded.id).toBe(1);
    expect(decoded.name).toBe("Alice");
    expect(decoded.email).toBeUndefined();
  });

  it("tagged struct with optional fields", () => {
    const schema = nb.struct(
      {
        id: nb.uint.id(1),
        email: nb.optional(nb.string).id(2),
      },
      { tagged: true },
    );

    expect(roundTrip(schema, { id: 1, email: "a@b.com" })).toEqual({ id: 1, email: "a@b.com" });
    expect(roundTrip(schema, { id: 2 })).toEqual({ id: 2 });
  });

  it("rejects fieldId 0", () => {
    expect(() => nb.uint.id(0)).toThrow(/fieldId/);
    expect(() => nb.string.id(-1)).toThrow(/fieldId/);
  });

  it("rejects fieldId that overflows the tagged key", () => {
    expect(() => nb.uint.id(0x10000000)).toThrow(/fieldId/);
  });

  it("requires explicit .id() on tagged fields", () => {
    expect(() => nb.struct({ id: nb.uint, name: nb.string.id(2) }, { tagged: true })).toThrow(
      /requires \.id/,
    );
  });

  it("rejects duplicate tagged field IDs", () => {
    expect(() => nb.struct({ a: nb.uint.id(1), b: nb.string.id(1) }, { tagged: true })).toThrow(
      /duplicate fieldId 1/,
    );
  });

  it("skips known fields with mismatched wire type", () => {
    const schema = nb.struct({ n: nb.uint.id(1) }, { tagged: true });
    // key = (1 << 3) | LengthDelimited(2) = 10, payload "A", terminator
    const decoded = schema.decode(new Uint8Array([10, 1, 0x41, 0]));
    expect(decoded.n).toBeUndefined();
  });

  it("does not read past length-delimited envelope", () => {
    const schema = nb.struct(
      {
        a: nb.array(nb.u8).id(1),
        b: nb.uint.id(2),
      },
      { tagged: true },
    );
    // field 1 LD, envelope of 1 byte claiming 2 elements — enough trailing
    // bytes exist for those elements, but they belong to field 2
    const buf = new Uint8Array([10, 1, 2, 16, 42, 0]);
    expect(() => schema.decode(buf)).toThrow(RangeError);
  });
});

describe("golden wire format fixtures", () => {
  it("u8(42) = 0x2a", () => {
    expect(Array.from(nb.u8.encode(42))).toEqual([0x2a]);
  });

  it("bool(true) = 0x01, bool(false) = 0x00", () => {
    expect(Array.from(nb.bool.encode(true))).toEqual([0x01]);
    expect(Array.from(nb.bool.encode(false))).toEqual([0x00]);
  });

  it("uint(0) = 0x00", () => {
    expect(Array.from(nb.uint.encode(0))).toEqual([0x00]);
  });

  it("uint(300) = 0xac 0x02", () => {
    expect(Array.from(nb.uint.encode(300))).toEqual([0xac, 0x02]);
  });

  it("string('hi') = 0x02 0x68 0x69", () => {
    expect(Array.from(nb.string.encode("hi"))).toEqual([0x02, 0x68, 0x69]);
  });
});

describe("error cases", () => {
  it("decode truncated buffer throws", () => {
    expect(() => nb.u32.decode(new Uint8Array([1, 2]))).toThrow(/underflow/i);
  });

  it("decode empty buffer for string throws", () => {
    expect(() => nb.string.decode(new Uint8Array([]))).toThrow();
  });

  it("decode truncated varint throws", () => {
    expect(() => nb.uint.decode(new Uint8Array([0x80]))).toThrow(RangeError);
    expect(() => nb.uint.decode(new Uint8Array([0xac]))).toThrow(RangeError);
  });

  it("decode oversized array length throws", () => {
    expect(() => nb.array(nb.u8).decode(new Uint8Array([0xff, 0xff, 0xff, 0xff, 0x0f]))).toThrow(
      RangeError,
    );
  });
});

describe("integer range validation", () => {
  it("u8 rejects out of range", () => {
    expect(() => nb.u8.encode(999)).toThrow(RangeError);
    expect(() => nb.u8.encode(-1)).toThrow(RangeError);
    expect(() => nb.u8.encode(1.5)).toThrow(RangeError);
  });

  it("uint rejects out of range", () => {
    expect(() => nb.uint.encode(2 ** 33)).toThrow(RangeError);
    expect(() => nb.uint.encode(-5)).toThrow(RangeError);
    expect(() => nb.uint.encode(1.5)).toThrow(RangeError);
  });

  it("u8 accepts bounds", () => {
    expect(roundTrip(nb.u8, 0)).toBe(0);
    expect(roundTrip(nb.u8, 255)).toBe(255);
  });
});
