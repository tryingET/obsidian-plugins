export function advanceWorkloads<T extends { status: string }>(
  cases: T[],
  measure: (c: T, previousSizes: number[]) => Promise<T>,
  checkpoint?: () => Promise<void>,
  interrupted?: () => boolean,
): Promise<void>
