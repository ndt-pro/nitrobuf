/**
 * JIT code generator: emits specialized encode/decode function bodies
 * and compiles them via new Function for maximum performance.
 *
 * Falls back to interpreter if new Function is unavailable (CSP, etc).
 */

import { Writer } from "../codec/writer.js";
import type {
  AnyTypeNode,
  ArrayNode,
  MapNode,
  StructNode,
  OptionalNode,
  NullableNode,
  EnumNode,
  UnionNode,
} from "../schema/types.js";
import { TypeKind } from "../schema/types.js";
import { compileInterpreter, type EncodeFn, type DecodeFn } from "./interpreter.js";
import { dynamicEncode, dynamicDecode } from "../dynamic/index.js";
import { assertInt, assertBigInt } from "./assert-int.js";

let jitAvailable: boolean | null = null;

export function probeJit(): boolean {
  if (jitAvailable !== null) return jitAvailable;
  try {
    const fn = new Function("return 42");
    jitAvailable = fn() === 42;
  } catch {
    jitAvailable = false;
  }
  return jitAvailable;
}

export function forceMode(mode: "jit" | "interpreter" | "auto"): void {
  if (mode === "jit") jitAvailable = true;
  else if (mode === "interpreter") jitAvailable = false;
  else jitAvailable = null;
}

interface EmitCtx {
  encLines: string[];
  decLines: string[];
  closures: Record<string, any>;
  counter: number;
}

function freshVar(ctx: EmitCtx, prefix: string): string {
  return `${prefix}${ctx.counter++}`;
}

function addClosure(ctx: EmitCtx, value: any): string {
  const name = freshVar(ctx, "c_");
  ctx.closures[name] = value;
  return name;
}

function namedClosure(ctx: EmitCtx, name: string, value: any): string {
  ctx.closures[name] = value;
  return name;
}

