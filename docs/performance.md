# Performance

## Benchmark Results

Benchmarked on Node.js v22 (Apple Silicon M-series), using `vitest bench`.

### Simple Struct

Schema:

```typescript
nb.struct({
  id: nb.uint,
  name: nb.string,
  email: nb.string,
  age: nb.uint,
  active: nb.bool,
  tags: nb.array(nb.string),
  score: nb.f64,
});
```

| Operation  | nitrobuf   | JSON       | Ratio            |
| ---------- | ---------- | ---------- | ---------------- |
| Encode     | 2.1M ops/s | 2.8M ops/s | JSON 1.3x faster |
| Decode     | 2.1M ops/s | 2.7M ops/s | JSON 1.3x faster |
| Round-trip | 1.0M ops/s | 1.6M ops/s | JSON 1.5x faster |

### Nested Data (100 users with scores)

Schema:

```typescript
nb.struct({
  users: nb.array(
    nb.struct({
      id: nb.uint,
      name: nb.string,
      scores: nb.array(nb.f64),
    }),
  ),
  total: nb.uint,
});
```

| Operation | nitrobuf   | JSON      | Ratio                    |
| --------- | ---------- | --------- | ------------------------ |
| Encode    | 143K ops/s | 39K ops/s | **nitrobuf 3.7x faster** |
| Decode    | 111K ops/s | 32K ops/s | **nitrobuf 3.5x faster** |

## Analysis

### Where nitrobuf wins

- **Complex/nested structures** — The JIT-compiled codecs avoid the overhead of JSON's recursive string parsing and number-to-string conversion. The gap widens with more nesting and more numeric fields.
- **Numeric-heavy payloads** — Integers encode as 1–5 byte varints vs multi-character decimal strings. Floats are always 4 or 8 bytes vs variable-length decimal strings.
- **Wire size** — Binary encoding is typically 30–60% smaller than JSON for mixed data, and even more for numeric arrays.

### Where JSON wins

- **Simple/small objects** — V8's JSON.parse/stringify are extremely optimized native code. For trivial objects with few fields, the overhead of DataView calls and buffer management in JS outweighs the format efficiency.
- **String-heavy payloads** — Both formats encode strings as UTF-8. JSON has a slight edge here because V8 can use optimized internal paths for ASCII strings.

### JIT vs Interpreter

The JIT compiler (default) generates specialized encode/decode functions via `new Function`, eliminating per-field dispatch overhead. The interpreter uses closure composition, which is ~20–40% slower on typical schemas. Both produce byte-identical output.

## Running Benchmarks

```bash
pnpm run bench
```

## Wire Size Comparison

For a typical user object with 7 fields (the simple struct above):

| Format               | Encoded Size |
| -------------------- | ------------ |
| nitrobuf             | ~65 bytes    |
| JSON                 | ~140 bytes   |
| JSON (minified keys) | ~100 bytes   |

The binary format is roughly 50% the size of JSON for this payload shape.
