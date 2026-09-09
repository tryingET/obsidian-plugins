export function assertHostIdentity(
  owned: Record<string, unknown>,
  observed: Record<string, unknown>,
): void
export function admitSize(
  size: number,
  state: {
    completedSizes: number[]
    pilotPassed: boolean
    effect: string
    rssMiB: number
    availableMiB: number
  },
): void
export const RESOURCE_LIMITS: {
  readonly rssMiB: number
  readonly availableMiB: number
  readonly operationMs: number
  readonly startupMs: number
}
