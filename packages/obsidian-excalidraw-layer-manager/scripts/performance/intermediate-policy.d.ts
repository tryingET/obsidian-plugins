export function assertResources(snapshot: unknown): void
export function admitIntermediate(
  size: number,
  shape: string,
  previous?: unknown[],
  lockHash?: string,
): void
export const INTERMEDIATE: {
  readonly id: string
  readonly sizes: readonly number[]
  readonly shapes: readonly string[]
  readonly seed: number
  readonly cycles: number
  readonly fiveKMaxRssMiB: number
  readonly fiveKMaxOperationMs: number
}
