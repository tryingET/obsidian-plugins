// Operator-approved preregistration v2 (AK5583 evidence8626), before baseline/candidates.
// The strict v1 generic evaluator remains a development artifact, not native acceptance policy.
import { CONTRACT } from "./evaluator-contract.mjs"

/** @template T @param {T} value @returns {T} */
const freeze = (value) => {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}
export const NATIVE_POLICY = freeze({
  version: 2,
  trainingSeeds: CONTRACT.seeds,
  holdoutSeeds: CONTRACT.holdoutSeeds,
  sizes: CONTRACT.sizes,
  shapes: CONTRACT.shapes,
  timingSamplesPerBlock: 10,
  warmupsPerBlock: 2,
  semanticHoldoutSamples: 1,
  processDesign:
    "one independent process per training seed, role, size and shape; seeds matched between roles; seed and process variance not separated",
  inputPhase: "post-requestAnimationFrame",
  absoluteFloorsMs: { inputSync: 1, settlement: 4, renderOpportunity: 4 },
  minimumTimerQuanta: 5,
  maxRegressionFraction: 0.1,
  p95Catastrophic: { absoluteMs: 50, fraction: 0.5 },
  practicalImprovementFraction: 0.2,
  noiseMultiplier: 2,
  primaryMetric: "renderOpportunity",
  primarySizes: [10000, 50000, 100000],
  primaryOperations: ["open", "select", "expand", "rename", "external", "reorder", "collapse"],
  aggregate:
    "equal weight matched-seed geometric-mean ratios over declared large-canvas UI cells, not any-cell selection",
  holdoutRequirement:
    "semantic checks across the entire size/shape holdout matrix; fresh matched held-out timing confirmation required before any future win",
  descriptiveP95:
    "nearest-rank over retained subsamples; not production-tail inference or independent repetitions",
  rule: "missing/failed/resource-blocked cells are incomplete; noisy comparisons inconclusive; budgets never widened for candidates",
})
