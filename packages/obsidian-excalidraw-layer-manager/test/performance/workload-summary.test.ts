import { describe, expect, it } from "vitest"
import { summarizeWorkloadCases } from "../../scripts/performance/workload-summary.js"

const hash = (character: string) => character.repeat(64)
const operations = (shape: string) => [
  "external-closed",
  "open",
  "select",
  ...(shape === "ungrouped" ? [] : ["expand"]),
  "rename",
  "external",
  "reorder",
  ...(shape === "ungrouped" ? [] : ["collapse"]),
  "close",
]
function packet(
  size: number,
  operation: string,
  index: number,
  input = 10,
  settlement = 50,
  render = 100,
) {
  return {
    status: "passed",
    native: true,
    operation,
    index,
    timerQuantumMs: 0.01,
    inputPhase: "post-requestAnimationFrame",
    checks: [
      "scene-exact",
      "rows-exact",
      "selection-exact",
      "runtime-fresh",
      "staging-preserved",
    ].map((id) => ({ id, actual: hash("a"), expected: hash("a") })),
    counts: { scene: size, rows: size, selected: 0 },
    beforeHashes: { scene: hash("b"), rows: hash("a"), selection: hash("a") },
    timing: {
      inputSync: input,
      promiseComplete: input,
      settlement,
      renderOpportunities: [settlement / 2 + render / 2, render],
      renderOpportunity: render,
    },
  }
}
type Packet = ReturnType<typeof packet>
type Case = {
  id: string
  size: number
  shape: string
  seed: number
  role: string
  status: string
  sourceHash: string
  scriptHash: string
  lockHash: string
  hostNonce: string
  packets: Packet[]
}
function makeCase(
  role = "baseline",
  size = 10000,
  shape = "giant",
  seed = role === "holdout" ? 958301 : 558301,
): Case {
  const id = `${size}-${shape}-${seed}-${role}`
  return {
    id,
    size,
    shape,
    seed,
    role,
    status: "passed",
    sourceHash: hash("a"),
    scriptHash: hash("b"),
    lockHash: hash("c"),
    hostNonce: `native-nonce-${id}`,
    packets: Array.from({ length: role === "holdout" ? 1 : 10 }, (_, index) =>
      operations(shape).map((operation) => packet(size, operation, index)),
    ).flat(),
  }
}
function rewrite(c: Case, change: (p: Packet) => Packet) {
  c.packets = c.packets.map(change)
  return c
}
const operation = (c: Case, name = "rename") =>
  summarizeWorkloadCases([c]).cases[0]?.operations?.find((o) => o.operation === name)
const pair = (baseline = makeCase(), calibration = makeCase("calibration")) =>
  summarizeWorkloadCases([baseline, calibration]).pairs[0]

