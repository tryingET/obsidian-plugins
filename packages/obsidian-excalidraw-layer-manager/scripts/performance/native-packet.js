// Independent native packet boundary. A self-reported digest alone is not native proof:
// the controller must authenticate the frozen runner and its live host identity.
import { CONTRACT } from "./evaluator-contract.mjs"
import { NATIVE_POLICY } from "./native-policy.js"
export function validateNativePacket(sample) {
  if (sample?.status !== "passed" || sample.native !== true)
    throw Error("native successful sample required")
  if (
    sample.inputPhase !== NATIVE_POLICY.inputPhase ||
    !Number.isFinite(sample.timerQuantumMs) ||
    sample.timerQuantumMs <= 0
  )
    throw Error("v2 native phase/clock proof required")
  if (
    !Array.isArray(sample.checks) ||
    sample.checks.length !== CONTRACT.mandatoryChecks.length ||
    new Set(sample.checks.map((c) => c.id)).size !== CONTRACT.mandatoryChecks.length
  )
    throw Error("mandatory checks missing/duplicated")
  for (const id of CONTRACT.mandatoryChecks) {
    const check = sample.checks.find((c) => c.id === id)
    if (!check || !/^[0-9a-f]{64}$/.test(check.actual) || check.actual !== check.expected)
      throw Error(`semantic failure: ${id}`)
  }
  if (
    !["scene", "rows", "selection"].some(
      (name) =>
        sample.beforeHashes?.[name] !==
        sample.checks.find((c) => c.id === `${name}-exact`).expected,
    )
  )
    throw Error("no-op work")
  for (const name of ["scene", "rows", "selection"])
    if (!/^[0-9a-f]{64}$/.test(sample.beforeHashes?.[name]))
      throw Error("before-state proof missing")
  for (const name of ["scene", "rows", "selected"])
    if (!Number.isSafeInteger(sample.counts?.[name]) || sample.counts[name] < 0)
      throw Error("invalid count")
  const t = sample.timing
  if (!t || !Array.isArray(t.renderOpportunities) || t.renderOpportunities.length < 2)
    throw Error("two render opportunities required")
  const ordered = [
    t.inputSync,
    t.promiseComplete,
    t.settlement,
    ...t.renderOpportunities,
    t.renderOpportunity,
  ]
  let previous = 0
  for (const duration of ordered) {
    if (!Number.isFinite(duration) || duration < previous) throw Error("invalid timing order")
    previous = duration
  }
  return sample
}
