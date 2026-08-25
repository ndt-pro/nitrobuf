import { describe, it, expect, afterAll } from "vitest";
import { nb, configure, SchemaType } from "../src/index.js";

/**
 * Parity test: JIT and interpreter MUST produce identical bytes for every schema.
 */

const schemas = [
  { name: "u8", schema: nb.u8, value: 42 },
  { name: "u16", schema: nb.u16, value: 1000 },
  { name: "u32", schema: nb.u32, value: 100000 },
  { name: "u64", schema: nb.u64, value: 9999999999n },
  { name: "i8", schema: nb.i8, value: -42 },
  { name: "i16", schema: nb.i16, value: -1000 },
  { name: "i32", schema: nb.i32, value: -100000 },
  { name: "i64", schema: nb.i64, value: -9999999999n },
  { name: "f32", schema: nb.f32, value: 3.14 },
  { name: "f64", schema: nb.f64, value: Math.PI },
  { name: "uint", schema: nb.uint, value: 300 },
  { name: "int", schema: nb.int, value: -300 },
  { name: "bool", schema: nb.bool, value: true },
  { name: "string", schema: nb.string, value: "hello 世界" },
  { name: "bytes", schema: nb.bytes, value: new Uint8Array([1, 2, 3]) },
  { name: "date", schema: nb.date, value: new Date("2025-01-01") },
  { name: "bigint", schema: nb.bigint, value: -12345678901234567890n },
  { name: "array<uint>", schema: nb.array(nb.uint), value: [1, 2, 3, 4, 5] },
  { name: "optional<string> present", schema: nb.optional(nb.string), value: "hi" },
  { name: "optional<string> absent", schema: nb.optional(nb.string), value: undefined },
  { name: "nullable<uint> present", schema: nb.nullable(nb.uint), value: 42 },
  { name: "nullable<uint> null", schema: nb.nullable(nb.uint), value: null },
  { name: "enum", schema: nb.enumOf(["a", "b", "c"]), value: "b" },
  {
    name: "union",
    schema: nb.union({ text: nb.string, num: nb.uint }),
    value: { tag: "text", value: "hi" },
  },
  {
    name: "struct",
    schema: nb.struct({
      id: nb.uint,
      name: nb.string,
      email: nb.optional(nb.string),
      tags: nb.array(nb.string),
    }),
    value: { id: 42, name: "Alice", email: "a@b.com", tags: ["x", "y"] },
  },
  {
    name: "map<string,uint>",
    schema: nb.map(nb.string, nb.uint),
    value: new Map([
      ["a", 1],
      ["b", 2],
    ]),
  },
  { name: "any(object)", schema: nb.any, value: { a: 1, b: [2, "three"] } },
  {
    name: "tagged struct",
    schema: nb.struct(
      {
        id: nb.uint.id(1),
        name: nb.string.id(2),
        email: nb.optional(nb.string).id(3),
      },
      { tagged: true },
    ),
    value: { id: 7, name: "Bob", email: "b@c.com" },
  },
];

describe("JIT vs Interpreter parity", () => {
  for (const { name, schema, value } of schemas) {
    it(`${name}: identical bytes`, () => {
      configure({ mode: "jit" });
      const jitSchema = rebuildSchema(schema);
      const jitBytes = jitSchema.encode(value);

      configure({ mode: "interpreter" });
      const interpSchema = rebuildSchema(schema);
      const interpBytes = interpSchema.encode(value);

      expect(Array.from(jitBytes)).toEqual(Array.from(interpBytes));

      const jitDecoded = jitSchema.decode(jitBytes);
      const interpDecoded = interpSchema.decode(interpBytes);

      if (value instanceof Date) {
        expect((jitDecoded as Date).getTime()).toBe((interpDecoded as Date).getTime());
      } else if (value instanceof Map) {
        expect([...(jitDecoded as Map<any, any>).entries()]).toEqual([
          ...(interpDecoded as Map<any, any>).entries(),
        ]);
      } else if (value instanceof Uint8Array) {
        expect(Array.from(jitDecoded as Uint8Array)).toEqual(
          Array.from(interpDecoded as Uint8Array),
        );
      } else {
        expect(jitDecoded).toEqual(interpDecoded);
      }
    });
  }

  it("out-of-range integers throw in both modes", () => {
    configure({ mode: "jit" });
    const jit = rebuildSchema(nb.u8);
    configure({ mode: "interpreter" });
    const interp = rebuildSchema(nb.u8);
    expect(() => jit.encode(999)).toThrow(RangeError);
    expect(() => interp.encode(999)).toThrow(RangeError);
  });

  afterAll(() => {
    configure({ mode: "auto" });
  });
});

function rebuildSchema(schema: any) {
  return new SchemaType(schema._node);
}