function emitEncode(ctx: EmitCtx, node: AnyTypeNode, varName: string): void {
  switch (node.kind) {
    case TypeKind.U8:
      namedClosure(ctx, "assertInt", assertInt);
      ctx.encLines.push(`assertInt(${varName},0,255,"u8");w.writeU8(${varName})`);
      break;
    case TypeKind.U16:
      namedClosure(ctx, "assertInt", assertInt);
      ctx.encLines.push(`assertInt(${varName},0,65535,"u16");w.writeU16(${varName})`);
      break;
    case TypeKind.U32:
      namedClosure(ctx, "assertInt", assertInt);
      ctx.encLines.push(`assertInt(${varName},0,${0xffffffff},"u32");w.writeU32(${varName})`);
      break;
    case TypeKind.U64:
      namedClosure(ctx, "assertBigInt", assertBigInt);
      ctx.encLines.push(
        `assertBigInt(${varName},0n,18446744073709551615n,"u64");w.writeU64(${varName})`,
      );
      break;
    case TypeKind.I8:
      namedClosure(ctx, "assertInt", assertInt);
      ctx.encLines.push(`assertInt(${varName},-128,127,"i8");w.writeI8(${varName})`);
      break;
    case TypeKind.I16:
      namedClosure(ctx, "assertInt", assertInt);
      ctx.encLines.push(`assertInt(${varName},-32768,32767,"i16");w.writeI16(${varName})`);
      break;
    case TypeKind.I32:
      namedClosure(ctx, "assertInt", assertInt);
      ctx.encLines.push(
        `assertInt(${varName},-2147483648,2147483647,"i32");w.writeI32(${varName})`,
      );
      break;
    case TypeKind.I64:
      namedClosure(ctx, "assertBigInt", assertBigInt);
      ctx.encLines.push(
        `assertBigInt(${varName},-9223372036854775808n,9223372036854775807n,"i64");w.writeI64(${varName})`,
      );
      break;
    case TypeKind.F32:
      ctx.encLines.push(`w.writeF32(${varName})`);
      break;
    case TypeKind.F64:
      ctx.encLines.push(`w.writeF64(${varName})`);
      break;
    case TypeKind.UInt:
      namedClosure(ctx, "assertInt", assertInt);
      ctx.encLines.push(`assertInt(${varName},0,${0xffffffff},"uint");w.writeVarint(${varName})`);
      break;
    case TypeKind.Int:
      namedClosure(ctx, "assertInt", assertInt);
      ctx.encLines.push(
        `assertInt(${varName},-2147483648,2147483647,"int");w.writeSignedVarint(${varName})`,
      );
      break;
    case TypeKind.Bool:
      ctx.encLines.push(`w.writeBool(${varName})`);
      break;
    case TypeKind.String:
      ctx.encLines.push(`w.writeString(${varName})`);
      break;
    case TypeKind.Bytes:
      ctx.encLines.push(`w.writeBytes(${varName})`);
      break;
    case TypeKind.Date:
      ctx.encLines.push(`w.writeSignedVarint64(BigInt(${varName}.getTime()))`);
      break;

    case TypeKind.BigInt: {
      const fn = addClosure(ctx, buildBigIntEnc());
      ctx.encLines.push(`${fn}(w,${varName})`);
      break;
    }
    case TypeKind.Any: {
      const fn = addClosure(ctx, dynamicEncode);
      ctx.encLines.push(`${fn}(w,${varName})`);
      break;
    }
    case TypeKind.Optional: {
      const inner = (node as OptionalNode).inner;
      ctx.encLines.push(`if(${varName}===undefined){w.writeU8(0)}else{w.writeU8(1)`);
      emitEncode(ctx, inner, varName);
      ctx.encLines.push(`}`);
      break;
    }
    case TypeKind.Nullable: {
      const inner = (node as NullableNode).inner;
      ctx.encLines.push(`if(${varName}===null){w.writeU8(0)}else{w.writeU8(1)`);
      emitEncode(ctx, inner, varName);
      ctx.encLines.push(`}`);
      break;
    }
    case TypeKind.Enum: {
      const en = node as EnumNode;
      const mapName = addClosure(ctx, new Map(en.variants.map((v, i) => [v, i])));
      ctx.encLines.push(
        `{const _ei=${mapName}.get(${varName});if(_ei===undefined)throw new Error("Unknown enum: "+${varName});w.writeVarint(_ei)}`,
      );
      break;
    }
    case TypeKind.Array: {
      const el = (node as ArrayNode).element;
      const iVar = freshVar(ctx, "i_");
      ctx.encLines.push(
        `w.writeVarint(${varName}.length);for(let ${iVar}=0;${iVar}<${varName}.length;${iVar}++){`,
      );
      emitEncode(ctx, el, `${varName}[${iVar}]`);
      ctx.encLines.push(`}`);
      break;
    }
    case TypeKind.Map: {
      const mn = node as MapNode;
      const kVar = freshVar(ctx, "mk_");
      const vVar = freshVar(ctx, "mv_");
      ctx.encLines.push(`w.writeVarint(${varName}.size);for(const[${kVar},${vVar}]of ${varName}){`);
      emitEncode(ctx, mn.key, kVar);
      emitEncode(ctx, mn.value, vVar);
      ctx.encLines.push(`}`);
      break;
    }
    case TypeKind.Union: {
      const un = node as UnionNode;
      const tagMapName = addClosure(ctx, new Map(un.variants.map((v, i) => [v.tag, i])));
      const encoderArr: EncodeFn[] = un.variants.map((v) => compileInterpreter(v.type).encode);
      const encodersName = addClosure(ctx, encoderArr);
      ctx.encLines.push(
        `{const _ui=${tagMapName}.get(${varName}.tag);if(_ui===undefined)throw new Error("Unknown union tag: "+${varName}.tag);w.writeVarint(_ui);${encodersName}[_ui](w,${varName}.value)}`,
      );
      break;
    }
    case TypeKind.Struct: {
      const sn = node as StructNode;
      if (sn.tagged) {
        const fn = addClosure(ctx, compileInterpreter(sn).encode);
        ctx.encLines.push(`${fn}(w,${varName})`);
      } else {
        emitPositionalStructEncode(ctx, sn, varName);
      }
      break;
    }
  }
}

function emitPositionalStructEncode(ctx: EmitCtx, sn: StructNode, varName: string): void {
  const optionals = sn.fields.filter((f) => f.type.kind === TypeKind.Optional);
  const bitmaskBytes = Math.ceil(optionals.length / 8);

  if (optionals.length > 0) {
    const bmVar = freshVar(ctx, "bm_");
    ctx.encLines.push(`{const ${bmVar}=new Uint8Array(${bitmaskBytes})`);
    for (let i = 0; i < optionals.length; i++) {
      ctx.encLines.push(
        `if(${varName}[${JSON.stringify(optionals[i].name)}]!==undefined)${bmVar}[${i >> 3}]|=${1 << (i & 7)}`,
      );
    }
    ctx.encLines.push(`w.writeRaw(${bmVar})}`);
  }

  for (const field of sn.fields) {
    const fAccess = `${varName}[${JSON.stringify(field.name)}]`;
    if (field.type.kind === TypeKind.Optional) {
      const inner = (field.type as OptionalNode).inner;
      ctx.encLines.push(`if(${fAccess}!==undefined){`);
      emitEncode(ctx, inner, fAccess);
      ctx.encLines.push(`}`);
    } else {
      emitEncode(ctx, field.type, fAccess);
    }
  }
}

