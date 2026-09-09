import { describe, expect, it, vi } from "vitest"
import { buildMatrixPlan } from "../../scripts/performance/native-matrix-plan.js"
import { advanceWorkloads } from "../../scripts/performance/workload-runner.js"

function setup() {
  const cases = buildMatrixPlan().map((c) => ({
    ...c,
    status: c.size === 1000 ? "passed" : "pending",
  }))
  return cases
}
describe("Given per-shape resource progression and serial native dispatch", () => {
  it("When giant hits the cap Then censor its branch and continue qualified others without replay", async () => {
    const cases = setup()
    const measure = vi.fn(async (c: (typeof cases)[number]) => ({
      ...c,
      status: c.shape === "giant" ? "resource-censored" : "passed",
    }))
    await advanceWorkloads(cases, measure)
    expect(measure.mock.calls.filter(([c]) => c.shape === "giant")).toHaveLength(1)
    expect(cases.filter((c) => c.shape !== "giant").every((c) => c.status === "passed")).toBe(true)
    expect(
      cases.filter((c) => c.shape === "giant" && c.size >= 10000 && c.status === "not-admitted"),
    ).toHaveLength(23)
  })
  it("When a non-resource failure occurs Then preserve operational failure and never dispatch the next case", async () => {
    const cases = setup()
    const measure = vi.fn(async () => {
      throw Error("focus changed")
    })
    await expect(advanceWorkloads(cases, measure)).rejects.toThrow("focus changed")
    expect(measure).toHaveBeenCalledOnce()
    expect(cases.some((c) => c.status === "operational-failure")).toBe(true)
  })
  it("When interrupted during measurement Then a passed child cannot authorize the next case", async () => {
    const cases = setup()
    let interrupted = false
    const measure = vi.fn(async (c: (typeof cases)[number]) => {
      interrupted = true
      return { ...c, status: "passed" }
    })
    await expect(
      advanceWorkloads(
        cases,
        measure,
        async () => {},
        () => interrupted,
      ),
    ).rejects.toThrow(/interrupted/)
    expect(measure).toHaveBeenCalledOnce()
  })
})
