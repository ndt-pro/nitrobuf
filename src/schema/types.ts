/**
 * Internal representation (IR) nodes for nitrobuf schema types.
 *
 * Wire types used in tagged mode:
 *   0 = varint, 1 = 64-bit, 2 = length-delimited, 3 = 32-bit, 4 = 8-bit, 5 = 16-bit
 */

export const enum WireType {
  Varint = 0,
  Fixed64 = 1,
  LengthDelimited = 2,
  Fixed32 = 3,
  Fixed8 = 4,
  Fixed16 = 5,
}

export const enum TypeKind {
  U8 = "u8",
  U16 = "u16",
  U32 = "u32",
  U64 = "u64",
  I8 = "i8",
  I16 = "i16",
  I32 = "i32",
  I64 = "i64",
  F32 = "f32",
  F64 = "f64",
  UInt = "uint",
  Int = "int",
  Bool = "bool",
  String = "string",
  Bytes = "bytes",
  Array = "array",
  Map = "map",
  Struct = "struct",
  Optional = "optional",
  Nullable = "nullable",
  Enum = "enum",
  Union = "union",
  Date = "date",
  BigInt = "bigint",
  Any = "any",
}

export interface TypeNode {
  readonly kind: TypeKind;
  readonly wireType: WireType;
}

export interface U8Node extends TypeNode {
  readonly kind: TypeKind.U8;
}
export interface U16Node extends TypeNode {
  readonly kind: TypeKind.U16;
}
export interface U32Node extends TypeNode {
  readonly kind: TypeKind.U32;
}
export interface U64Node extends TypeNode {
  readonly kind: TypeKind.U64;
}
export interface I8Node extends TypeNode {
  readonly kind: TypeKind.I8;
}
export interface I16Node extends TypeNode {
  readonly kind: TypeKind.I16;
}
export interface I32Node extends TypeNode {
  readonly kind: TypeKind.I32;
}
export interface I64Node extends TypeNode {
  readonly kind: TypeKind.I64;
}
export interface F32Node extends TypeNode {
  readonly kind: TypeKind.F32;
}
export interface F64Node extends TypeNode {
  readonly kind: TypeKind.F64;
}
export interface UIntNode extends TypeNode {
  readonly kind: TypeKind.UInt;
}
export interface IntNode extends TypeNode {
  readonly kind: TypeKind.Int;
}
export interface BoolNode extends TypeNode {
  readonly kind: TypeKind.Bool;
}
export interface StringNode extends TypeNode {
  readonly kind: TypeKind.String;
}
export interface BytesNode extends TypeNode {
  readonly kind: TypeKind.Bytes;
}
export interface DateNode extends TypeNode {
  readonly kind: TypeKind.Date;
}
export interface BigIntNode extends TypeNode {
  readonly kind: TypeKind.BigInt;
}
export interface AnyNode extends TypeNode {
  readonly kind: TypeKind.Any;
}

export interface ArrayNode extends TypeNode {
  readonly kind: TypeKind.Array;
  readonly element: AnyTypeNode;
}

export interface MapNode extends TypeNode {
  readonly kind: TypeKind.Map;
  readonly key: AnyTypeNode;
  readonly value: AnyTypeNode;
}

export interface StructField {
  readonly name: string;
  readonly type: AnyTypeNode;
  readonly fieldId?: number;
}

export interface StructNode extends TypeNode {
  readonly kind: TypeKind.Struct;
  readonly fields: readonly StructField[];
  readonly tagged: boolean;
}

export interface OptionalNode extends TypeNode {
  readonly kind: TypeKind.Optional;
  readonly inner: AnyTypeNode;
}

export interface NullableNode extends TypeNode {
  readonly kind: TypeKind.Nullable;
  readonly inner: AnyTypeNode;
}

export interface EnumNode extends TypeNode {
  readonly kind: TypeKind.Enum;
  readonly variants: readonly string[];
}

export interface UnionVariant {
  readonly tag: string;
  readonly type: AnyTypeNode;
}

export interface UnionNode extends TypeNode {
  readonly kind: TypeKind.Union;
  readonly variants: readonly UnionVariant[];
}

export type AnyTypeNode =
  | U8Node
  | U16Node
  | U32Node
  | U64Node
  | I8Node
  | I16Node
  | I32Node
  | I64Node
  | F32Node
  | F64Node
  | UIntNode
  | IntNode
  | BoolNode
  | StringNode
  | BytesNode
  | ArrayNode
  | MapNode
  | StructNode
  | OptionalNode
  | NullableNode
  | EnumNode
  | UnionNode
  | DateNode
  | BigIntNode
  | AnyNode;

export function wireTypeForKind(kind: TypeKind): WireType {
  switch (kind) {
    case TypeKind.U8:
    case TypeKind.I8:
    case TypeKind.Bool:
      return WireType.Fixed8;
    case TypeKind.U16:
    case TypeKind.I16:
      return WireType.Fixed16;
    case TypeKind.U32:
    case TypeKind.I32:
    case TypeKind.F32:
      return WireType.Fixed32;
    case TypeKind.U64:
    case TypeKind.I64:
    case TypeKind.F64:
      return WireType.Fixed64;
    case TypeKind.UInt:
    case TypeKind.Int:
    case TypeKind.Enum:
      return WireType.Varint;
    case TypeKind.String:
    case TypeKind.Bytes:
    case TypeKind.Array:
    case TypeKind.Map:
    case TypeKind.Struct:
    case TypeKind.Optional:
    case TypeKind.Nullable:
    case TypeKind.Union:
    case TypeKind.BigInt:
    case TypeKind.Any:
      return WireType.LengthDelimited;
    case TypeKind.Date:
      return WireType.Varint;
  }
}
