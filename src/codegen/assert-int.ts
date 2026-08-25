export function assertInt(value: number, min: number, max: number, kind: string): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${kind} out of range: ${value}`);
  }
}

export function assertBigInt(value: bigint, min: bigint, max: bigint, kind: string): void {
  if (typeof value !== "bigint" || value < min || value > max) {
    throw new RangeError(`${kind} out of range: ${value}`);
  }
}
