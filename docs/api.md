# API Reference

## Importing

```typescript
// Core library
import { nb, type Infer, configure, getCompilerMode, SchemaType, Writer, Reader } from "nitrobuf";

// Socket.IO parser
import { createParser, PacketType } from "nitrobuf/socket.io";

// Dynamic codec (schemaless)
import { dynamicEncodeToBytes, dynamicDecodeFromBytes } from "nitrobuf";
```

## Schema Builders (`nb.*`)

All builders return a `SchemaType` instance with `.encode()` and `.decode()` methods.

### Numeric types

| Builder   | JS Type  | Range                                    |
| --------- | -------- | ---------------------------------------- |
| `nb.u8`   | `number` | 0 – 255                                  |
| `nb.u16`  | `number` | 0 – 65535                                |
| `nb.u32`  | `number` | 0 – 4294967295                           |
| `nb.u64`  | `bigint` | 0 – 2^64-1                               |
| `nb.i8`   | `number` | -128 – 127                               |
| `nb.i16`  | `number` | -32768 – 32767                           |
| `nb.i32`  | `number` | -2147483648 – 2147483647                 |
| `nb.i64`  | `bigint` | -2^63 – 2^63-1                           |
| `nb.f32`  | `number` | IEEE 754 single precision                |
| `nb.f64`  | `number` | IEEE 754 double precision                |
| `nb.uint` | `number` | 0 – 4294967295 (varint)                  |
| `nb.int`  | `number` | -2147483648 – 2147483647 (zigzag varint) |

### Other primitives

| Builder     | JS Type      | Notes                 |
| ----------- | ------------ | --------------------- |
| `nb.bool`   | `boolean`    |                       |
| `nb.string` | `string`     | UTF-8 encoded         |
| `nb.bytes`  | `Uint8Array` | Raw binary            |
| `nb.date`   | `Date`       | Millisecond precision |
| `nb.bigint` | `bigint`     | Arbitrary precision   |
| `nb.any`    | `unknown`    | Dynamic codec         |

### Compound types

#### `nb.array(element)`

```typescript
const Numbers = nb.array(nb.uint);
// Infer => number[]
```

#### `nb.map(key, value)`

```typescript
const Config = nb.map(nb.string, nb.uint);
// Infer => Map<string, number>
```

#### `nb.optional(inner)`

```typescript
const MaybeString = nb.optional(nb.string);
// Infer => string | undefined
```

#### `nb.nullable(inner)`

```typescript
const NullableString = nb.nullable(nb.string);
// Infer => string | null
```

#### `nb.enumOf(variants)`

```typescript
const Role = nb.enumOf(["admin", "user", "guest"] as const);
// Infer => "admin" | "user" | "guest"
```

#### `nb.union(variants)`

```typescript
const Shape = nb.union({
  circle: nb.struct({ radius: nb.f64 }),
  rect: nb.struct({ width: nb.f64, height: nb.f64 }),
});
// Infer => { tag: "circle"; value: { radius: number } } | { tag: "rect"; value: { width: number; height: number } }
```

#### `nb.struct(fields, options?)`

```typescript
const User = nb.struct({
  id: nb.uint,
  name: nb.string,
  email: nb.optional(nb.string),
});
// Infer => { id: number; name: string; email?: string }
```

Options:

- `tagged?: boolean` — Use tagged wire format for schema evolution (default: `false`). Every field must call `.id(n)` with a unique integer `>= 1`.

## SchemaType Methods

### `schema.encode(value: T): Uint8Array`

Encode a value to binary. The returned `Uint8Array` is a fresh copy.

### `schema.decode(buf: Uint8Array): T`

Decode a binary buffer back to a value.

### `schema.encodeTo(writer: Writer, value: T): void`

Encode a value into an existing Writer (for advanced use cases, like building composite buffers).

### `schema.decodeFrom(reader: Reader): T`

Decode a value from an existing Reader at its current position.

### `schema.id(fieldId: number): SchemaType`

Create a copy of this schema with a field ID for use in tagged structs. Required for every field when `{ tagged: true }`. `fieldId` must be an integer in `1..268435455` (`2^28 - 1`).

```typescript
const V1 = nb.struct(
  {
    id: nb.uint.id(1),
    name: nb.string.id(2),
  },
  { tagged: true },
);
```

## Type Inference

```typescript
import { type Infer } from "nitrobuf";

const MySchema = nb.struct({ ... });
type MyType = Infer<typeof MySchema>;
```

## Configuration

### `configure(options)`

```typescript
configure({ mode: "auto" }); // Default: JIT if available, else interpreter
configure({ mode: "jit" }); // Force JIT (new Function)
configure({ mode: "interpreter" }); // Force closure-based interpreter
```

### `getCompilerMode()`

Returns the effective compiler (`"jit"` | `"interpreter"`) for schemas that have not been compiled yet.

```typescript
import { configure, getCompilerMode } from "nitrobuf";

getCompilerMode(); // "jit" in Node / browsers that allow new Function

configure({ mode: "interpreter" });
getCompilerMode(); // "interpreter"
```

`SchemaType` caches encode/decode on first use. Changing `configure` afterwards does not recompile schemas that already ran `encode`/`decode`.

## Low-level Codec

### `Writer`

Growable binary buffer for writing.

```typescript
const w = new Writer(256); // initial capacity
w.writeU8(42);
w.writeString("hello");
w.writeVarint(300);
const bytes = w.finish(); // Uint8Array
w.reset(); // reuse
```

### `Reader`

Binary reader with cursor.

```typescript
const r = new Reader(bytes);
const n = r.readU8();
const s = r.readString();
const v = r.readVarint();
console.log(r.remaining); // bytes left
```

## Dynamic Codec

For encoding arbitrary JS values without a schema:

```typescript
import { dynamicEncodeToBytes, dynamicDecodeFromBytes } from "nitrobuf";

const bytes = dynamicEncodeToBytes({ any: "value", n: 42 });
const value = dynamicDecodeFromBytes(bytes);
```

Supported types: null, undefined, boolean, number (int/float), string, Uint8Array, Date, bigint, Array, plain Object.