function emitDecode(ctx: EmitCtx, node: AnyTypeNode, assignTo: string): void {
  switch (node.kind) {
    case TypeKind.U8:
      ctx.decLines.push(`${assignTo}=r.readU8()`);
      break;
    case TypeKind.U16:
      ctx.decLines.push(`${assignTo}=r.readU16()`);
      break;
    case TypeKind.U32:
      ctx.decLines.push(`${assignTo}=r.readU32()`);
      break;
    case TypeKind.U64:
      ctx.decLines.push(`${assignTo}=r.readU64()`);
      break;
    case TypeKind.I8:
      ctx.decLines.push(`${assignTo}=r.readI8()`);
      break;
    case TypeKind.I16:
      ctx.decLines.push(`${assignTo}=r.readI16()`);
      break;
    case TypeKind.I32:
      ctx.decLines.push(`${assignTo}=r.readI32()`);
      break;
    case TypeKind.I64:
      ctx.decLines.push(`${assignTo}=r.readI64()`);
      break;
    case TypeKind.F32:
      ctx.decLines.push(`${assignTo}=r.readF32()`);
      break;
    case TypeKind.F64:
      ctx.decLines.push(`${assignTo}=r.readF64()`);
      break;
    case TypeKind.UInt:
      ctx.decLines.push(`${assignTo}=r.readVarint()`);
      break;
    case TypeKind.Int:
      ctx.decLines.push(`${assignTo}=r.readSignedVarint()`);
      break;
    case TypeKind.Bool:
      ctx.decLines.push(`${assignTo}=r.readBool()`);
      break;
    case TypeKind.String:
      ctx.decLines.push(`${assignTo}=r.readString()`);
      break;
    case TypeKind.Bytes:
      ctx.decLines.push(`${assignTo}=r.readBytes()`);
      break;
    case TypeKind.Date:
      ctx.decLines.push(`${assignTo}=new Date(Number(r.readSignedVarint64()))`);
      break;

    case TypeKind.BigInt: {
      const fn = addClosure(ctx, buildBigIntDec());
      ctx.decLines.push(`${assignTo}=${fn}(r)`);
      break;
    }
    case TypeKind.Any: {
      const fn = addClosure(ctx, dynamicDecode);
      ctx.decLines.push(`${assignTo}=${fn}(r)`);
      break;
    }
    case TypeKind.Optional: {
      const inner = (node as OptionalNode).inner;
      const tmp = freshVar(ctx, "opt_");
      ctx.decLines.push(`let ${tmp};if(r.readU8()){`);
      emitDecode(ctx, inner, tmp);
      ctx.decLines.push(`}else{${tmp}=undefined}`);
      ctx.decLines.push(`${assignTo}=${tmp}`);
      break;
    }
    case TypeKind.Nullable: {
      const inner = (node as NullableNode).inner;
      const tmp = freshVar(ctx, "nul_");
      ctx.decLines.push(`let ${tmp};if(r.readU8()){`);
      emitDecode(ctx, inner, tmp);
      ctx.decLines.push(`}else{${tmp}=null}`);
      ctx.decLines.push(`${assignTo}=${tmp}`);
      break;
    }
    case TypeKind.Enum: {
      const en = node as EnumNode;
      const variantsName = addClosure(ctx, en.variants);
      ctx.decLines.push(
        `{const _ei=r.readVarint();if(_ei>=${en.variants.length})throw new Error("Enum index out of range: "+_ei);${assignTo}=${variantsName}[_ei]}`,
      );
      break;
    }
    case TypeKind.Array: {
      const el = (node as ArrayNode).element;
      const lenVar = freshVar(ctx, "al_");
      const arrVar = freshVar(ctx, "arr_");
      const iVar = freshVar(ctx, "ai_");
      ctx.decLines.push(
        `{const ${lenVar}=r.readVarint();r.ensureCount(${lenVar});const ${arrVar}=new Array(${lenVar});for(let ${iVar}=0;${iVar}<${lenVar};${iVar}++){`,
      );
      emitDecode(ctx, el, `${arrVar}[${iVar}]`);
      ctx.decLines.push(`}${assignTo}=${arrVar}}`);
      break;
    }
    case TypeKind.Map: {
      const mn = node as MapNode;
      const lenVar = freshVar(ctx, "ml_");
      const mapVar = freshVar(ctx, "map_");
      const iVar = freshVar(ctx, "mi_");
      const kVar = freshVar(ctx, "mk_");
      const vVar = freshVar(ctx, "mv_");
      ctx.decLines.push(
        `{const ${lenVar}=r.readVarint();r.ensureCount(${lenVar});const ${mapVar}=new Map();for(let ${iVar}=0;${iVar}<${lenVar};${iVar}++){let ${kVar},${vVar}`,
      );
      emitDecode(ctx, mn.key, kVar);
      emitDecode(ctx, mn.value, vVar);
      ctx.decLines.push(`${mapVar}.set(${kVar},${vVar})}${assignTo}=${mapVar}}`);
      break;
    }
    case TypeKind.Union: {
      const un = node as UnionNode;
      const tags = addClosure(
        ctx,
        un.variants.map((v) => v.tag),
      );
      const decoders = addClosure(
        ctx,
        un.variants.map((v) => compileInterpreter(v.type).decode),
      );
      ctx.decLines.push(
        `{const _ui=r.readVarint();if(_ui>=${un.variants.length})throw new Error("Union discriminant out of range: "+_ui);${assignTo}={tag:${tags}[_ui],value:${decoders}[_ui](r)}}`,
      );
      break;
    }
    case TypeKind.Struct: {
      const sn = node as StructNode;
      if (sn.tagged) {
        const fn = addClosure(ctx, compileInterpreter(sn).decode);
        ctx.decLines.push(`${assignTo}=${fn}(r)`);
      } else {
        emitPositionalStructDecode(ctx, sn, assignTo);
      }
      break;
    }
  }
}

