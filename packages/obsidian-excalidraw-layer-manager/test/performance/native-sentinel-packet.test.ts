import { describe, expect, it } from "vitest"
import { validateSentinelReceipt } from "../../scripts/performance/native-sentinel-packet.js"

describe("Given the independent required native sentinel inventory", () => {
  const required = ["fixture", "staging", "undo", "redo", "save-reopen", "disposal"]
  const good = () => ({
    status: "passed",
    native: true,
    checks: required.map((name) => ({ name, pass: true })),
  })
  it("When complete native checks pass Then the receipt is admissible", () =>
    expect(() => validateSentinelReceipt(good(), required)).not.toThrow())
  it("When the actual failed sentinel return shape arrives Then no .failed-field shortcut passes", () => {
    expect(() =>
      validateSentinelReceipt(
        { status: "failed", checks: [], error: "synchronization timeout" },
        required,
      ),
    ).toThrow()
  })
  it("When a check bypass empties the list Then every([]) must not certify success", () =>
    expect(() => validateSentinelReceipt({ ...good(), checks: [] }, required)).toThrow())
  it("When a critical proof is missing, duplicated, false or synthetic Then reject", () => {
    const sample = good()
    sample.checks.pop()
    expect(() => validateSentinelReceipt(sample, required)).toThrow()
    expect(() =>
      validateSentinelReceipt(
        { ...good(), checks: [...good().checks, { name: "fixture", pass: true }] },
        required,
      ),
    ).toThrow()
    expect(() =>
      validateSentinelReceipt(
        { ...good(), checks: [...good().checks, { name: "unexpected failure", pass: false }] },
        required,
      ),
    ).toThrow()
    expect(() => validateSentinelReceipt({ ...good(), native: false }, required)).toThrow()
  })
  it("When the evaluator inventory itself is empty Then fail closed", () =>
    expect(() => validateSentinelReceipt(good(), [])).toThrow())
})
