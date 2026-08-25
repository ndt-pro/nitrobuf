import { describe, it, expect } from "vitest";
import { dynamicEncodeToBytes, dynamicDecodeFromBytes } from "../src/dynamic/index.js";

function roundTrip(value: unknown): unknown {
  return dynamicDecodeFromBytes(dynamicEncodeToBytes(value));
}

describe("dynamic codec", () => {
  it("null", () => expect(roundTrip(null)).toBe(null));
  it("undefined", () => expect(roundTrip(undefined)).toBe(undefined));
  it("true", () => expect(roundTrip(true)).toBe(true));
  it("false", () => expect(roundTrip(false)).toBe(false));

  it("positive integer", () => expect(roundTrip(42)).toBe(42));
  it("zero", () => expect(roundTrip(0)).toBe(0));
  it("large uint", () => expect(roundTrip(0xffffffff)).toBe(0xffffffff));
  it("negative integer", () => expect(roundTrip(-42)).toBe(-42));

  it("float", () => expect(roundTrip(3.14)).toBe(3.14));
  it("NaN", () => expect(Number.isNaN(roundTrip(NaN))).toBe(true));
  it("Infinity", () => expect(roundTrip(Infinity)).toBe(Infinity));
  it("-Infinity", () => expect(roundTrip(-Infinity)).toBe(-Infinity));

  it("string", () => expect(roundTrip("hello 世界")).toBe("hello 世界"));
  it("empty string", () => expect(roundTrip("")).toBe(""));

  it("Uint8Array", () => {
    const val = new Uint8Array([1, 2, 3]);
    expect(roundTrip(val)).toEqual(val);
  });

  it("Date", () => {
    const d = new Date("2025-06-15T12:00:00Z");
    const result = roundTrip(d) as Date;
    expect(result).toBeInstanceOf(Date);
    expect(result.getTime()).toBe(d.getTime());
  });

  it("bigint", () => {
    expect(roundTrip(42n)).toBe(42n);
    expect(roundTrip(-12345678901234567890n)).toBe(-12345678901234567890n);
    expect(roundTrip(0n)).toBe(0n);
  });

  it("array", () => {
    expect(roundTrip([1, "two", null, true])).toEqual([1, "two", null, true]);
    expect(roundTrip([])).toEqual([]);
  });

  it("nested array", () => {
    expect(
      roundTrip([
        [1, 2],
        [3, [4]],
      ]),
    ).toEqual([
      [1, 2],
      [3, [4]],
    ]);
  });

  it("object", () => {
    expect(roundTrip({ a: 1, b: "two", c: null })).toEqual({ a: 1, b: "two", c: null });
    expect(roundTrip({})).toEqual({});
  });

  it("nested object", () => {
    const val = { user: { name: "Alice", scores: [100, 200] } };
    expect(roundTrip(val)).toEqual(val);
  });

  it("mixed deeply nested structure", () => {
    const val = {
      users: [
        { name: "Alice", tags: ["admin"], meta: { active: true } },
        { name: "Bob", tags: [], meta: { active: false } },
      ],
      total: 2,
    };
    expect(roundTrip(val)).toEqual(val);
  });

  it("oversized array length throws", () => {
    expect(() =>
      dynamicDecodeFromBytes(new Uint8Array([0x09, 0xff, 0xff, 0xff, 0xff, 0x0f])),
    ).toThrow(RangeError);
  });

  it("rejects Map and Set", () => {
    expect(() => dynamicEncodeToBytes(new Map([["a", 1]]))).toThrow(/unsupported/);
    expect(() => dynamicEncodeToBytes(new Set([1]))).toThrow(/unsupported/);
  });

  it("does not apply __proto__ as object prototype", () => {
    const bytes = dynamicEncodeToBytes(JSON.parse('{"__proto__":{"polluted":true}}'));
    const obj = dynamicDecodeFromBytes(bytes) as object;
    expect(Object.getPrototypeOf(obj)).toBeNull();
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });
});
