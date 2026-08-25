/**
 * Socket.IO packet validation — throws synchronously on invalid packets,
 * matching the contract expected by socket.io internals.
 */

export interface Packet {
  type: number;
  nsp: string;
  data?: any;
  id?: number;
}

export const enum PacketType {
  CONNECT = 0,
  DISCONNECT = 1,
  EVENT = 2,
  ACK = 3,
  CONNECT_ERROR = 4,
}

export function validatePacket(packet: Packet): void {
  if (typeof packet.type !== "number" || packet.type < 0 || packet.type > 4) {
    throw new Error("invalid packet type");
  }
  if (typeof packet.nsp !== "string") {
    throw new Error("invalid namespace");
  }
  if (packet.id !== undefined && typeof packet.id !== "number") {
    throw new Error("invalid packet id");
  }

  switch (packet.type) {
    case PacketType.CONNECT:
      if (
        packet.data !== undefined &&
        (typeof packet.data !== "object" || Array.isArray(packet.data))
      ) {
        throw new Error("invalid payload");
      }
      break;
    case PacketType.DISCONNECT:
      if (packet.data !== undefined) {
        throw new Error("invalid payload");
      }
      break;
    case PacketType.EVENT:
      if (!Array.isArray(packet.data) || packet.data.length === 0) {
        throw new Error("invalid payload");
      }
      break;
    case PacketType.ACK:
      if (!Array.isArray(packet.data)) {
        throw new Error("invalid payload");
      }
      break;
    case PacketType.CONNECT_ERROR:
      if (
        packet.data !== undefined &&
        typeof packet.data !== "string" &&
        typeof packet.data !== "object"
      ) {
        throw new Error("invalid payload");
      }
      break;
  }
}
