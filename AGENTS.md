# AGENTS.md — nitrobuf

Guide for AI agents working on this codebase.

## Repository Map

```
src/
  index.ts              — Public entry point. Exports nb, SchemaType, Infer, configure.
                          Initializes the compiler factory (JIT or interpreter).
  schema/
    types.ts            — IR node types (TypeKind, WireType, AnyTypeNode, StructField, etc.)
    builders.ts         — Schema builder API (nb.u8, nb.struct, nb.array, etc.)
    schema.ts           — SchemaType class: wraps IR node, provides encode/decode, lazy compilation
    infer.ts            — Type-level Infer<T> — purely compile-time, no runtime code
    index.ts            — Re-exports
  codec/
    writer.ts           — Growable Uint8Array writer with typed write methods
    reader.ts           — DataView-based reader with typed read methods and bounds checking
    varint.ts           — LEB128 unsigned varint, zigzag signed varint (32-bit and 64-bit)
    utf8.ts             — UTF-8 encode/decode (manual loop for short strings, TextEncoder for long)
    index.ts            — Re-exports
  codegen/
    interpreter.ts      — Closure-based codec compiler (reference implementation, CSP-safe)
    jit.ts              — JIT compiler via new Function (fast path, auto-fallback)
    index.ts            — Re-exports
  dynamic/
    index.ts            — Schemaless type-tagged codec (msgpack-like). Used by nb.any and socket.io fallback.
  socketio/
    index.ts            — createParser() factory, NitrobufEncoder, NitrobufDecoder
    emitter.ts          — Minimal event emitter (zero-dep, matches socket.io Decoder contract)
    validate.ts         — Packet validation + PacketType enum
test/
  codec.test.ts         — Writer/Reader/varint/utf8 unit tests
  schema.test.ts        — Schema encode/decode for every type, struct optionals, nesting, golden fixtures
  parity.test.ts        — JIT vs interpreter byte-identical output for all schema types
  property.test.ts      — Property-based round-trip tests (fast-check)
  dynamic.test.ts       — Dynamic codec unit tests
  socketio.test.ts      — Socket.IO parser unit tests (all packet types, edge cases)
  socketio-e2e.test.ts  — Socket.IO e2e with real server+client
bench/
  encode.bench.ts       — Benchmark vs JSON
```

## Invariants (MUST NOT be violated)

1. **Wire format stability** — The binary encoding of any value for a given schema MUST NOT change across versions. Existing golden fixture tests lock this down. Never modify encoding without updating goldens and bumping a major version.

2. **JIT/Interpreter parity** — The JIT compiler and the closure-based interpreter MUST produce byte-identical output for every schema. The parity test suite enforces this. If you change one, you must change the other.

3. **Zero runtime dependencies** — The core `nitrobuf` package must have zero `dependencies` in package.json. Only `devDependencies` and optional `peerDependencies` are allowed.

4. **Encoder is stateless** — The Socket.IO Encoder class MUST be stateless. Socket.IO server shares a single Encoder instance across all connections. Never add per-connection state.

5. **Decoder.destroy() resets, not destroys** — The Socket.IO Decoder's `destroy()` must reset internal state so the instance can be reused after reconnect.

6. **id stays undefined, not null** — When a Socket.IO packet has no ack id, `packet.id` MUST be `undefined`, never `null`. Socket.IO checks `id === undefined`.

7. **CONNECT packet fidelity** — The `nsp` string and `data` object of CONNECT packets MUST round-trip exactly. The `sid`/`pid` fields inside `data` are critical for the handshake.

## Commands

```bash
pnpm test           # Run all tests (vitest)
pnpm run build      # Build ESM+CJS+DTS (tsup)
pnpm run lint       # Lint (oxlint)
pnpm run typecheck  # Type-check (tsc --noEmit)
pnpm run fmt        # Format (oxfmt)
pnpm run bench      # Run benchmarks
pnpm run test:watch # Watch mode
```

## Adding a New Type

1. Add the `TypeKind` variant to `src/schema/types.ts`
2. Add the node interface and update `AnyTypeNode` union
3. Add `wireTypeForKind` mapping
4. Add the builder function to `src/schema/builders.ts`
5. Add the type mapping to `src/schema/infer.ts` (InferNode)
6. Add encode/decode cases in `src/codegen/interpreter.ts`
7. Add encode/decode cases in `src/codegen/jit.ts`
8. If the type can appear in dynamic data, add it to `src/dynamic/index.ts`
9. Add unit tests, golden fixtures, and parity test entries
10. Update README type table

## Architecture Notes

- **Schema compilation is lazy** — `SchemaType.encode/decode` triggers compilation on first call via the registered `compilerFactory`.
- **JIT probe** — `probeJit()` runs `new Function("return 42")` once to detect CSP restrictions. If it fails, all subsequent compilations use the interpreter.
- **Positional struct encoding** — Fields in declaration order, optional fields tracked by a presence bitmask prefix. Very compact, no field IDs overhead.
- **Tagged struct encoding** — Each field: `varint(fieldId << 3 | wireType)` + payload, terminated by `0x00`. Unknown fields are skipped by wire type. Compatible with protobuf-style forward/backward compat.
- **Dynamic codec** — Type-tagged format (1-byte tag + value). Supports null, undefined, bool, uint, int, f64, string, bytes, array, object, bigint, date.
- **Socket.IO parser** — Packs entire packet into a single `Uint8Array`. Header byte encodes packet type, hasId, nspIsRoot, and payload kind (none/schema/dynamic). Schema-encoded events embed the event name as a string prefix for the decoder to look up the right schema.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **nitrobuf** (461 symbols, 1254 relationships, 37 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/nitrobuf/context` | Codebase overview, check index freshness |
| `gitnexus://repo/nitrobuf/clusters` | All functional areas |
| `gitnexus://repo/nitrobuf/processes` | All execution flows |
| `gitnexus://repo/nitrobuf/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
