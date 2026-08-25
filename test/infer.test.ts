import { describe, expectTypeOf, it } from "vitest";
import { nb, type Infer } from "../src/index.js";

describe("Infer", () => {
  it("extracts the README User shape", () => {
    const User = nb.struct({
      id: nb.uint,
      name: nb.string,
      email: nb.optional(nb.string),
      role: nb.enumOf(["admin", "user", "guest"]),
      tags: nb.array(nb.string),
      createdAt: nb.date,
    });

    type User = Infer<typeof User>;

    expectTypeOf<User>().toEqualTypeOf<{
      id: number;
      name: string;
      email?: string;
      role: "admin" | "user" | "guest";
      tags: string[];
      createdAt: Date;
    }>();

    expectTypeOf(User.encode).parameter(0).toMatchTypeOf<{
      id: number;
      name: string;
      role: "admin" | "user" | "guest";
      tags: string[];
      createdAt: Date;
    }>();
  });

  it("infers array, map, optional, nullable, union", () => {
    const Numbers = nb.array(nb.uint);
    expectTypeOf<Infer<typeof Numbers>>().toEqualTypeOf<number[]>();

    const Config = nb.map(nb.string, nb.uint);
    expectTypeOf<Infer<typeof Config>>().toEqualTypeOf<Map<string, number>>();

    const Maybe = nb.optional(nb.string);
    expectTypeOf<Infer<typeof Maybe>>().toEqualTypeOf<string | undefined>();

    const OrNull = nb.nullable(nb.uint);
    expectTypeOf<Infer<typeof OrNull>>().toEqualTypeOf<number | null>();

    const Shape = nb.union({
      text: nb.string,
      num: nb.uint,
    });
    expectTypeOf<Infer<typeof Shape>>().toEqualTypeOf<
      { tag: "text"; value: string } | { tag: "num"; value: number }
    >();
  });

  it("keeps nb.any fields required on structs", () => {
    const S = nb.struct({ extra: nb.any, name: nb.string });
    expectTypeOf<Infer<typeof S>>().toEqualTypeOf<{ extra: unknown; name: string }>();
  });
});
