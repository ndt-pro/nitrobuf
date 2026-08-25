/**
 * Schema builder API — the `nb` namespace.
 * Produces IR nodes that drive codegen.
 */

import {
  TypeKind,
  WireType,
  wireTypeForKind,
  type AnyTypeNode,
  type ArrayNode,
  type MapNode,
  type StructNode,
  type StructField,
  type OptionalNode,
  type NullableNode,
  type EnumNode,
  type UnionNode,
  type UnionVariant,
  type U8Node,
  type U16Node,
  type U32Node,
  type U64Node,
  type I8Node,
  type I16Node,
  type I32Node,
  type I64Node,
  type F32Node,
  type F64Node,
  type UIntNode,
  type IntNode,
  type BoolNode,
  type StringNode,
  type BytesNode,
  type DateNode,
  type BigIntNode,
  type AnyNode,
} from "./types.js";
import { type SchemaType, createSchema } from "./schema.js";
import type { Infer } from "./infer.js";

function node<K extends TypeKind>(kind: K): { kind: K; wireType: WireType } {
  return { kind, wireType: wireTypeForKind(kind) };
}

export const u8 = createSchema<U8Node, number>(node(TypeKind.U8));
export const u16 = createSchema<U16Node, number>(node(TypeKind.U16));
export const u32 = createSchema<U32Node, number>(node(TypeKind.U32));
export const u64 = createSchema<U64Node, bigint>(node(TypeKind.U64));
export const i8 = createSchema<I8Node, number>(node(TypeKind.I8));
export const i16 = createSchema<I16Node, number>(node(TypeKind.I16));
export const i32 = createSchema<I32Node, number>(node(TypeKind.I32));
export const i64 = createSchema<I64Node, bigint>(node(TypeKind.I64));
export const f32 = createSchema<F32Node, number>(node(TypeKind.F32));
export const f64 = createSchema<F64Node, number>(node(TypeKind.F64));
export const uint = createSchema<UIntNode, number>(node(TypeKind.UInt));
export const int = createSchema<IntNode, number>(node(TypeKind.Int));
export const bool = createSchema<BoolNode, boolean>(node(TypeKind.Bool));
export const string = createSchema<StringNode, string>(node(TypeKind.String));
export const bytes = createSchema<BytesNode, Uint8Array>(node(TypeKind.Bytes));
export const date = createSchema<DateNode, Date>(node(TypeKind.Date));
export const bigint = createSchema<BigIntNode, bigint>(node(TypeKind.BigInt));
export const any = createSchema<AnyNode, unknown>(node(TypeKind.Any));

export function array<El extends AnyTypeNode, T>(
  element: SchemaType<El, T>,
): SchemaType<ArrayNode, T[]> {
  const n: ArrayNode = {
    kind: TypeKind.Array,
    wireType: WireType.LengthDelimited,
    element: element._node,
  };
  return createSchema<ArrayNode, T[]>(n);
}

export function map<KN extends AnyTypeNode, VN extends AnyTypeNode, K, V>(
  key: SchemaType<KN, K>,
  value: SchemaType<VN, V>,
): SchemaType<MapNode, Map<K, V>> {
  const n: MapNode = {
    kind: TypeKind.Map,
    wireType: WireType.LengthDelimited,
    key: key._node,
    value: value._node,
  };
  return createSchema<MapNode, Map<K, V>>(n);
}

export function optional<El extends AnyTypeNode, T>(
  inner: SchemaType<El, T>,
): SchemaType<OptionalNode, T | undefined> {
  const n: OptionalNode = {
    kind: TypeKind.Optional,
    wireType: WireType.LengthDelimited,
    inner: inner._node,
  };
  return createSchema<OptionalNode, T | undefined>(n);
}

export function nullable<El extends AnyTypeNode, T>(
  inner: SchemaType<El, T>,
): SchemaType<NullableNode, T | null> {
  const n: NullableNode = {
    kind: TypeKind.Nullable,
    wireType: WireType.LengthDelimited,
    inner: inner._node,
  };
  return createSchema<NullableNode, T | null>(n);
}

export function enumOf<const V extends readonly string[]>(
  variants: V,
): SchemaType<EnumNode, V[number]> {
  const n: EnumNode = { kind: TypeKind.Enum, wireType: WireType.Varint, variants: variants as any };
  return createSchema<EnumNode, V[number]>(n);
}

type UnionInput = Record<string, SchemaType<any, any>>;

type UnionOutput<T extends UnionInput> = {
  [K in keyof T]: { tag: K & string; value: Infer<T[K]> };
}[keyof T];

export function union<T extends UnionInput>(variants: T): SchemaType<UnionNode, UnionOutput<T>> {
  const uvs: UnionVariant[] = Object.entries(variants).map(([tag, schema]) => ({
    tag,
    type: schema._node,
  }));
  const n: UnionNode = { kind: TypeKind.Union, wireType: WireType.LengthDelimited, variants: uvs };
  return createSchema<UnionNode, UnionOutput<T>>(n);
}

type StructInput = Record<string, SchemaType<any, any>>;

type Simplify<T> = { [K in keyof T]: T[K] } & {};

type StructOutput<T extends StructInput> = Simplify<
  {
    [K in keyof T as T[K] extends SchemaType<OptionalNode, any> ? never : K]: Infer<T[K]>;
  } & {
    [K in keyof T as T[K] extends SchemaType<OptionalNode, any> ? K : never]?: Exclude<
      Infer<T[K]>,
      undefined
    >;
  }
>;

export interface StructOptions {
  tagged?: boolean;
}

export function struct<T extends StructInput>(
  fields: T,
  options?: StructOptions,
): SchemaType<StructNode, StructOutput<T>> {
  const tagged = options?.tagged ?? false;
  const seen = new Set<number>();
  const sf: StructField[] = Object.entries(fields).map(([name, schema]) => {
    const fieldId = schema._fieldId;
    if (tagged) {
      if (fieldId === undefined) {
        throw new Error(`tagged struct field "${name}" requires .id(n)`);
      }
      if (seen.has(fieldId)) {
        throw new Error(`duplicate fieldId ${fieldId} on "${name}"`);
      }
      seen.add(fieldId);
    }
    return {
      name,
      type: schema._node,
      fieldId: tagged ? fieldId : undefined,
    };
  });
  const n: StructNode = {
    kind: TypeKind.Struct,
    wireType: WireType.LengthDelimited,
    fields: sf,
    tagged,
  };
  return createSchema<StructNode, StructOutput<T>>(n);
}