// Synthetic packets exercise accounting and rejection only, not native execution provenance.
describe("Given per-workload reporting must preserve missing and censored coverage", () => {
  it.each(["pending", "dispatched-effect-indeterminate", "operational-failure"])(
    "When a supplied case is%s Then keep its missing coverage and do not infer statistics",
    (status) => {
      const c = {
        id: "unresolved",
        size: 10000,
        shape: "giant",
        seed: 558302,
        role: "baseline",
        status,
        packets: [],
      }
      const summary = summarizeWorkloadCases([makeCase(), c])
      expect(summary.counts).toMatchObject({
        suppliedCases: 2,
        passedCases: 1,
        missingCases: 191,
        unresolvedCases: 1,
      })
      expect(summary.coverage.find((r) => r.size === 10000 && r.shape === "giant")).toMatchObject({
        passedCases: 1,
        missingCases: 7,
        unresolvedCases: 1,
        complete: false,
      })
      expect(summary.cases.find((r) => r.id === c.id)).toMatchObject({ status, measuredCount: 0 })
      expect(summary.cases.find((r) => r.id === c.id)?.operations).toBeUndefined()
    },
  )
  it("When no cases are supplied Then all192 cases remain missing and no aggregate/win exists", () => {
    const summary = summarizeWorkloadCases([])
    expect(summary.counts).toMatchObject({
      requiredCases: 192,
      suppliedCases: 0,
      passedCases: 0,
      missingCases: 192,
    })
    expect(summary.coverage).toHaveLength(24)
    expect(summary.coverage.every((c) => !c.complete)).toBe(true)
    expect(summary).toMatchObject({
      sourceHash: null,
      scriptHash: null,
      globalAggregateAvailable: false,
      selectedAsImprovement: false,
      holdoutTimingConfirmed: false,
    })
  })
  it("When one case passed and another is censored Then neither missing cases nor censored packets become measured", () => {
    const censored = {
      id: "censored",
      size: 10000,
      shape: "giant",
      seed: 558302,
      role: "baseline",
      status: "resource-censored",
      packets: [],
    }
    const omitted = { ...censored, id: "not-admitted", seed: 558303, status: "not-admitted" }
    const summary = summarizeWorkloadCases([makeCase(), censored, omitted])
    expect(summary.counts).toMatchObject({
      passedCases: 1,
      resourceCensoredCases: 1,
      notAdmittedCases: 1,
      missingCases: 189,
      retainedSamples: 90,
      measuredTimingSamples: 72,
    })
    expect(summary.coverage.find((c) => c.size === 10000 && c.shape === "giant")).toMatchObject({
      complete: false,
      passedCases: 1,
      resourceCensoredCases: 1,
      notAdmittedCases: 1,
      missingCases: 5,
    })
    expect(summary.cases.find((c) => c.id === "censored")?.operations).toBeUndefined()
    expect(summary.pairs.every((p) => p.status === "unpaired")).toBe(true)
  })
  it("When all three role pairs and two holdouts pass Then only that size/shape coverage is complete", () => {
    const cases = [558301, 558302, 558303].flatMap((seed) => [
      makeCase("baseline", 10000, "ten", seed),
      makeCase("calibration", 10000, "ten", seed),
    ])
    cases.push(makeCase("holdout", 10000, "ten", 958301), makeCase("holdout", 10000, "ten", 958302))
    const summary = summarizeWorkloadCases(cases)
    expect(summary.coverage.filter((c) => c.complete)).toEqual([
      expect.objectContaining({ size: 10000, shape: "ten", passedCases: 8 }),
    ])
    expect(summary.counts).toMatchObject({
      suppliedCases: 8,
      missingCases: 184,
      semanticHoldoutSamples: 18,
    })
    expect(summary.globalAggregateAvailable).toBe(false)
    expect(summary.selectedAsImprovement).toBe(false)
  })
  it("When resource-censored partial packets are supplied Then validate and retain counts without timing aggregation", () => {
    const c = makeCase()
    c.status = "resource-censored"
    c.packets = c.packets.slice(0, 12)
    const summary = summarizeWorkloadCases([c])
    expect(summary.counts).toMatchObject({ retainedSamples: 12, measuredTimingSamples: 0 })
    expect(summary.cases[0]).toMatchObject({
      status: "resource-censored",
      sampleCount: 12,
      measuredCount: 0,
    })
    expect(summary.cases[0]?.operations).toBeUndefined()
  })
  it("When a held-out case passes Then expose semantic inventory without timing statistics or confirmation", () => {
    const summary = summarizeWorkloadCases([makeCase("holdout")])
    expect(summary.cases[0]).toMatchObject({
      sampleCount: 9,
      measuredCount: 0,
      holdoutTimingConfirmed: false,
      semanticOperations: operations("giant"),
    })
    expect(summary.cases[0]?.operations).toBeUndefined()
    expect(summary.pairs).toEqual([])
  })
  it("When only baseline and a different seed calibration exist Then never pair across seeds", () => {
    const summary = summarizeWorkloadCases([
      makeCase(),
      makeCase("calibration", 10000, "giant", 558302),
    ])
    expect(summary.pairs).toHaveLength(2)
    expect(summary.pairs.every((p) => p.status === "unpaired")).toBe(true)
  })
})

