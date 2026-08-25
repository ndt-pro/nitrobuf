import { describe, it, expect, afterAll } from "vitest";
import { createServer, type Server as HttpServer } from "http";
import { Server } from "socket.io";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import { createParser } from "../src/socketio/index.js";
import { nb } from "../src/index.js";

const MessageSchema = nb.struct({ text: nb.string, ts: nb.uint });

const parser = createParser({
  events: {
    "chat:message": MessageSchema,
  },
});

let httpServer: HttpServer;
let ioServer: Server;
let port: number;

function setup(): Promise<void> {
  return new Promise((resolve) => {
    httpServer = createServer();
    ioServer = new Server(httpServer, { parser: parser as any });
    httpServer.listen(0, () => {
      port = (httpServer.address() as any).port;
      resolve();
    });
  });
}

function connectClient(nsp = "/"): Promise<ClientSocket> {
  return new Promise((resolve) => {
    const socket = ioClient(`http://127.0.0.1:${port}${nsp}`, {
      parser: parser as any,
      transports: ["websocket"],
    });
    socket.on("connect", () => resolve(socket));
  });
}

function cleanup(): Promise<void> {
  return new Promise<void>((resolve) => {
    ioServer.close(() => {
      httpServer.close(() => resolve());
    });
  });
}

describe("socket.io e2e with nitrobuf parser", () => {
  afterAll(async () => {
    try {
      await cleanup();
    } catch {}
  });

  it("schema-registered event round-trips", async () => {
    await setup();

    ioServer.on("connection", (socket) => {
      socket.on("chat:message", (msg: any) => {
        socket.emit("chat:message", msg);
      });
    });

    const client = await connectClient();

    const received = await new Promise<any>((resolve) => {
      client.on("chat:message", (msg: any) => resolve(msg));
      client.emit("chat:message", { text: "hello", ts: 42 });
    });

    expect(received).toEqual({ text: "hello", ts: 42 });
    client.disconnect();
    await cleanup();
  });

  it("unregistered event uses dynamic fallback", async () => {
    await setup();

    ioServer.on("connection", (socket) => {
      socket.on("ping-test", (data: any) => {
        socket.emit("pong-test", data);
      });
    });

    const client = await connectClient();

    const received = await new Promise<any>((resolve) => {
      client.on("pong-test", (data: any) => resolve(data));
      client.emit("ping-test", { foo: "bar", n: 123 });
    });

    expect(received).toEqual({ foo: "bar", n: 123 });
    client.disconnect();
    await cleanup();
  });

  it("ack callback works", async () => {
    await setup();

    ioServer.on("connection", (socket) => {
      socket.on("request", (data: any, cb: Function) => {
        cb({ ok: true, echo: data });
      });
    });

    const client = await connectClient();

    const ackResult = await new Promise<any>((resolve) => {
      client.emit("request", { query: "test" }, (response: any) => {
        resolve(response);
      });
    });

    expect(ackResult).toEqual({ ok: true, echo: { query: "test" } });
    client.disconnect();
    await cleanup();
  });

  it("custom namespace works", async () => {
    await setup();

    ioServer.of("/admin").on("connection", (socket) => {
      socket.on("ping-ns", (data: any) => {
        socket.emit("pong-ns", data);
      });
    });

    const client = await connectClient("/admin");

    const received = await new Promise<any>((resolve) => {
      client.on("pong-ns", (data: any) => resolve(data));
      client.emit("ping-ns", { role: "admin" });
    });

    expect(received).toEqual({ role: "admin" });
    client.disconnect();
    await cleanup();
  });

  it("binary data (Uint8Array in dynamic fallback)", async () => {
    await setup();

    ioServer.on("connection", (socket) => {
      socket.on("binary-test", (data: any) => {
        socket.emit("binary-reply", data);
      });
    });

    const client = await connectClient();

    const received = await new Promise<any>((resolve) => {
      client.on("binary-reply", (data: any) => resolve(data));
      client.emit("binary-test", { values: [1, 2, 3] });
    });

    expect(received).toEqual({ values: [1, 2, 3] });
    client.disconnect();
    await cleanup();
  });
});
