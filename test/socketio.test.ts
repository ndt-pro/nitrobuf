import { describe, it, expect } from "vitest";
import { createParser, PacketType } from "../src/socketio/index.js";
import { nb, Writer } from "../src/index.js";

function encodeAndDecode(parser: ReturnType<typeof createParser>, packet: any) {
  const encoder = new parser.Encoder();
  const decoder = new parser.Decoder();

  const encoded = encoder.encode(packet);
  expect(encoded).toHaveLength(1);
  expect(encoded[0]).toBeInstanceOf(Uint8Array);

  let decoded: any = null;
  decoder.on("decoded", (p: any) => {
    decoded = p;
  });
  decoder.add(encoded[0]);
  expect(decoded).not.toBeNull();
  return decoded;
}

describe("socket.io parser — unit tests", () => {
  const parser = createParser({
    events: {
      "chat:message": nb.struct({ text: nb.string, ts: nb.uint }),
    },
  });

  describe("CONNECT (type 0)", () => {
    it("root namespace, no auth", () => {
      const pkt = { type: PacketType.CONNECT, nsp: "/" };
      const result = encodeAndDecode(parser, pkt);
      expect(result.type).toBe(PacketType.CONNECT);
      expect(result.nsp).toBe("/");
      expect(result.data).toBeUndefined();
      expect(result.id).toBeUndefined();
    });

    it("root namespace with auth data", () => {
      const pkt = { type: PacketType.CONNECT, nsp: "/", data: { sid: "abc123" } };
      const result = encodeAndDecode(parser, pkt);
      expect(result.type).toBe(PacketType.CONNECT);
      expect(result.nsp).toBe("/");
      expect(result.data).toEqual({ sid: "abc123" });
    });

    it("custom namespace with auth", () => {
      const pkt = { type: PacketType.CONNECT, nsp: "/admin", data: { token: "xyz" } };
      const result = encodeAndDecode(parser, pkt);
      expect(result.type).toBe(PacketType.CONNECT);
      expect(result.nsp).toBe("/admin");
      expect(result.data).toEqual({ token: "xyz" });
    });

    it("preserves sid and pid in CONNECT response", () => {
      const pkt = { type: PacketType.CONNECT, nsp: "/", data: { sid: "abc", pid: "def" } };
      const result = encodeAndDecode(parser, pkt);
      expect(result.data.sid).toBe("abc");
      expect(result.data.pid).toBe("def");
    });
  });

  describe("DISCONNECT (type 1)", () => {
    it("root namespace", () => {
      const pkt = { type: PacketType.DISCONNECT, nsp: "/" };
      const result = encodeAndDecode(parser, pkt);
      expect(result.type).toBe(PacketType.DISCONNECT);
      expect(result.nsp).toBe("/");
      expect(result.data).toBeUndefined();
    });

    it("custom namespace", () => {
      const pkt = { type: PacketType.DISCONNECT, nsp: "/chat" };
      const result = encodeAndDecode(parser, pkt);
      expect(result.type).toBe(PacketType.DISCONNECT);
      expect(result.nsp).toBe("/chat");
    });
  });

  describe("EVENT (type 2)", () => {
    it("event with schema-registered name uses schema codec", () => {
      const pkt = {
        type: PacketType.EVENT,
        nsp: "/",
        data: ["chat:message", { text: "hello", ts: 12345 }],
      };
      const result = encodeAndDecode(parser, pkt);
      expect(result.type).toBe(PacketType.EVENT);
      expect(result.data[0]).toBe("chat:message");
      expect(result.data[1]).toEqual({ text: "hello", ts: 12345 });
    });

    it("event without schema falls back to dynamic codec", () => {
      const pkt = {
        type: PacketType.EVENT,
        nsp: "/",
        data: ["unregistered", { foo: "bar" }],
      };
      const result = encodeAndDecode(parser, pkt);
      expect(result.type).toBe(PacketType.EVENT);
      expect(result.data[0]).toBe("unregistered");
      expect(result.data[1]).toEqual({ foo: "bar" });
    });

    it("event with ack id", () => {
      const pkt = {
        type: PacketType.EVENT,
        nsp: "/",
        id: 42,
        data: ["chat:message", { text: "hi", ts: 1 }],
      };
      const result = encodeAndDecode(parser, pkt);
      expect(result.id).toBe(42);
      expect(result.data[0]).toBe("chat:message");
    });

    it("event on custom namespace", () => {
      const pkt = {
        type: PacketType.EVENT,
        nsp: "/admin",
        data: ["chat:message", { text: "x", ts: 0 }],
      };
      const result = encodeAndDecode(parser, pkt);
      expect(result.nsp).toBe("/admin");
    });

    it("event with multiple args", () => {
      const pkt = {
        type: PacketType.EVENT,
        nsp: "/",
        data: ["chat:message", { text: "a", ts: 1 }, { text: "b", ts: 2 }],
      };
      const result = encodeAndDecode(parser, pkt);
      expect(result.data).toHaveLength(3);
      expect(result.data[1]).toEqual({ text: "a", ts: 1 });
      expect(result.data[2]).toEqual({ text: "b", ts: 2 });
    });
  });

  describe("ACK (type 3)", () => {
    it("ack with data", () => {
      const pkt = {
        type: PacketType.ACK,
        nsp: "/",
        id: 7,
        data: ["result", 42],
      };
      const result = encodeAndDecode(parser, pkt);
      expect(result.type).toBe(PacketType.ACK);
      expect(result.id).toBe(7);
      expect(result.data).toEqual(["result", 42]);
    });

    it("ack with empty array", () => {
      const pkt = {
        type: PacketType.ACK,
        nsp: "/",
        id: 0,
        data: [],
      };
      const result = encodeAndDecode(parser, pkt);
      expect(result.type).toBe(PacketType.ACK);
      expect(result.data).toEqual([]);
    });
  });

  describe("CONNECT_ERROR (type 4)", () => {
    it("error with string message", () => {
      const pkt = {
        type: PacketType.CONNECT_ERROR,
        nsp: "/",
        data: "unauthorized",
      };
      const result = encodeAndDecode(parser, pkt);
      expect(result.type).toBe(PacketType.CONNECT_ERROR);
      expect(result.data).toBe("unauthorized");
    });

    it("error with object", () => {
      const pkt = {
        type: PacketType.CONNECT_ERROR,
        nsp: "/",
        data: { message: "bad token", code: 401 },
      };
      const result = encodeAndDecode(parser, pkt);
      expect(result.data).toEqual({ message: "bad token", code: 401 });
    });
  });

  describe("id handling", () => {
    it("undefined id stays undefined (not null)", () => {
      const pkt = { type: PacketType.EVENT, nsp: "/", data: ["foo", "bar"] };
      const result = encodeAndDecode(parser, pkt);
      expect(result.id).toBeUndefined();
      expect(result.id).not.toBeNull();
    });

    it("id = 0 is preserved", () => {
      const pkt = { type: PacketType.EVENT, nsp: "/", id: 0, data: ["foo", "bar"] };
      const result = encodeAndDecode(parser, pkt);
      expect(result.id).toBe(0);
    });
  });

  describe("destroy and reuse", () => {
    it("decoder can be reused after destroy()", () => {
      const decoder = new parser.Decoder();
      const encoder = new parser.Encoder();
      const results: any[] = [];

      decoder.on("decoded", (p: any) => results.push(p));

      const pkt1 = encoder.encode({ type: PacketType.DISCONNECT, nsp: "/" });
      decoder.add(pkt1[0]);
      expect(results).toHaveLength(1);

      decoder.destroy();

      const pkt2 = encoder.encode({ type: PacketType.DISCONNECT, nsp: "/" });
      decoder.add(pkt2[0]);
      expect(results).toHaveLength(2);
    });
  });

  describe("input types", () => {
    it("decoder accepts Buffer (Node)", () => {
      const encoder = new parser.Encoder();
      const decoder = new parser.Decoder();
      const pkt = encoder.encode({ type: PacketType.DISCONNECT, nsp: "/" });

      let decoded: any = null;
      decoder.on("decoded", (p: any) => {
        decoded = p;
      });
      decoder.add(Buffer.from(pkt[0]));
      expect(decoded).not.toBeNull();
      expect(decoded.type).toBe(PacketType.DISCONNECT);
    });

    it("decoder accepts ArrayBuffer", () => {
      const encoder = new parser.Encoder();
      const decoder = new parser.Decoder();
      const pkt = encoder.encode({ type: PacketType.DISCONNECT, nsp: "/" });

      let decoded: any = null;
      decoder.on("decoded", (p: any) => {
        decoded = p;
      });
      decoder.add(pkt[0].buffer.slice(pkt[0].byteOffset, pkt[0].byteOffset + pkt[0].byteLength));
      expect(decoded).not.toBeNull();
    });
  });

  describe("invalid packets", () => {
    it("throws on invalid packet type", () => {
      const decoder = new parser.Decoder();
      decoder.on("decoded", () => {});

      const buf = new Uint8Array([0xff]);
      expect(() => decoder.add(buf)).toThrow();
    });

    it("throws when schema argCount is not a finite number", () => {
      const decoder = new parser.Decoder();
      decoder.on("decoded", () => {});
      const w = new Writer();
      w.writeU8(0x32); // EVENT | nsp root | schema
      w.writeString("chat:message");
      w.writeU8(0x07); // dynamic string tag
      w.writeString("nope");
      expect(() => decoder.add(w.finish())).toThrow(/argument count/i);
    });
  });

  describe("strict mode", () => {
    const strictParser = createParser({
      events: {
        "chat:message": nb.struct({ text: nb.string, ts: nb.uint }),
      },
      strict: true,
    });

    it("throws on unregistered events", () => {
      const encoder = new strictParser.Encoder();
      expect(() =>
        encoder.encode({
          type: PacketType.EVENT,
          nsp: "/",
          data: ["unregistered", { foo: "bar" }],
        }),
      ).toThrow(/No schema registered/);
    });

    it("still encodes registered events", () => {
      const result = encodeAndDecode(strictParser, {
        type: PacketType.EVENT,
        nsp: "/",
        data: ["chat:message", { text: "hi", ts: 1 }],
      });
      expect(result.data[1]).toEqual({ text: "hi", ts: 1 });
    });

    it("still encodes CONNECT", () => {
      const result = encodeAndDecode(strictParser, { type: PacketType.CONNECT, nsp: "/" });
      expect(result.type).toBe(PacketType.CONNECT);
    });
  });

  describe("Encoder is stateless", () => {
    it("same encoder instance produces correct output for different packets", () => {
      const encoder = new parser.Encoder();
      const decode = (encoded: Uint8Array[]) => {
        const decoder = new parser.Decoder();
        let decoded: any = null;
        decoder.on("decoded", (p: any) => {
          decoded = p;
        });
        decoder.add(encoded[0]);
        return decoded;
      };

      const r1 = decode(encoder.encode({ type: PacketType.CONNECT, nsp: "/" }));
      const r2 = decode(
        encoder.encode({
          type: PacketType.EVENT,
          nsp: "/",
          data: ["chat:message", { text: "x", ts: 1 }],
        }),
      );
      const r3 = decode(encoder.encode({ type: PacketType.DISCONNECT, nsp: "/other" }));

      expect(r1.type).toBe(PacketType.CONNECT);
      expect(r2.data[0]).toBe("chat:message");
      expect(r3.nsp).toBe("/other");
    });
  });
});
