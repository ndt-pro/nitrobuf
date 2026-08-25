/**
 * nitrobuf Socket.IO custom parser.
 *
 * Drop-in replacement for socket.io-parser. Encodes packet payloads using
 * nitrobuf schemas when a matching event is registered, falls back to the
 * dynamic (schemaless) codec for unregistered events.
 *
 * Usage:
 *   import { createParser } from "nitrobuf/socket.io";
 *   import { nb } from "nitrobuf";
 *
 *   const parser = createParser({
 *     events: {
 *       "chat:message": nb.struct({ text: nb.string, ts: nb.uint }),
 *     },
 *   });
 *
 *   const io = new Server(httpServer, { parser });
 *   const socket = ioClient("http://...", { parser });
 */

import { Writer } from "../codec/writer.js";
import { Reader } from "../codec/reader.js";
import { dynamicEncode, dynamicDecode } from "../dynamic/index.js";
import type { SchemaType } from "../schema/schema.js";
import { Emitter } from "./emitter.js";
import { validatePacket, PacketType, type Packet } from "./validate.js";

export { PacketType, type Packet } from "./validate.js";

/**
 * Binary packet header layout (1 byte):
 *   bits [0..2]  = packet type (0-4)
 *   bit  3       = hasId
 *   bit  4       = nsp is root "/"
 *   bits [5..6]  = payload kind: 0=none, 1=schema, 2=dynamic
 *   bit  7       = reserved
 */
const HEADER_HAS_ID = 0x08;
const HEADER_NSP_ROOT = 0x10;
const PAYLOAD_SCHEMA = 0x20;
const PAYLOAD_DYNAMIC = 0x40;

export interface ParserOptions {
  events?: Record<string, SchemaType<any, any>>;
  strict?: boolean;
}

export function createParser(options: ParserOptions = {}) {
  const eventSchemas = options.events ?? {};
  const strict = options.strict === true;

  class NitrobufEncoder {
    encode(packet: Packet): [Uint8Array] {
      const w = new Writer(128);

      let header = packet.type & 0x07;
      const isRoot = packet.nsp === "/";
      if (isRoot) header |= HEADER_NSP_ROOT;
      if (packet.id !== undefined) header |= HEADER_HAS_ID;

      const hasPayload = packet.data !== undefined;

      if (hasPayload && packet.type === PacketType.EVENT && Array.isArray(packet.data)) {
        const eventName = packet.data[0];
        const schema = typeof eventName === "string" ? eventSchemas[eventName] : undefined;
        if (schema) {
          header |= PAYLOAD_SCHEMA;
          w.writeU8(header);
          if (!isRoot) w.writeString(packet.nsp);
          if (packet.id !== undefined) w.writeVarint(packet.id);
          w.writeString(eventName);
          const args = packet.data.slice(1);
          dynamicEncode(w, args.length);
          for (const arg of args) {
            schema.encodeTo(w, arg);
          }
          return [w.finish()];
        }
        if (strict && typeof eventName === "string") {
          throw new Error(`No schema registered for event: ${eventName}`);
        }
      }

      if (hasPayload) {
        header |= PAYLOAD_DYNAMIC;
      }

      w.writeU8(header);
      if (!isRoot) w.writeString(packet.nsp);
      if (packet.id !== undefined) w.writeVarint(packet.id);
      if (hasPayload) dynamicEncode(w, packet.data);

      return [w.finish()];
    }
  }

  class NitrobufDecoder extends Emitter {
    add(chunk: string | Buffer | ArrayBuffer | Uint8Array): void {
      const bytes = toUint8Array(chunk);
      const r = new Reader(bytes);

      const header = r.readU8();
      const type = header & 0x07;
      const hasId = (header & HEADER_HAS_ID) !== 0;
      const isRoot = (header & HEADER_NSP_ROOT) !== 0;
      const payloadKind = header & 0x60;

      const nsp = isRoot ? "/" : r.readString();
      const id = hasId ? r.readVarint() : undefined;

      let data: any;

      if (payloadKind === PAYLOAD_SCHEMA) {
        const eventName = r.readString();
        const schema = eventSchemas[eventName];
        if (!schema) {
          throw new Error(`No schema registered for event: ${eventName}`);
        }
        const argCount = dynamicDecode(r);
        if (typeof argCount !== "number" || !Number.isFinite(argCount) || argCount < 0) {
          throw new Error("invalid schema argument count");
        }
        r.ensureCount(argCount);
        const args: any[] = [eventName];
        for (let i = 0; i < argCount; i++) {
          args.push(schema.decodeFrom(r));
        }
        data = args;
      } else if (payloadKind === PAYLOAD_DYNAMIC) {
        data = dynamicDecode(r) as any;
      }

      const packet: Packet = { type, nsp, data, id };
      validatePacket(packet);
      this.emit("decoded", packet);
    }

    destroy(): void {
      // Reset decoder state for reconnect. Listeners stay — socket.io-parser
      // only clears its binary reconstructor; this parser is stateless per add().
    }
  }

  return {
    protocol: 5,
    PacketType: {
      CONNECT: PacketType.CONNECT as 0,
      DISCONNECT: PacketType.DISCONNECT as 1,
      EVENT: PacketType.EVENT as 2,
      ACK: PacketType.ACK as 3,
      CONNECT_ERROR: PacketType.CONNECT_ERROR as 4,
    },
    Encoder: NitrobufEncoder,
    Decoder: NitrobufDecoder,
  };
}

function toUint8Array(chunk: string | Buffer | ArrayBuffer | Uint8Array): Uint8Array {
  if (chunk instanceof Uint8Array) return chunk;
  if (chunk instanceof ArrayBuffer) return new Uint8Array(chunk);
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(chunk)) {
    return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  }
  throw new Error("NitrobufDecoder.add: unsupported chunk type");
}

export default createParser;
