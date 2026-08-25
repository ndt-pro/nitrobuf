import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { nb } from "../src/index.js";
import { dynamicEncodeToBytes, dynamicDecodeFromBytes } from "../src/dynamic/index.js";

describe("property-based round-trip tests", () => {
  it("uint round-trips all non-negative integers", () => {
    fc.assert(
      fc.property(fc.nat(0xffffffff), (n) => {
        expect(nb.uint.decode(nb.uint.encode(n))).toBe(n);
      }),
    );
  });

  it("int round-trips all integers in i32 range", () => {
    fc.assert(
      fc.property(fc.integer({ min: -2147483648, max: 2147483647 }), (n) => {
        expect(nb.int.decode(nb.int.encode(n))).toBe(n);
      }),
    );
  });

  it("f64 round-trips all doubles", () => {
    fc.assert(
      fc.property(fc.double({ noNaN: true }), (n) => {
        const result = nb.f64.decode(nb.f64.encode(n));
        if (Object.is(n, -0)) {
          expect(Object.is(result, -0)).toBe(true);
        } else {
          expect(result).toBe(n);
        }
      }),
    );
  });

  it("string round-trips all unicode strings", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(nb.string.decode(nb.string.encode(s))).toBe(s);
      }),
    );
  });

  it("bytes round-trips all byte arrays", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 0, maxLength: 1000 }), (buf) => {
        expect(nb.bytes.decode(nb.bytes.encode(buf))).toEqual(buf);
      }),
    );
  });

  it("bool round-trips", () => {
    fc.assert(
      fc.property(fc.boolean(), (b) => {
        expect(nb.bool.decode(nb.bool.encode(b))).toBe(b);
      }),
    );
  });

  it("array<uint> round-trips", () => {
    const schema = nb.array(nb.uint);
    fc.assert(
      fc.property(fc.array(fc.nat(0xffffffff)), (arr) => {
        expect(schema.decode(schema.encode(arr))).toEqual(arr);
      }),
    );
  });

  it("struct round-trips", () => {
    const schema = nb.struct({
      id: nb.uint,
      name: nb.string,
      active: nb.bool,
    });
    fc.assert(
      fc.property(
        fc.record({
          id: fc.nat(0xffffffff),
          name: fc.string(),
          active: fc.boolean(),
        }),
        (val) => {
          expect(schema.decode(schema.encode(val))).toEqual(val);
        },
      ),
    );
  });

  it("dynamic codec round-trips arbitrary JSON-like values", () => {
    const jsonArb = fc.letrec((tie) => ({
      value: fc.oneof(
        fc.constant(null),
        fc.boolean(),
        fc.integer({ min: -2147483648, max: 2147483647 }),
        fc.string(),
        fc.array(tie("value"), { maxLength: 5 }),
        fc.dictionary(fc.string({ minLength: 1, maxLength: 10 }), tie("value"), { maxKeys: 5 }),
      ),
    }));

    fc.assert(
      fc.property(jsonArb.value, (val) => {
        const result = dynamicDecodeFromBytes(dynamicEncodeToBytes(val));
        expect(result).toEqual(val);
      }),
      { numRuns: 200 },
    );
  });
});
