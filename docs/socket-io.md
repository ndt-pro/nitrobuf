# Socket.IO Integration

nitrobuf provides a drop-in custom parser for Socket.IO v4 that encodes packets in binary instead of JSON.

## Setup

```typescript
import { Server } from "socket.io";
import { io } from "socket.io-client";
import { createParser } from "nitrobuf/socket.io";
import { nb } from "nitrobuf";

// Define schemas for your events
const parser = createParser({
  events: {
    "chat:message": nb.struct({ text: nb.string, ts: nb.uint }),
    "player:move": nb.struct({ x: nb.f32, y: nb.f32, z: nb.f32 }),
  },
});

// Server — pass parser option
const server = new Server(httpServer, { parser });

// Client — same parser, both sides MUST match
const socket = io("http://localhost:3000", { parser });
```

## How It Works

1. **Registered events** — When you `emit("chat:message", data)`, the encoder looks up the schema for `"chat:message"` and uses it to encode `data` in compact binary.

2. **Unregistered events** — Events without a registered schema (including internal events like `disconnect`) are encoded using the dynamic codec, a schemaless msgpack-like format. This means the parser is a safe drop-in replacement — it won't break your existing events.

3. **All packets are binary** — Every packet becomes a single `Uint8Array`. Socket.IO/Engine.IO handles binary frames natively over WebSocket. Over HTTP long-polling, binary is base64-encoded (adding ~33% overhead).

## Parser Options

```typescript
const parser = createParser({
  // Map event names to schemas
  events: {
    "my-event": nb.struct({ ... }),
  },

  // Strict mode: throw on unregistered events (default: false)
  strict: false,
});
```

## Architecture

### Encoder (stateless)

The `Encoder` class is instantiated once per server and shared across all connections. It MUST be stateless — no per-connection buffers or dictionaries.

```
encode(packet) → [Uint8Array]
```

Returns a single-element array containing the encoded packet.

### Decoder (per-connection, resettable)

The `Decoder` is instantiated per connection. It extends an Emitter and fires `"decoded"` with the parsed packet. Errors throw synchronously in `add()`.

```
add(chunk: Uint8Array | Buffer | ArrayBuffer) → emits "decoded"
destroy() → resets state for reuse after reconnect
```

### Packet header (1 byte)

```
[type:3][hasId:1][nspIsRoot:1][payloadKind:2][reserved:1]
```

- `type` (bits 0–2): Socket.IO packet type (0=CONNECT, 1=DISCONNECT, 2=EVENT, 3=ACK, 4=CONNECT_ERROR)
- `hasId` (bit 3): whether an ack id follows
- `nspIsRoot` (bit 4): if set, namespace is `"/"` and is not written
- `payloadKind` (bits 5–6): `00`=none, `01`=schema-encoded, `10`=dynamic-encoded

## Limitations

### ACK packets use dynamic codec

Socket.IO does not tell the encoder which event an ACK packet belongs to, so the parser cannot look up the schema. ACK payloads are always encoded with the dynamic codec.

### Both sides must use the same parser

There is no parser negotiation in the Socket.IO handshake. If the server uses nitrobuf, the client must too.

### HTTP long-polling overhead

Engine.IO base64-encodes binary frames on transports that don't support binary natively. Use WebSocket transport when possible:

```typescript
const socket = io("http://...", {
  parser,
  transports: ["websocket"],
});
```

### CONNECT packet data

The CONNECT packet carries auth data and the server responds with `{ sid, pid }`. The parser preserves these fields exactly. If you modify the parser, be very careful with CONNECT handling — broken round-trips here cause "server v2.x" errors in clients.

## Example: Game Server

```typescript
import { createParser } from "nitrobuf/socket.io";
import { nb } from "nitrobuf";

const Vec3 = nb.struct({ x: nb.f32, y: nb.f32, z: nb.f32 });

const parser = createParser({
  events: {
    "player:move": Vec3,
    "player:shoot": nb.struct({ origin: Vec3, direction: Vec3, weapon: nb.uint }),
    "world:state": nb.struct({
      players: nb.array(
        nb.struct({
          id: nb.uint,
          pos: Vec3,
          health: nb.u8,
        }),
      ),
      tick: nb.uint,
    }),
  },
});
```
