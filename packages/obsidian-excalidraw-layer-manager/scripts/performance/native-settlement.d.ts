export function settleUntilStable(
  observe: {
    ready(): boolean
    identity(): string | number | null
    frame(): Promise<unknown>
    now(): number
  },
  deadline: number,
): Promise<{
  settlement: number
  opportunities: number[]
  attempts: number
  identity: string | number | null
}>
