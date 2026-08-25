import { afterEach, describe, expect, it } from "vitest";
import { configure, getCompilerMode } from "../src/index.js";

describe("getCompilerMode", () => {
  afterEach(() => {
    configure({ mode: "auto" });
  });

  it("defaults to jit when new Function is available", () => {
    expect(getCompilerMode()).toBe("jit");
  });

  it("returns interpreter when configured", () => {
    configure({ mode: "interpreter" });
    expect(getCompilerMode()).toBe("interpreter");
  });

  it("returns jit after switching back to auto", () => {
    configure({ mode: "interpreter" });
    configure({ mode: "auto" });
    expect(getCompilerMode()).toBe("jit");
  });

  it("returns jit when mode is forced jit and new Function works", () => {
    configure({ mode: "jit" });
    expect(getCompilerMode()).toBe("jit");
  });
});
