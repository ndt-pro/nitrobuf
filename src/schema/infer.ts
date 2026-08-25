/**
 * Type-level inference: Infer<typeof schema> extracts the TypeScript type.
 */

import type { SchemaType } from "./schema.js";

/**
 * Extract the TypeScript type from a schema.
 * Usage: `type MyType = Infer<typeof mySchema>`
 */
export type Infer<S> = S extends SchemaType<any, infer T> ? T : never;
