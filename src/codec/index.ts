export { Writer } from "./writer.js";
export { Reader } from "./reader.js";
export {
  encodeVarint,
  decodeVarint,
  sizeVarint,
  zigzagEncode,
  zigzagDecode,
  encodeVarint64,
  decodeVarint64,
  sizeVarint64,
  zigzagEncode64,
  zigzagDecode64,
} from "./varint.js";
export { utf8ByteLength, utf8Write, utf8Read } from "./utf8.js";
