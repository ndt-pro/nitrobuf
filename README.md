# nitrobuf

Fast, lightweight binary serialization with inline TypeScript schemas. No `.proto` files, no code generation step — define schemas right in your code and get type-safe `encode`/`decode` with automatic TypeScript inference.

## Features

- **Inline schemas** — define data shapes in TypeScript, not separate files
- **Full type inference** — `Infer<typeof schema>` extracts the TS type automatically
- **Fast** — JIT-compiled codecs via `new Function`, with safe closure-based fallback for CSP environments
- **Small wire format** — binary encoding with varint, bitmask optionals, and positional fields
- **Schema evolution** — tagged structs support forward/backward compatibility
- **Socket.IO parser** — drop-in replacement for socket.io-parser with per-event schemas
- **Zero runtime dependencies** — the core library has no npm dependencies
- **Dual format** — ships ESM + CJS with full `.d.ts` declarations

## Install

```bash
npm install nitrobuf
```

## Quick Start

```typescript
import { nb, type Infer } from "nitrobuf";

// Define a schema
const User = nb.struct({
  id: nb.uint,
  name: nb.string,
  email: nb.optional(nb.string),
  role: nb.enumOf(["admin", "user", "guest"]),
  tags: nb.array(nb.string),
  createdAt: nb.date,
});

// TypeScript type is automatically inferred
type User = Infer<typeof User>;
// { id: number; name: string; email?: string; role: "admin" | "user" | "guest"; tags: string[]; createdAt: Date }

// Encode to binary
const bytes: Uint8Array = User.encode({
  id: 42,
  name: "Alice",
  email: "alice@example.com",
  role: "admin",
  tags: ["verified"],
  createdAt: new Date(),
});

// Decode back
const user = User.decode(bytes);
```

## Type Reference

| Builder            | TypeScript Type             | Wire Format                      |
| ------------------ | --------------------------- | -------------------------------- |
| `nb.u8`            | `number`                    | 1 byte unsigned                  |
| `nb.u16`           | `number`                    | 2 bytes LE unsigned              |
| `nb.u32`           | `number`                    | 4 bytes LE unsigned              |
| `nb.u64`           | `bigint`                    | 8 bytes LE unsigned              |
| `nb.i8`            | `number`                    | 1 byte signed                    |
| `nb.i16`           | `number`                    | 2 bytes LE signed                |
| `nb.i32`           | `number`                    | 4 bytes LE signed                |
| `nb.i64`           | `bigint`                    | 8 bytes LE signed                |
| `nb.f32`           | `number`                    | 4 bytes IEEE 754                 |
| `nb.f64`           | `number`                    | 8 bytes IEEE 754                 |
| `nb.uint`          | `number`                    | LEB128 varint                    |
| `nb.int`           | `number`                    | Zigzag varint                    |
| `nb.bool`          | `boolean`                   | 1 byte                           |
| `nb.string`        | `string`                    | Varint length + UTF-8            |
| `nb.bytes`         | `Uint8Array`                | Varint length + raw              |
| `nb.date`          | `Date`                      | Zigzag varint (ms)               |
| `nb.bigint`        | `bigint`                    | Sign + varint len + LE magnitude |
| `nb.any`           | `unknown`                   | Dynamic (msgpack-like)           |
| `nb.array(T)`      | `T[]`                       | Varint length + elements         |
| `nb.map(K, V)`     | `Map<K, V>`                 | Varint length + key-value pairs  |
| `nb.optional(T)`   | `T \| undefined`            | Presence byte + value            |
| `nb.nullable(T)`   | `T \| null`                 | Presence byte + value            |
| `nb.enumOf([...])` | Union of string literals    | Varint index                     |
| `nb.union({...})`  | `{ tag: string; value: T }` | Varint discriminant + value      |
| `nb.struct({...})` | Object                      | Positional or tagged             |

## Positional vs Tagged Structs

### Positional (default) — smallest and fastest

Fields are encoded in declaration order. Optional fields use a compact bitmask. Both sides must use the same schema version.

```typescript
const Message = nb.struct({
  text: nb.string,
  ts: nb.uint,
});
```

### Tagged — schema evolution

Each field gets a numeric ID. Unknown fields are skipped on decode, missing fields become `undefined`. Supports adding/removing optional fields across versions.

```typescript
const MessageV1 = nb.struct(
  {
    text: nb.string.id(1),
    ts: nb.uint.id(2),
  },
  { tagged: true },
);

// V2 adds a field — V1 decoders will silently skip it
const MessageV2 = nb.struct(
  {
    text: nb.string.id(1),
    ts: nb.uint.id(2),
    sender: nb.optional(nb.string).id(3),
  },
  { tagged: true },
);
```

