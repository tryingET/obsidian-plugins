export function validateWorkloadPlan(cases: unknown[]): void
export function workloadDisposition(
  target: unknown,
  cases: unknown[],
): { kind: "admit"; previousSizes: number[] } | { kind: "not-admitted"; blockedBy: string }
export function isResourceCensor(result: unknown, exit: unknown, snapshots: unknown): boolean
