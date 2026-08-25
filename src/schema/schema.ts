/**
 * SchemaType wraps an IR type node and provides encode/decode methods.
 * The actual codec functions are lazily compiled via codegen on first use.
 */

import type { AnyTypeNode } from "./types.js";
import { Writer } from "../codec/writer.js";
import { Reader } from "../codec/reader.js";

type EncodeFn<T> = (writer: Writer, value: T) => void;
type DecodeFn<T> = (reader: Reader) => T;

let compilerFactory:
  | ((node: AnyTypeNode) => { encode: EncodeFn<any>; decode: DecodeFn<any> })
  | null = null;

export function setCompilerFactory(
  factory: (node: AnyTypeNode) => { encode: EncodeFn<any>; decode: DecodeFn<any> },
): void {
  compilerFactory = factory;
}

export function getCompilerFactory() {
  return compilerFactory;
}

const sharedWriter = new Writer(1024);
let writerInUse = false;
const MAX_FIELD_ID = 0x0fffffff;

export class SchemaType<N extends AnyTypeNode, T> {
  readonly _node: N;
  readonly _fieldId?: number;
  private _encode: EncodeFn<T> | null = null;
  private _decode: DecodeFn<T> | null = null;

  constructor(node: N) {
    this._node = node;
  }

  private compile(): void {
    if (!compilerFactory) {
      throw new Error(
        "nitrobuf: codec compiler not initialized. Import 'nitrobuf' before using schemas.",
      );
    }
    const { encode, decode } = compilerFactory(this._node);
    this._encode = encode;
    this._decode = decode;
  }

  encode(value: T): Uint8Array {
    if (!this._encode) this.compile();
    if (writerInUse) {
      const writer = new Writer(1024);
      this._encode!(writer, value);
      return writer.finish();
    }
    writerInUse = true;
    try {
      sharedWriter.reset();
      this._encode!(sharedWriter, value);
      return sharedWriter.finish();
    } finally {
      writerInUse = false;
    }
  }

  decode(buf: Uint8Array): T {
    if (!this._decode) this.compile();
    const reader = new Reader(buf);
    return this._decode!(reader);
  }

  encodeTo(writer: Writer, value: T): void {
    if (!this._encode) this.compile();
    this._encode!(writer, value);
  }

  decodeFrom(reader: Reader): T {
    if (!this._decode) this.compile();
    return this._decode!(reader);
  }

  /**
   * Assign a field ID for tagged struct mode.
   */
  id(fieldId: number): SchemaType<N, T> {
    if (!Number.isInteger(fieldId) || fieldId < 1 || fieldId > MAX_FIELD_ID) {
      throw new RangeError(`fieldId must be an integer in 1..${MAX_FIELD_ID}, got ${fieldId}`);
    }
    const copy = new SchemaType<N, T>(this._node);
    (copy as { _fieldId?: number })._fieldId = fieldId;
    return copy;
  }
}

export function createSchema<N extends AnyTypeNode, T>(node: N): SchemaType<N, T> {
  return new SchemaType<N, T>(node);
}
