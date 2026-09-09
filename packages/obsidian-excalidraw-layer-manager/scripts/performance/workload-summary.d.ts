export interface WorkloadCell {
  size: number
  shape: string
  seed: number
  operation: string
}
export interface WorkloadStatistics {
  median: number
  p95: number
}
export type WorkloadMetrics = Record<
  "inputSync" | "settlement" | "renderOpportunity",
  WorkloadStatistics
>
export interface WorkloadOperation {
  operation: string
  sampleCount: number
  warmupCount: number
  measuredCount: number
  maxTimerQuantumMs: number
  metrics: WorkloadMetrics
}
export interface WorkloadCaseSummary {
  id: string
  size: number
  shape: string
  seed: number
  role: string
  status: string
  sourceHash?: string
  scriptHash?: string
  lockHash?: string
  hostNonce?: string
  sampleCount: number
  warmupCount: number
  measuredCount: number
  operations?: WorkloadOperation[]
  semanticOperations?: string[]
  holdoutTimingConfirmed: false
}
export interface WorkloadPairSummary {
  size: number
  shape: string
  seed: number
  status: "within-budget" | "inconclusive" | "unpaired"
  baselineId: string | null
  calibrationId: string | null
  baselineLockHash?: string
  calibrationLockHash?: string
  missingRoles?: string[]
  cells?: {
    cell: WorkloadCell
    baseline: WorkloadMetrics
    calibration: WorkloadMetrics
    maxMatchedTimerQuantumMs: number
    floors: Record<string, number>
    budgets: Record<string, number>
    catastrophicP95Budgets: Record<string, number>
    medianDiscrepancies: Record<string, number>
    reasons: string[]
    status: "within-budget" | "inconclusive"
  }[]
}
export interface WorkloadReport {
  schema: string
  status: "descriptive-subset"
  sourceHash: string | null
  scriptHash: string | null
  lockHashes: string[]
  cases: WorkloadCaseSummary[]
  pairs: WorkloadPairSummary[]
  coverage: {
    size: number
    shape: string
    requiredCases: number
    passedCases: number
    resourceCensoredCases: number
    notAdmittedCases: number
    missingCases: number
    unresolvedCases: number
    complete: boolean
  }[]
  counts: {
    requiredCases: number
    suppliedCases: number
    passedCases: number
    resourceCensoredCases: number
    notAdmittedCases: number
    missingCases: number
    unresolvedCases: number
    retainedSamples: number
    measuredTimingSamples: number
    semanticHoldoutSamples: number
  }
  globalAggregateAvailable: false
  selectedAsImprovement: false
  holdoutTimingConfirmed: false
  claimLimit: string
}
export function summarizeWorkloadCases(cases: unknown[]): WorkloadReport