## Socket.IO Integration

nitrobuf ships a drop-in custom parser for Socket.IO. Register schemas for specific events; unregistered events automatically fall back to a dynamic (schemaless) codec.

```typescript
import { Server } from "socket.io";
import { io } from "socket.io-client";
import { createParser } from "nitrobuf/socket.io";
import { nb } from "nitrobuf";

const parser = createParser({
  events: {
    "chat:message": nb.struct({ text: nb.string, ts: nb.uint }),
    "player:move": nb.struct({ x: nb.f32, y: nb.f32, z: nb.f32 }),
  },
});

// Server
const server = new Server(httpServer, { parser });

// Client
const socket = io("http://localhost:3000", { parser });

// Use normally — schema encoding is automatic for registered events
socket.emit("chat:message", { text: "Hello!", ts: Date.now() });

// Unregistered events work too (dynamic codec fallback)
socket.emit("other-event", { any: "data" });
```

**Important**: The same parser must be used on both server and client.

### Limitations

- ACK packets always use the dynamic codec (the encoder cannot determine which event an ACK belongs to)
- The parser encodes all packets as binary `Uint8Array` — HTTP long-polling transports will base64-encode them, adding ~33% overhead

## Configuration

```typescript
import { configure, getCompilerMode } from "nitrobuf";

// Force interpreter mode (safe for CSP environments)
configure({ mode: "interpreter" });

// Force JIT mode
configure({ mode: "jit" });

// Auto-detect (default)
configure({ mode: "auto" });

getCompilerMode(); // "jit" | "interpreter" — effective compiler for uncompiled schemas
```

## Performance

Benchmarks on Node.js v22 (Apple Silicon):

| Scenario                  | nitrobuf   | JSON       | Ratio           |
| ------------------------- | ---------- | ---------- | --------------- |
| Encode simple struct      | 2.1M ops/s | 2.8M ops/s | 0.75x           |
| Decode simple struct      | 2.1M ops/s | 2.7M ops/s | 0.77x           |
| Encode 100 nested objects | 143K ops/s | 39K ops/s  | **3.7x faster** |
| Decode 100 nested objects | 111K ops/s | 32K ops/s  | **3.5x faster** |

nitrobuf excels at complex/nested data. For trivial structs, V8's heavily-optimized JSON is hard to beat.

The binary format is also significantly smaller than JSON for numeric-heavy payloads.

Run benchmarks yourself:

```bash
pnpm run bench
```

## Comparison

| Feature              | nitrobuf    | protobuf    | msgpack         | JSON     |
| -------------------- | ----------- | ----------- | --------------- | -------- |
| Schema in code       | Yes         | No (.proto) | No (schemaless) | No       |
| Type inference       | Yes         | Via codegen | No              | Manual   |
| Binary format        | Yes         | Yes         | Yes             | No       |
| Schema evolution     | Tagged mode | Yes         | N/A             | N/A      |
| Zero dependencies    | Yes         | No          | Varies          | Built-in |
| Socket.IO parser     | Yes         | No          | Yes             | Default  |
| Code generation step | No (JIT)    | Yes         | No              | No       |

## API

### Core

- `nb.struct(fields, options?)` — Create a struct schema
- `nb.array(element)` — Array of a single type
- `nb.map(key, value)` — Map with typed keys and values
- `nb.optional(inner)` — Value or `undefined`
- `nb.nullable(inner)` — Value or `null`
- `nb.enumOf(variants)` — String enum
- `nb.union(variants)` — Tagged union
- `schema.encode(value)` — Encode to `Uint8Array`
- `schema.decode(buf)` — Decode from `Uint8Array`
- `schema.id(n)` — Assign field ID for tagged structs (required when `{ tagged: true }`)

### Socket.IO

- `createParser(options)` — Create a Socket.IO-compatible parser
  - `options.events` — Map of event names to schemas
  - `options.strict` — If true, throw on unregistered events (default: false)

### Utilities

- `configure({ mode })` — Set codec compilation mode
- `getCompilerMode()` — Effective compiler (`"jit"` | `"interpreter"`) for uncompiled schemas
- `dynamicEncodeToBytes(value)` — Encode any JS value (schemaless)
- `dynamicDecodeFromBytes(buf)` — Decode from schemaless format

## Requirements

- Node.js >= 18
- Works in browsers (ESM)
- TypeScript >= 5.0 for type inference

## License

MIT