function emitPositionalStructDecode(ctx: EmitCtx, sn: StructNode, assignTo: string): void {
  const objVar = freshVar(ctx, "obj_");
  ctx.decLines.push(`{const ${objVar}={}`);

  const optionals = sn.fields.filter((f) => f.type.kind === TypeKind.Optional);
  const bitmaskBytes = Math.ceil(optionals.length / 8);

  let bmVar = "";
  if (optionals.length > 0) {
    bmVar = freshVar(ctx, "bm_");
    ctx.decLines.push(`const ${bmVar}=new Uint8Array(${bitmaskBytes})`);
    for (let i = 0; i < bitmaskBytes; i++) {
      ctx.decLines.push(`${bmVar}[${i}]=r.readU8()`);
    }
  }

  let optIdx = 0;
  for (const field of sn.fields) {
    const fAccess = `${objVar}[${JSON.stringify(field.name)}]`;
    if (field.type.kind === TypeKind.Optional) {
      const inner = (field.type as OptionalNode).inner;
      ctx.decLines.push(`if(${bmVar}[${optIdx >> 3}]&${1 << (optIdx & 7)}){`);
      emitDecode(ctx, inner, fAccess);
      ctx.decLines.push(`}`);
      optIdx++;
    } else {
      emitDecode(ctx, field.type, fAccess);
    }
  }

  ctx.decLines.push(`${assignTo}=${objVar}}`);
}

function buildBigIntEnc(): EncodeFn {
  return (w, v: bigint) => {
    if (v < 0n) {
      w.writeU8(1);
      encodeMag(w, -v);
    } else {
      w.writeU8(0);
      encodeMag(w, v);
    }
  };
  function encodeMag(w: Writer, v: bigint) {
    const bytes: number[] = [];
    if (v === 0n) {
      w.writeVarint(0);
      return;
    }
    let val = v;
    while (val > 0n) {
      bytes.push(Number(val & 0xffn));
      val >>= 8n;
    }
    w.writeVarint(bytes.length);
    for (const b of bytes) w.writeU8(b);
  }
}

function buildBigIntDec(): DecodeFn {
  return (r) => {
    const sign = r.readU8();
    const len = r.readVarint();
    r.ensureCount(len);
    let val = 0n;
    for (let i = 0; i < len; i++) val |= BigInt(r.readU8()) << BigInt(i * 8);
    return sign ? -val : val;
  };
}

export function compileJit(node: AnyTypeNode): { encode: EncodeFn; decode: DecodeFn } {
  if (!probeJit()) {
    return compileInterpreter(node);
  }

  try {
    const ctx: EmitCtx = { encLines: [], decLines: [], closures: {}, counter: 0 };

    emitEncode(ctx, node, "v");
    emitDecode(ctx, node, "result");

    const closureNames = Object.keys(ctx.closures);
    const closureValues = closureNames.map((n) => ctx.closures[n]);

    const encBody = ctx.encLines.join("\n");
    const decBody = ctx.decLines.join("\n") + "\nreturn result";

    const encFn = new Function(...closureNames, "w", "v", encBody);
    const decFn = new Function(...closureNames, "r", `let result\n${decBody}`);

    const encode: EncodeFn = (w, v) => encFn(...closureValues, w, v);
    const decode: DecodeFn = (r) => decFn(...closureValues, r);

    return { encode, decode };
  } catch {
    return compileInterpreter(node);
  }
}
