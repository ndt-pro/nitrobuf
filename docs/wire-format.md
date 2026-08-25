# Wire Format Specification

## Primitives

### Fixed-width integers

| Type                  | Encoding               |
| --------------------- | ---------------------- |
| `u8` / `i8` / `bool`  | 1 byte                 |
| `u16` / `i16`         | 2 bytes, little-endian |
| `u32` / `i32` / `f32` | 4 bytes, little-endian |
| `u64` / `i64` / `f64` | 8 bytes, little-endian |

### Variable-width integers

- **`uint`** — Unsigned LEB128 varint. Each byte uses 7 data bits + 1 continuation bit. Values 0–127 take 1 byte.
- **`int`** — Zigzag-encoded signed integer, then LEB128. Maps `0 → 0, -1 → 1, 1 → 2, -2 → 3, ...`. Keeps small absolute values small in wire size.

### Strings and bytes

```
[varint: byte length][UTF-8 bytes]
```

### Bool

```
[0x00 = false | 0x01 = true]
```

### Date

Zigzag varint of milliseconds since Unix epoch (as a 64-bit signed integer).

### BigInt

```
[u8: sign (0=positive, 1=negative)]
[varint: byte count of magnitude]
[magnitude bytes in little-endian order]
```

Zero is encoded as sign=0, length=0.

## Compound Types

### Array

```
[varint: element count]
[element 0][element 1]...[element N-1]
```

### Map

```
[varint: entry count]
[key 0][value 0][key 1][value 1]...
```

### Optional

```
[u8: 0 = absent | 1 = present]
[value if present]
```

### Nullable

```
[u8: 0 = null | 1 = present]
[value if present]
```

### Enum

```
[varint: index into variant list]
```

### Union

```
[varint: discriminant index]
[value for selected variant]
```

## Structs

### Positional struct (default)

Fields are written in declaration order. If any field is `optional`, a bitmask prefix tracks presence:

```
[bitmask: ceil(optionalCount / 8) bytes, only if optionals exist]
[field 0 value, if not optional or if present per bitmask]
[field 1 value, ...]
...
```

Non-optional fields are always written. Optional fields are only written if their bit is set in the bitmask. The bitmask uses bit 0 of byte 0 for the first optional, bit 1 for the second, etc.

### Tagged struct (`{ tagged: true }`)

Each field is prefixed with a key that encodes both the field ID and wire type:

```
[varint: (fieldId << 3) | wireType][field payload]
[varint: (fieldId << 3) | wireType][field payload]
...
[0x00 terminator]
```

Wire types:

- `0` = varint
- `1` = 64-bit fixed
- `2` = length-delimited (varint length prefix + bytes)
- `3` = 32-bit fixed
- `4` = 8-bit fixed
- `5` = 16-bit fixed

For length-delimited fields, the payload is `[varint: byte length][encoded value]`.

Unknown field IDs are skipped using the wire type to determine how many bytes to skip. This enables forward compatibility (older decoders skip new fields).

Optional fields in tagged mode are simply omitted from the output when absent. On decode, missing fields remain `undefined`.

## Dynamic Codec

The schemaless codec uses a 1-byte type tag prefix:

| Tag    | Type      | Encoding                                              |
| ------ | --------- | ----------------------------------------------------- |
| `0x00` | null      | (no payload)                                          |
| `0x01` | undefined | (no payload)                                          |
| `0x02` | false     | (no payload)                                          |
| `0x03` | true      | (no payload)                                          |
| `0x04` | uint      | varint                                                |
| `0x05` | int       | zigzag varint                                         |
| `0x06` | f64       | 8 bytes LE                                            |
| `0x07` | string    | varint length + UTF-8                                 |
| `0x08` | bytes     | varint length + raw                                   |
| `0x09` | array     | varint length + dynamic elements                      |
| `0x0A` | object    | varint key count + (string key + dynamic value) pairs |
| `0x0B` | bigint    | sign + varint len + LE magnitude                      |
| `0x0C` | date      | zigzag varint (ms since epoch)                        |

## Socket.IO Packet Format

Each socket.io packet is encoded as a single `Uint8Array`:

```
[header: 1 byte]
[nsp: string, if not root "/"]
[id: varint, if present]
[payload: schema or dynamic encoded data]
```

Header byte layout:

- Bits 0–2: packet type (0–4)
- Bit 3: has ack id
- Bit 4: namespace is root "/"
- Bits 5–6: payload kind (00=none, 01=schema, 10=dynamic)
- Bit 7: reserved

Schema-encoded EVENT payload:

```
[string: event name]
[dynamic: argument count]
[schema-encoded arg 0][schema-encoded arg 1]...
```
