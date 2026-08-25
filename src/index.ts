/**
 * nitrobuf — Fast, lightweight binary serialization with inline TypeScript schemas.
 */

export { nb } from "./schema/index.js";
export { SchemaType } from "./schema/index.js";
export type { Infer } from "./schema/index.js";
export type { AnyTypeNode } from "./schema/index.js";
export { Writer } from "./codec/index.js";
export { Reader } from "./codec/index.js";
export { dynamicEncodeToBytes, dynamicDecodeFromBytes } from "./dynamic/index.js";

import { setCompilerFactory } from "./schema/schema.js";
import { compileJit, forceMode as _forceMode, probeJit } from "./codegen/jit.js";
import { compileInterpreter } from "./codegen/interpreter.js";
import type { AnyTypeNode } from "./schema/types.js";

let currentMode: "auto" | "jit" | "interpreter" = "auto";

function getCompiler(node: AnyTypeNode) {
  if (currentMode === "interpreter") return compileInterpreter(node);
  if (currentMode === "jit") return compileJit(node);
  return probeJit() ? compileJit(node) : compileInterpreter(node);
}

setCompilerFactory(getCompiler);

/**
 * Configure the codec compilation strategy.
 */
export function configure(options: { mode?: "auto" | "jit" | "interpreter" }): void {
  if (options.mode) {
    currentMode = options.mode;
    _forceMode(options.mode);
  }
}

export type CompilerMode = "jit" | "interpreter";

/** Effective compiler for schemas that have not been compiled yet. */
export function getCompilerMode(): CompilerMode {
  if (currentMode === "interpreter") return "interpreter";
  return probeJit() ? "jit" : "interpreter";
}
