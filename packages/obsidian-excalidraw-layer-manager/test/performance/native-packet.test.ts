import { describe, expect, it } from "vitest"
import { validateNativePacket } from "../../scripts/performance/native-packet.js"

const hash = (n: string) => n.repeat(64)
const good = () => ({
  status: "passed",
  native: true,
  operation: "rename",
  index: 0,
  inputPath: "native command facade",
  inputPhase: "post-requestAnimationFrame",
  timerQuantumMs: 0.1,
  checks: [
    "scene-exact",
    "rows-exact",
    "selection-exact",
    "runtime-fresh",
    "staging-preserved",
  ].map((id) => ({ id, actual: hash("a"), expected: hash("a") })),
  counts: { scene: 1000, rows: 1000, selected: 0 },
  timing: {
    inputSync: 1,
    promiseComplete: 2,
    settlement: 3,
    renderOpportunity: 8,
    renderOpportunities: [5, 8],
  },
  beforeHashes: { scene: hash("b"), rows: hash("a"), selection: hash("a") },
})
describe("Given independent native semantic digests and complete raw timing evidence", () => {
  it("When phase alignment or measured clock resolution is missing Then v2 refuses the packet", () => {
    for (const timerQuantumMs of [0, -1, Number.NaN, Infinity])
      expect(() => validateNativePacket({ ...good(), timerQuantumMs })).toThrow()
    expect(() => validateNativePacket({ ...good(), inputPhase: "uncontrolled" })).toThrow()
  })
  it("When all mandatory proofs hold Then the sample is admitted", () =>
    expect(() => validateNativePacket(good())).not.toThrow())
  it("When a no-op or stale cache pretends to be faster Then exact expected semantics reject it", () => {
    const sample = good()
    const scene = sample.checks.find((c) => c.id === "scene-exact"),
      runtime = sample.checks.find((c) => c.id === "runtime-fresh")
    if (!scene || !runtime) throw Error("fixture")
    scene.actual = hash("b")
    expect(() => validateNativePacket(sample)).toThrow()
    scene.actual = hash("a")
    runtime.actual = hash("b")
    expect(() => validateNativePacket(sample)).toThrow()
  })
  it("When a row is dropped Then exact row identity digest rejects it", () => {
    const sample = good()
    const rows = sample.checks.find((c) => c.id === "rows-exact")
    if (!rows) throw Error("fixture")
    rows.actual = hash("c")
    expect(() => validateNativePacket(sample)).toThrow()
  })
  it("When checks are bypassed Then the independently enforced mandatory inventory rejects it", () => {
    const sample = good()
    sample.checks.pop()
    expect(() => validateNativePacket(sample)).toThrow()
  })
  it("When every scene/row/selection state is unchanged Then no work is claimed", () => {
    const sample = good()
    sample.beforeHashes.scene = hash("a")
    expect(() => validateNativePacket(sample)).toThrow()
  })
  it("When one frame or invalid timing is reported Then settlement is rejected", () => {
    const sample = good()
    sample.timing.renderOpportunities = [8]
    expect(() => validateNativePacket(sample)).toThrow()
    sample.timing.renderOpportunities = [5, 8]
    sample.timing.settlement = 9
    expect(() => validateNativePacket(sample)).toThrow()
  })
  it("When a failure or Node proxy arrives Then aggregation cannot turn it into success", () => {
    expect(() => validateNativePacket({ ...good(), status: "failed" })).toThrow()
    expect(() => validateNativePacket({ ...good(), native: false })).toThrow()
  })
})
