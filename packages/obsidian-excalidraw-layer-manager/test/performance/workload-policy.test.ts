import { describe, expect, it } from "vitest"
import { buildMatrixPlan } from "../../scripts/performance/native-matrix-plan.js"
import { isResourceCensor, workloadDisposition } from "../../scripts/performance/workload-policy.js"

const plan = () =>
  buildMatrixPlan().map((c) => ({ ...c, status: c.size === 1000 ? "passed" : "pending" }))
const target = (cases: ReturnType<typeof plan>, size: number, shape = "pairs") => {
  const c = cases.find((c) => c.size === size && c.shape === shape)
  if (!c) throw Error("fixture missing")
  return c
}
const crossing = [{ rssMiB: 8194, availableMiB: 12000 }]
const failure = () => ({
  status: "failed",
  failure: "Error: CDP closed: effects indeterminate",
  resourceFailure: "Error: sampled native resource limit",
  cleanup: { status: "stopped", remaining: [] },
})
describe("Given independent workload progression with unchanged native guards", () => {
  it("When10k giant crosses the cap Then10k pairs remains admissible", () => {
    const cases = plan()
    target(cases, 10000, "giant").status = "resource-censored"
    expect(workloadDisposition(target(cases, 10000), cases)).toEqual({
      kind: "admit",
      previousSizes: [1000],
    })
  })
  it("When one shape completed10k Then50k does not borrow or wait for unrelated shapes", () => {
    const cases = plan()
    for (const c of cases) if (c.shape === "pairs" && c.size === 10000) c.status = "passed"
    expect(workloadDisposition(target(cases, 50000), cases)).toEqual({
      kind: "admit",
      previousSizes: [1000, 10000],
    })
    expect(() => workloadDisposition(target(cases, 50000, "ten"), cases)).toThrow()
  })
  it("When any same-shape holdout is missing Then larger cases remain inadmissible", () => {
    const cases = plan()
    for (const c of cases) if (c.size === 10000) c.status = "passed"
    const holdout = cases.find(
      (c) => c.size === 10000 && c.shape === "pairs" && c.role === "holdout",
    )!
    holdout.status = "pending"
    expect(() => workloadDisposition(target(cases, 50000), cases)).toThrow()
  })
  it("When a shape is resource-censored Then its remaining equal/larger cases are not admitted, not passed", () => {
    const cases = plan()
    const blocked = target(cases, 10000, "giant")
    blocked.status = "resource-censored"
    expect(workloadDisposition(target(cases, 50000, "giant"), cases)).toEqual({
      kind: "not-admitted",
      blockedBy: blocked.id,
    })
  })
  it("When inventory is incomplete or target counterfeit Then refuse fabricated predecessor proof", () => {
    const cases = plan()
    const c = target(cases, 10000)
    expect(() => workloadDisposition(c, cases.slice(1))).toThrow()
    expect(() => workloadDisposition({ ...c, shape: "fake" }, cases)).toThrow()
  })
  it("When a real resource crossing ends with exit1 and verified shutdown Then censor only that branch", () => {
    expect(isResourceCensor(failure(), { code: 1, signal: null }, crossing)).toBe(true)
  })
  it.each(["focus", "semantic", "cleanup", "signal", "owner", "missing-crossing", "invalid"])(
    "When failure is%s Then never disguise an operational failure as resource censoring",
    (mode) => {
      const r = failure()
      const exit = { code: 1, signal: null as string | null }
      let snapshots = crossing
      if (mode === "focus") r.failure = "Error: native focus/visibility changed during measurement"
      if (mode === "semantic") r.failure = "Error: semantic mismatch"
      if (mode === "cleanup") r.cleanup.status = "indeterminate"
      if (mode === "signal") exit.signal = "SIGTERM"
      if (mode === "owner") exit.code = 75
      if (mode === "missing-crossing") snapshots = [{ rssMiB: 1000, availableMiB: 12000 }]
      if (mode === "invalid") snapshots = [{ rssMiB: NaN, availableMiB: 12000 }]
      expect(isResourceCensor(r, exit, snapshots)).toBe(false)
    },
  )
})