describe("Given complete native timing packets", () => {
  it("When excluding two retained warmups Then report eight subsamples with midpoint median and descriptive maximum p95", () => {
    const c = rewrite(makeCase(), (p) =>
      packet(
        10000,
        p.operation,
        p.index,
        p.index < 2 ? 900 : p.index - 1,
        p.index < 2 ? 950 : 50,
        p.index < 2 ? 1000 : 100,
      ),
    )
    expect(operation(c)).toMatchObject({
      sampleCount: 10,
      warmupCount: 2,
      measuredCount: 8,
      metrics: {
        inputSync: { median: 4.5, p95: 8 },
        settlement: { median: 50, p95: 50 },
        renderOpportunity: { median: 100, p95: 100 },
      },
    })
  })
  it("When the shape is ungrouped Then70 packets are complete and expansion/collapse remain inapplicable", () => {
    const c = makeCase("baseline", 1000, "ungrouped")
    const summary = summarizeWorkloadCases([c])
    expect(summary.counts).toMatchObject({ retainedSamples: 70, measuredTimingSamples: 56 })
    expect(summary.cases[0]?.operations?.map((o) => o.operation)).toEqual(operations("ungrouped"))
  })
  it("When inputs are reordered Then summary ordering is deterministic and input bytes are unchanged", () => {
    const cases = [makeCase("calibration"), makeCase()]
    const before = JSON.stringify(cases)
    const first = summarizeWorkloadCases(cases)
    const second = summarizeWorkloadCases(
      [...cases].reverse().map((c) => ({ ...c, packets: [...c.packets].reverse() })),
    )
    expect(first).toEqual(second)
    expect(JSON.stringify(cases)).toBe(before)
  })
  it("When retained warmups have coarser timer quantum Then the matched budget retains that information", () => {
    const c = rewrite(makeCase("calibration"), (p) => ({
      ...p,
      timerQuantumMs: p.index < 2 ? 1 : 0.01,
    }))
    const result = pair(makeCase(), c)
    expect(result?.cells?.[0]).toMatchObject({
      maxMatchedTimerQuantumMs: 1,
      floors: { inputSync: 5, settlement: 5, renderOpportunity: 5 },
    })
  })
})

describe("Given independent same-seed unchanged controls", () => {
  it("When provenance locks differ but subjects match Then preserve both locks and defer lineage authentication to the controller", () => {
    const c = makeCase("calibration")
    c.lockHash = hash("d")
    const summary = summarizeWorkloadCases([makeCase(), c])
    expect(summary.lockHashes).toEqual([hash("c"), hash("d")])
    expect(summary.pairs[0]).toMatchObject({
      status: "within-budget",
      baselineLockHash: hash("c"),
      calibrationLockHash: hash("d"),
    })
    expect(summary.claimLimit).toContain("controller")
  })
  it.each([
    [11, "within-budget"],
    [11.001, "inconclusive"],
  ])("When input median is%sms Then exact10percent boundary yields%s", (input, status) => {
    const c = rewrite(makeCase("calibration"), (p) => ({
      ...p,
      timing: { ...p.timing, inputSync: Number(input), promiseComplete: Number(input) },
    }))
    expect(pair(makeCase(), c)?.status).toBe(status)
  })
  it.each([
    [55, "within-budget"],
    [55.001, "inconclusive"],
  ])("When settlement median is%sms Then its fixed budget yields%s", (settlement, status) => {
    const c = rewrite(makeCase("calibration"), (p) =>
      packet(10000, p.operation, p.index, 10, Number(settlement), 100),
    )
    expect(pair(makeCase(), c)?.status).toBe(status)
  })
  it("When submillisecond timings change within absolute floors Then no percentage-only veto appears", () => {
    const b = rewrite(makeCase(), (p) => packet(10000, p.operation, p.index, 0.1, 0.2, 0.3))
    const c = rewrite(makeCase("calibration"), (p) =>
      packet(10000, p.operation, p.index, 0.2, 0.3, 0.4),
    )
    expect(pair(b, c)?.status).toBe("within-budget")
  })
  it.each([
    [150, "within-budget"],
    [150.001, "inconclusive"],
  ])("When one measured render tail is%sms Then catastrophic guard yields%s", (render, status) => {
    const c = rewrite(makeCase("calibration"), (p) =>
      packet(10000, p.operation, p.index, 10, 50, p.index === 9 ? Number(render) : 100),
    )
    expect(pair(makeCase(), c)?.status).toBe(status)
  })
  it("When one cell exceeds its budget Then keep exact cell reasons but never infer an improvement or candidate regression", () => {
    const c = rewrite(makeCase("calibration"), (p) =>
      p.operation === "rename" ? packet(10000, p.operation, p.index, 10, 50, 120) : p,
    )
    const summary = summarizeWorkloadCases([makeCase(), c])
    const cells = summary.pairs[0]?.cells ?? []
    expect(cells.filter((cell) => cell.status === "inconclusive")).toHaveLength(1)
    expect(cells.find((cell) => cell.cell.operation === "rename")?.reasons).toEqual([
      "renderOpportunity calibration median outside frozen budget",
    ])
    expect(summary).toMatchObject({
      selectedAsImprovement: false,
      globalAggregateAvailable: false,
      holdoutTimingConfirmed: false,
    })
  })
})

