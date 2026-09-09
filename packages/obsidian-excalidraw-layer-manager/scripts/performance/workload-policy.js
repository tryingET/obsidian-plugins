import { buildMatrixPlan } from "./native-matrix-plan.js"
import { NATIVE_POLICY } from "./native-policy.js"
import { RESOURCE_LIMITS } from "./native-safety.js"

export function validateWorkloadPlan(cases) {
  const plan = buildMatrixPlan()
  if (
    cases.length !== plan.length ||
    cases.some((c, i) =>
      ["id", "size", "shape", "seed", "role", "pass"].some((k) => c[k] !== plan[i][k]),
    )
  )
    throw Error("canonical workload inventory required")
}
export function workloadDisposition(target, cases) {
  validateWorkloadPlan(cases)
  const canonical = cases.find((c) => c.id === target.id)
  if (
    !canonical ||
    ["id", "size", "shape", "seed", "role", "pass"].some((k) => canonical[k] !== target[k])
  )
    throw Error("canonical target required")
  const blocked = cases.find(
    (c) => c.shape === target.shape && c.size <= target.size && c.status === "resource-censored",
  )
  if (blocked) return { kind: "not-admitted", blockedBy: blocked.id }
  const previous = NATIVE_POLICY.sizes.filter((size) => size < target.size)
  if (
    cases.some(
      (c) => c.shape === target.shape && previous.includes(c.size) && c.status !== "passed",
    )
  )
    throw Error("same-shape predecessor seed/role/holdout proof incomplete")
  return { kind: "admit", previousSizes: previous }
}
export function isResourceCensor(result, exit, snapshots) {
  const resourceOutcomes = [
    "Error: CDP closed: effects indeterminate",
    "Error: Error: sampled native resource limit",
    "Error: sampled native resource limit",
  ]
  return (
    exit?.code === 1 &&
    exit.signal === null &&
    result?.status === "failed" &&
    result.cleanup?.status === "stopped" &&
    Array.isArray(result.cleanup.remaining) &&
    result.cleanup.remaining.length === 0 &&
    result.resourceFailure === "Error: sampled native resource limit" &&
    resourceOutcomes.includes(result.failure) &&
    Array.isArray(snapshots) &&
    snapshots.length > 0 &&
    snapshots.every(
      (s) =>
        Number.isFinite(s.rssMiB) &&
        s.rssMiB > 0 &&
        Number.isFinite(s.availableMiB) &&
        s.availableMiB >= 0,
    ) &&
    snapshots.some(
      (s) => s.rssMiB >= RESOURCE_LIMITS.rssMiB || s.availableMiB < RESOURCE_LIMITS.availableMiB,
    )
  )
}
