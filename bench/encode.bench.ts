import { describe, bench } from "vitest";
import { nb } from "../src/index.js";

const UserSchema = nb.struct({
  id: nb.uint,
  name: nb.string,
  email: nb.string,
  age: nb.uint,
  active: nb.bool,
  tags: nb.array(nb.string),
  score: nb.f64,
});

const sampleUser = {
  id: 12345,
  name: "Alice Wonderland",
  email: "alice@example.com",
  age: 30,
  active: true,
  tags: ["admin", "premium", "verified"],
  score: 98.5,
};

const jsonStr = JSON.stringify(sampleUser);
const nitroBytes = UserSchema.encode(sampleUser);

describe("encode — simple struct", () => {
  bench("nitrobuf", () => {
    UserSchema.encode(sampleUser);
  });

  bench("JSON.stringify", () => {
    JSON.stringify(sampleUser);
  });
});

describe("decode — simple struct", () => {
  bench("nitrobuf", () => {
    UserSchema.decode(nitroBytes);
  });

  bench("JSON.parse", () => {
    JSON.parse(jsonStr);
  });
});

describe("round-trip — simple struct", () => {
  bench("nitrobuf", () => {
    UserSchema.decode(UserSchema.encode(sampleUser));
  });

  bench("JSON", () => {
    JSON.parse(JSON.stringify(sampleUser));
  });
});

describe("encoded size comparison", () => {
  bench("nitrobuf size check", () => {
    const buf = UserSchema.encode(sampleUser);
    if (buf.length === 0) throw new Error("empty");
  });

  bench("JSON size check", () => {
    const str = JSON.stringify(sampleUser);
    if (str.length === 0) throw new Error("empty");
  });
});

const NestedSchema = nb.struct({
  users: nb.array(
    nb.struct({
      id: nb.uint,
      name: nb.string,
      scores: nb.array(nb.f64),
    }),
  ),
  total: nb.uint,
});

const nestedData = {
  users: Array.from({ length: 100 }, (_, i) => ({
    id: i,
    name: `User ${i}`,
    scores: [Math.random() * 100, Math.random() * 100, Math.random() * 100],
  })),
  total: 100,
};

const nestedJson = JSON.stringify(nestedData);
const nestedNitro = NestedSchema.encode(nestedData);

describe("encode — nested (100 users)", () => {
  bench("nitrobuf", () => {
    NestedSchema.encode(nestedData);
  });

  bench("JSON.stringify", () => {
    JSON.stringify(nestedData);
  });
});

describe("decode — nested (100 users)", () => {
  bench("nitrobuf", () => {
    NestedSchema.decode(nestedNitro);
  });

  bench("JSON.parse", () => {
    JSON.parse(nestedJson);
  });
});