describe("Given incomplete, incompatible or malformed inputs", () => {
  it.each([
    "duplicate-id",
    "duplicate-key",
    "nonce",
    "source",
    "script",
    "lock",
    "candidate",
    "size",
    "seed",
    "shape",
    "unknown-status",
    "missing-packet",
    "duplicate-packet",
    "extra-packet",
    "operation",
    "index",
    "scene",
    "semantic",
    "timing",
    "quantum",
    "budget-overflow",
  ])("When%s occurs Then fail closed rather than report a passing subset", (mode) => {
    const b = makeCase(),
      c = makeCase("calibration")
    const p = c.packets[0]
    if (!p) throw Error("synthetic packet fixture missing")
    if (mode === "duplicate-id") c.id = b.id
    if (mode === "duplicate-key") {
      c.role = b.role
      c.id = "different-id"
    }
    if (mode === "nonce") c.hostNonce = b.hostNonce
    if (mode === "source") c.sourceHash = hash("e")
    if (mode === "script") c.scriptHash = hash("e")
    if (mode === "lock") c.lockHash = "not-a-hash"
    if (mode === "candidate") c.role = "candidate"
    if (mode === "size") c.size = 2000
    if (mode === "seed") c.seed = 958301
    if (mode === "shape") c.shape = "unknown"
    if (mode === "unknown-status") c.status = "invented-status"
    if (mode === "missing-packet") c.packets.pop()
    if (mode === "duplicate-packet") c.packets[1] = p
    if (mode === "extra-packet") c.packets.push(p)
    if (mode === "operation") p.operation = "nonexistent"
    if (mode === "index") p.index = 10
    if (mode === "scene") p.counts.scene = 1000
    if (mode === "semantic") {
      const check = p.checks[0]
      if (!check) throw Error("synthetic check fixture missing")
      check.actual = hash("f")
    }
    if (mode === "timing") p.timing.inputSync = NaN
    if (mode === "quantum") p.timerQuantumMs = 0
    if (mode === "budget-overflow") for (const p of c.packets) p.timerQuantumMs = Number.MAX_VALUE
    expect(() => summarizeWorkloadCases([b, c])).toThrow()
  })
  it("When a not-admitted case carries packets Then do not silently adopt contradictory evidence", () => {
    const c = makeCase()
    c.status = "not-admitted"
    expect(() => summarizeWorkloadCases([c])).toThrow()
  })
  it("When a partial censored packet lies Then reject it even though no timing aggregate would include it", () => {
    const c = makeCase()
    c.status = "resource-censored"
    c.packets = c.packets.slice(0, 1)
    const p = c.packets[0]
    if (!p) throw Error("synthetic partial fixture missing")
    p.native = false
    expect(() => summarizeWorkloadCases([c])).toThrow()
  })
})
