import { describe, expect, it } from "vitest"
import { buildMatrixPlan } from "../../scripts/performance/native-matrix-plan.js"

describe("Given approved paired-seed protocol v2 before a native baseline", () => {
  it("When planned Then retain 144 training/control hosts and48 distinct semantic-only holdouts", () => {
    const plan = buildMatrixPlan()
    expect(plan.filter((c) => c.role === "baseline")).toHaveLength(72)
    expect(plan.filter((c) => c.role === "calibration")).toHaveLength(72)
    expect(plan.filter((c) => c.role === "holdout")).toHaveLength(48)
    expect(new Set(plan.map((c) => c.id)).size).toBe(192)
    expect(plan.every((c) => c.status === "pending")).toBe(true)
    expect(plan).toEqual(buildMatrixPlan())
  })
  it("When execution progresses Then larger sizes follow complete lower levels and same-seed controls stay paired", () => {
    const plan = buildMatrixPlan()
    expect(plan.map((c) => c.size)).toEqual(plan.map((c) => c.size).sort((a, b) => a - b))
    for (const c of plan.filter((c) => c.role === "baseline")) {
      expect(
        plan.filter(
          (other) =>
            other.role === "calibration" &&
            other.size === c.size &&
            other.shape === c.shape &&
            other.seed === c.seed &&
            other.pass === c.pass,
        ),
      ).toHaveLength(1)
      expect(c.pass).toBe([558301, 558302, 558303].indexOf(c.seed))
    }
    expect(
      plan.filter((c) => c.role === "holdout").every((c) => [958301, 958302].includes(c.seed)),
    ).toBe(true)
  })
})
