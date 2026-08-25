/**
 * UTF-8 encoding utilities. Uses manual loop for short strings (< 128 bytes)
 * and TextEncoder.encodeInto for longer strings.
 */

const encoder = /* @__PURE__ */ new TextEncoder();
const decoder = /* @__PURE__ */ new TextDecoder();

const SHORT_STRING_THRESHOLD = 128;

export function utf8ByteLength(str: string): number {
  let len = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c < 0x80) {
      len++;
    } else if (c < 0x800) {
      len += 2;
    } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      const lo = str.charCodeAt(i + 1);
      if (lo >= 0xdc00 && lo <= 0xdfff) {
        len += 4;
        i++;
      } else {
        len += 3;
      }
    } else {
      len += 3;
    }
  }
  return len;
}

export function utf8Write(buf: Uint8Array, offset: number, str: string): number {
  if (str.length < SHORT_STRING_THRESHOLD) {
    return utf8WriteManual(buf, offset, str);
  }
  const result = encoder.encodeInto(str, buf.subarray(offset));
  return offset + (result.written ?? 0);
}

function utf8WriteManual(buf: Uint8Array, offset: number, str: string): number {
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c < 0x80) {
      buf[offset++] = c;
    } else if (c < 0x800) {
      buf[offset++] = 0xc0 | (c >> 6);
      buf[offset++] = 0x80 | (c & 0x3f);
    } else if (c >= 0xd800 && c <= 0xdfff) {
      if (c <= 0xdbff && i + 1 < str.length) {
        const lo = str.charCodeAt(i + 1);
        if (lo >= 0xdc00 && lo <= 0xdfff) {
          i++;
          c = 0x10000 + ((c - 0xd800) << 10) + (lo - 0xdc00);
          buf[offset++] = 0xf0 | (c >> 18);
          buf[offset++] = 0x80 | ((c >> 12) & 0x3f);
          buf[offset++] = 0x80 | ((c >> 6) & 0x3f);
          buf[offset++] = 0x80 | (c & 0x3f);
          continue;
        }
      }
      buf[offset++] = 0xef;
      buf[offset++] = 0xbf;
      buf[offset++] = 0xbd;
    } else {
      buf[offset++] = 0xe0 | (c >> 12);
      buf[offset++] = 0x80 | ((c >> 6) & 0x3f);
      buf[offset++] = 0x80 | (c & 0x3f);
    }
  }
  return offset;
}

export function utf8Read(buf: Uint8Array, offset: number, length: number): string {
  if (length === 0) return "";
  return decoder.decode(buf.subarray(offset, offset + length));
}
