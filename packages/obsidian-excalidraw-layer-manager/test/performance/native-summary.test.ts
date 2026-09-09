import { describe, expect, it } from "vitest"
// @ts-expect-error -- Pure JS evaluator is runtime-tested; no TS declaration surface.
import * as nativeSummary from "../../scripts/performance/native-summary.js"

const {
  compareNative,
  operationsForShape,
  summarizeNative,
  measureNativeCalibration,
  validateNativeHoldouts,
  assertChangedNativeSubject,
} = nativeSummary

// SYNTHETIC envelopes only: native:true labels are not native execution evidence.
describe("Given the controller terminal unchanged-control path", () => {
  it("When real baseline/calibration summaries retain their roles Then identity rejection does not fabricate a candidate or nonce", () => {
    const base = summarizeNative(baseline, "baseline"),
      control = summarizeNative(calibration, "calibration")
    expect(() => assertChangedNativeSubject(base, control)).toThrow("unchanged")
    expect(base.role).toBe("baseline")
    expect(control.role).toBe("calibration")
  })
})
type Role = "baseline" | "calibration" | "candidate" | "holdout"
type Cell = { size: number; shape: string; seed: number; operation: string }
const hash = (value: string) => value.repeat(64)
const trainingSeeds = [558301, 558302, 558303],
  holdoutSeeds = [958301, 958302]
const sizes = [1000, 10000, 50000, 100000]
const shapes = ["ungrouped", "pairs", "ten", "giant", "nested8", "skewed"]
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
const primary = (cell: Cell) =>
  cell.size >= 10000 &&
  ["open", "select", "expand", "rename", "external", "reorder", "collapse"].includes(cell.operation)
const checks = [
  "scene-exact",
  "rows-exact",
  "selection-exact",
  "runtime-fresh",
  "staging-preserved",
].map((id) => ({ id, actual: hash("a"), expected: hash("a") }))
function packet(cell: Cell, index: number, scale = 1) {
  const scaled = (value: number) => Number((value * scale).toFixed(6))
  return {
    status: "passed",
    native: true,
    operation: cell.operation,
    index,
    timerQuantumMs: 0.01,
    inputPhase: "post-requestAnimationFrame",
    inputPath: "synthetic unit fixture",
    checks,
    counts: { scene: cell.size, rows: cell.size, selected: 0 },
    beforeHashes: { scene: hash("b"), rows: hash("a"), selection: hash("a") },
    timing: {
      inputSync: scaled(10),
      promiseComplete: scaled(20),
      settlement: scaled(50),
      renderOpportunities: [scaled(75), scaled(100)],
      renderOpportunity: scaled(100),
    },
  }
}
type Packet = ReturnType<typeof packet>
type Envelope = {
  role: Role
  sourceHash: string
  scriptHash: string
  lockHash: string
  cell: Cell
  processPass: string
  index: number
  hostNonce: string
  packet: Packet
}
function run(role: Role, scale = 1): Envelope[] {
  const samples: Envelope[] = [],
    packets = new Map<string, Packet>()
  for (const seed of role === "holdout" ? holdoutSeeds : trainingSeeds)
    for (const size of sizes)
      for (const shape of shapes) {
        const processPass = `${role}/${seed}/${size}/${shape}`
        for (const operation of operations(shape)) {
          const cell = { seed, size, shape, operation }
          for (let index = 0; index < (role === "holdout" ? 1 : 10); index++) {
            const key = `${size}/${operation}/${index}`
            if (!packets.has(key)) packets.set(key, packet(cell, index, scale))
            const value = packets.get(key)
            if (!value) throw Error("fixture")
            samples.push({
              role,
              sourceHash: hash(role === "candidate" ? "c" : "a"),
              scriptHash: hash(role === "candidate" ? "e" : "b"),
              lockHash: hash("d"),
              cell,
              processPass,
              index,
              hostNonce: `nonce-${processPass}`,
              packet: value,
            })
          }
        }
      }
  return samples
}
const baseline = run("baseline"),
  calibration = run("calibration"),
  candidate = run("candidate", 0.75),
  holdouts = run("holdout")
const firstChanged = (samples: Envelope[], change: (e: Envelope) => Envelope) => {
  const first = samples[0]
  if (!first) throw Error("fixture")
  return [change(structuredClone(first)), ...samples.slice(1)]
}
const scaleSample = (e: Envelope, scale: number) => ({
  ...e,
  packet: packet(e.cell, e.index, scale),
})
const sameCell = (a: Cell, b: Cell) =>
  a.seed === b.seed && a.size === b.size && a.shape === b.shape && a.operation === b.operation
const withInput = (e: Envelope, inputSync: number) => ({
  ...e,
  packet: {
    ...e.packet,
    timing: {
      ...e.packet.timing,
      inputSync,
      promiseComplete: Math.max(inputSync, e.packet.timing.promiseComplete),
    },
  },
})
const withRender = (e: Envelope, render: number) => ({
  ...e,
  packet: {
    ...e.packet,
    timing: {
      ...e.packet.timing,
      renderOpportunities: [Math.min(e.packet.timing.settlement, render), render],
      renderOpportunity: render,
    },
  },
})

describe("Given the approved v2 one-process matched-seed training grid", () => {
  it("When operations are requested Then their exact shape-dependent order is frozen", () => {
    for (const shape of shapes) expect(operationsForShape(shape)).toEqual(operations(shape))
    expect(() => operationsForShape("unknown")).toThrow()
  })
  it("When all cells are present Then seed-specific blocks have 624 cells,72 processes and6240 samples", () => {
    const result = summarizeNative(baseline, "baseline")
    expect(result).toMatchObject({
      role: "baseline",
      sourceHash: hash("a"),
      scriptHash: hash("b"),
      lockHash: hash("d"),
      cellCount: 624,
      processCount: 72,
      sampleCount: 6240,
      warmupCount: 1248,
      measuredCount: 4992,
    })
    expect(result.cells[0]).toMatchObject({
      sampleCount: 10,
      warmupCount: 2,
      measuredCount: 8,
      maxTimerQuantumMs: 0.01,
      metrics: {
        inputSync: { median: 10, p95: 10 },
        settlement: { median: 50, p95: 50 },
        renderOpportunity: { median: 100, p95: 100 },
      },
    })
    expect(result.cells[0].blocks).toHaveLength(1)
    expect(result.tailLabel).toContain("not production-tail")
  })
  it("When order changes Then sorted block summaries are unchanged and inputs stay intact", () => {
    const before = JSON.stringify(baseline[0])
    expect(summarizeNative([...baseline].reverse(), "baseline")).toEqual(
      summarizeNative(baseline, "baseline"),
    )
    expect(JSON.stringify(baseline[0])).toBe(before)
  })
  it("When warmups are slow Then they remain counted but are excluded from each block's statistics", () => {
    const result = summarizeNative(
      baseline.map((e) => (e.index < 2 ? scaleSample(e, 10000) : e)),
      "baseline",
    )
    expect(result.cells[0].metrics.renderOpportunity).toEqual({ median: 100, p95: 100 })
  })
  it("When subsamples vary Then median and descriptive nearest-rank p95 remain within each seed block", () => {
    const result = summarizeNative(
      baseline.map((e) => scaleSample(e, e.index + 1)),
      "baseline",
    )
    expect(result.cells[0].metrics.renderOpportunity).toEqual({ median: 650, p95: 1000 })
  })
  for (const [label, change] of [
    ["wrong role", (e: Envelope) => ({ ...e, role: "candidate" as Role })],
    ["mixed source", (e: Envelope) => ({ ...e, sourceHash: hash("f") })],
    ["mixed installed script", (e: Envelope) => ({ ...e, scriptHash: hash("f") })],
    ["mixed evaluator lock", (e: Envelope) => ({ ...e, lockHash: hash("f") })],
    ["malformed script hash", (e: Envelope) => ({ ...e, scriptHash: "script" })],
    ["holdout seed in training", (e: Envelope) => ({ ...e, cell: { ...e.cell, seed: 958301 } })],
    ["unknown size", (e: Envelope) => ({ ...e, cell: { ...e.cell, size: 42 } })],
    ["unknown shape", (e: Envelope) => ({ ...e, cell: { ...e.cell, shape: "flat" } })],
    [
      "inapplicable operation",
      (e: Envelope) => ({
        ...e,
        cell: { ...e.cell, operation: "expand" },
        packet: { ...e.packet, operation: "expand" },
      }),
    ],
    [
      "wrong scene count",
      (e: Envelope) => ({
        ...e,
        packet: { ...e.packet, counts: { ...e.packet.counts, scene: 999 } },
      }),
    ],
    [
      "packet operation mismatch",
      (e: Envelope) => ({ ...e, packet: { ...e.packet, operation: "rename" } }),
    ],
    ["packet index mismatch", (e: Envelope) => ({ ...e, packet: { ...e.packet, index: 4 } })],
    ["out-of-range index", (e: Envelope) => ({ ...e, index: 10 })],
    ["empty pass", (e: Envelope) => ({ ...e, processPass: " " })],
    ["empty nonce", (e: Envelope) => ({ ...e, hostNonce: " " })],
    ["failed packet", (e: Envelope) => ({ ...e, packet: { ...e.packet, status: "failed" } })],
    ["Node proxy", (e: Envelope) => ({ ...e, packet: { ...e.packet, native: false } })],
    [
      "check bypass",
      (e: Envelope) => ({ ...e, packet: { ...e.packet, checks: e.packet.checks.slice(1) } }),
    ],
    ["zero timer quantum", (e: Envelope) => ({ ...e, packet: { ...e.packet, timerQuantumMs: 0 } })],
    [
      "nonfinite timer quantum",
      (e: Envelope) => ({ ...e, packet: { ...e.packet, timerQuantumMs: Infinity } }),
    ],
  ] as const)
    it(`When ${label} appears Then summary fails closed`, () => {
      expect(() => summarizeNative(firstChanged(baseline, change), "baseline")).toThrow()
    })
  it("When a sample is missing or duplicated Then no complete summary is produced", () => {
    expect(() => summarizeNative(baseline.slice(1), "baseline")).toThrow()
    expect(() => summarizeNative([baseline[0], ...baseline.slice(0, -1)], "baseline")).toThrow()
  })
  it("When one process changes nonce or spans workloads Then provenance is rejected", () => {
    expect(() =>
      summarizeNative(
        firstChanged(baseline, (e) => ({ ...e, hostNonce: "other" })),
        "baseline",
      ),
    ).toThrow()
    const other = baseline.find((e) => e.cell.shape === "pairs"),
      first = baseline[0]
    if (!other || !first) throw Error("fixture")
    expect(() =>
      summarizeNative(
        baseline.map((e) =>
          e.processPass === other.processPass
            ? { ...e, processPass: first.processPass, hostNonce: first.hostNonce }
            : e,
        ),
        "baseline",
      ),
    ).toThrow()
    expect(() =>
      summarizeNative(
        baseline.map((e) =>
          e.processPass === other.processPass ? { ...e, hostNonce: first.hostNonce } : e,
        ),
        "baseline",
      ),
    ).toThrow()
  })
  it("When operations for one seed use independent extra processes Then that is not the frozen one-block design", () => {
    expect(() =>
      summarizeNative(
        baseline.map((e) =>
          e.cell.operation === "open"
            ? { ...e, processPass: `extra-${e.processPass}`, hostNonce: `extra-${e.hostNonce}` }
            : e,
        ),
        "baseline",
      ),
    ).toThrow()
  })
})

describe("Given the complete two-seed semantic holdout grid", () => {
  it("When 416 cells from48 fresh processes pass Then only semantic holdouts are validated", () => {
    expect(validateNativeHoldouts(holdouts, hash("a"), hash("b"), hash("d"))).toMatchObject({
      status: "semantic-holdouts-valid",
      cellCount: 416,
      processCount: 48,
      sampleCount: 416,
      holdoutTimingConfirmed: false,
    })
    expect(
      validateNativeHoldouts(holdouts, hash("a"), hash("b"), hash("d")).requiredHoldoutTimingGate,
    ).toContain("fresh matched")
  })
  it("When holdouts are incomplete,duplicated,wrong-seed or wrong-provenance Then they cannot close the gate", () => {
    for (const samples of [
      holdouts.slice(1),
      [holdouts[0], ...holdouts.slice(0, -1)],
      firstChanged(holdouts, (e) => ({ ...e, cell: { ...e.cell, seed: 558301 } })),
      firstChanged(holdouts, (e) => ({ ...e, index: 1, packet: { ...e.packet, index: 1 } })),
    ]) {
      expect(() => validateNativeHoldouts(samples, hash("a"), hash("b"), hash("d"))).toThrow()
    }
    expect(() => validateNativeHoldouts(holdouts, hash("c"), hash("b"), hash("d"))).toThrow()
    expect(() => validateNativeHoldouts(holdouts, hash("a"), hash("e"), hash("d"))).toThrow()
    expect(() => validateNativeHoldouts(holdouts, hash("a"), hash("b"), hash("f"))).toThrow()
  })
})

describe("Given same-seed calibration and candidate block medians", () => {
  it("When different roles reuse host nonces Then relabeling one process is not an independent control", () => {
    const reused = calibration.map((e) => ({
      ...e,
      hostNonce: e.hostNonce.replace("calibration/", "baseline/"),
    }))
    expect(() => measureNativeCalibration(baseline, reused)).toThrow(/nonce/)
    const next = candidate.map((e) => ({
      ...e,
      hostNonce: e.hostNonce.replace("candidate/", "calibration/"),
    }))
    expect(() => compareNative(baseline, calibration, next)).toThrow(/nonce/)
  })
  it("When five matched timer quanta exceed the absolute floor Then they define a frozen equality boundary", () => {
    const coarse = (e: Envelope) => ({ ...e, packet: { ...e.packet, timerQuantumMs: 1 } })
    const base = baseline.map(coarse),
      cal = calibration.map(coarse)
    const next = candidate.map((e) => coarse(withInput(e, 15)))
    expect(compareNative(base, cal, next).status).toBe("confirmation-required")
    expect(() =>
      compareNative(
        base,
        cal,
        candidate.map((e) => coarse(withInput(e, 15.001))),
      ),
    ).toThrow(/budget/)
    expect(
      compareNative(
        base,
        cal,
        next.map((e) => ({ ...e, packet: { ...e.packet, timerQuantumMs: 0.1 } })),
      ).status,
    ).toBe("confirmation-required")
  })
  it("When input phase is not preregistered Then otherwise valid timing packets are rejected", () => {
    expect(() =>
      summarizeNative(
        firstChanged(baseline, (e) => ({ ...e, packet: { ...e.packet, inputPhase: "arbitrary" } })),
        "baseline",
      ),
    ).toThrow()
  })
  it("When the fixed aggregate exceeds practical and paired-noise bands Then fresh holdout TIMING is still required", () => {
    const result = compareNative(baseline, calibration, candidate)
    expect(result.status).toBe("confirmation-required")
    expect(result.aggregateGain).toBeCloseTo(0.25)
    expect(result.primaryCellCount).toBe(360)
    expect(result.requiredHoldoutTimingGate).toContain("fresh matched")
    expect(result.holdoutTimingConfirmed).toBe(false)
    expect(result.aggregateLabel).toContain("floor-adjusted")
  })
  it("When source or executable bundle is unchanged Then comment-only or identical candidates are never selected", () => {
    expect(() =>
      compareNative(
        baseline,
        calibration,
        candidate.map((e) => ({ ...e, sourceHash: hash("a") })),
      ),
    ).toThrow()
    expect(() =>
      compareNative(
        baseline,
        calibration,
        candidate.map((e) => ({ ...e, scriptHash: hash("b") })),
      ),
    ).toThrow()
    expect(() =>
      compareNative(
        baseline,
        calibration.map((e) => ({ ...e, scriptHash: hash("f") })),
        candidate,
      ),
    ).toThrow()
    expect(() =>
      compareNative(
        baseline,
        calibration,
        candidate.map((e) => ({ ...e, lockHash: hash("f") })),
      ),
    ).toThrow()
  })
  it("When input sync changes .1 to .2ms Then the1ms floor prevents a relative-noise veto", () => {
    const base = baseline.map((e) => withInput(e, 0.1)),
      cal = calibration.map((e) => withInput(e, 0.2)),
      next = candidate.map((e) => withInput(e, 0.2))
    expect(measureNativeCalibration(base, cal).status).toBe("calibrated")
    expect(compareNative(base, cal, next).status).toBe("confirmation-required")
  })
  it("When baseline is zero and candidate is materially larger Then the absolute budget still rejects it", () => {
    expect(() =>
      compareNative(
        baseline.map((e) => withInput(e, 0)),
        calibration.map((e) => withInput(e, 0)),
        candidate.map((e) => withInput(e, 2)),
      ),
    ).toThrow()
  })
  it("When calibration reaches the exact hybrid boundary Then it passes; just above returns inconclusive", () => {
    expect(measureNativeCalibration(baseline, run("calibration", 1.1)).status).toBe("calibrated")
    expect(measureNativeCalibration(baseline, run("calibration", 1.10001)).status).toBe(
      "inconclusive",
    )
    expect(compareNative(baseline, run("calibration", 1.10001), candidate).status).toBe(
      "inconclusive",
    )
  })
  it("When a nonprimary close cell is noisy Then it blocks readiness without inflating another cell's primary noise threshold", () => {
    const noisy = calibration.map((e) => (e.cell.operation === "close" ? scaleSample(e, 1.3) : e))
    const measured = measureNativeCalibration(baseline, noisy)
    expect(measured.status).toBe("inconclusive")
    expect(measured.inconclusiveCells.length).toBeGreaterThan(0)
    expect(measured.primaryNoise).toBe(0)
    const result = compareNative(baseline, noisy, candidate)
    expect(result.status).toBe("inconclusive")
    expect(result.threshold).toBe(0.2)
  })
  it("When seed difficulty varies but matched controls agree Then seed variance is not called noise", () => {
    const seedScale = (e: Envelope) => 2 ** trainingSeeds.indexOf(e.cell.seed)
    const base = baseline.map((e) => scaleSample(e, seedScale(e))),
      cal = calibration.map((e) => scaleSample(e, seedScale(e))),
      next = candidate.map((e) => scaleSample(e, 0.75 * seedScale(e)))
    expect(measureNativeCalibration(base, cal).primaryNoise).toBe(0)
    expect(compareNative(base, cal, next).status).toBe("confirmation-required")
  })
  it("When only one primary cell is lucky Then the fixed multi-cell aggregate cannot select it", () => {
    const lucky = candidate.find((e) => primary(e.cell))
    if (!lucky) throw Error("fixture")
    const next = candidate.map((e) => scaleSample(e, sameCell(e.cell, lucky.cell) ? 0 : 1))
    expect(compareNative(baseline, calibration, next).status).toBe("no-win")
  })
  it("When gains are no larger than the materiality floor Then near-zero ratios cannot manufacture an aggregate win", () => {
    const base = run("baseline", 0.05),
      cal = run("calibration", 0.05),
      next = run("candidate", 0.011)
    const result = compareNative(base, cal, next)
    expect(result.aggregateGain).toBe(0)
    expect(result.status).toBe("no-win")
  })
  it("When many within-band slowdowns oppose positive gains Then they must penalize the geometric mean", () => {
    const next = candidate.map((e) => scaleSample(e, e.cell.seed === 558301 ? 0.5 : 1.1))
    const result = compareNative(baseline, calibration, next)
    expect(result.aggregateGain).toBeCloseTo(1 - Math.cbrt(0.5 * 1.1 * 1.1))
    expect(result.status).toBe("no-win")
  })
  it("When aggregate gain equals20 percent Then confirmation is not requested", () => {
    expect(compareNative(baseline, calibration, run("candidate", 0.8)).status).toBe("no-win")
  })
  it("When candidate median delta equals the frozen band Then it is accepted descriptively; above it rejects even if calibration is noisy", () => {
    expect(compareNative(baseline, calibration, run("candidate", 1.1)).status).toBe("no-win")
    expect(() =>
      compareNative(baseline, run("calibration", 1.2), run("candidate", 1.10001)),
    ).toThrow(/budget/)
  })
  it("When a descriptive p95 moves inside the catastrophic band Then it is not a10-percent veto", () => {
    const next = candidate.map((e) => (e.index === 9 ? withRender(e, 150) : e))
    expect(compareNative(baseline, calibration, next).status).toBe("confirmation-required")
    expect(() =>
      compareNative(
        baseline,
        calibration,
        candidate.map((e) => (e.index === 9 ? withRender(e, 150.0001) : e)),
      ),
    ).toThrow(/catastrophic/)
  })
  it("When candidate advertises a coarse timer Then it cannot widen baseline/control-frozen budgets", () => {
    const next = candidate.map((e) => ({
      ...withInput(e, 12),
      packet: { ...withInput(e, 12).packet, timerQuantumMs: 1000 },
    }))
    expect(() => compareNative(baseline, calibration, next)).toThrow(/budget/)
  })
  it("When a candidate timer is coarser without other violations Then compatible precision is inconclusive", () => {
    const next = candidate.map((e) => ({ ...e, packet: { ...e.packet, timerQuantumMs: 0.02 } }))
    expect(compareNative(baseline, calibration, next).status).toBe("inconclusive")
    const finer = candidate.map((e) => ({ ...e, packet: { ...e.packet, timerQuantumMs: 0.001 } }))
    expect(compareNative(baseline, calibration, finer).status).toBe("confirmation-required")
  })
  it("When paired primary noise is positive in both directions Then it cannot cancel or collapse through clean cells", () => {
    const cal = calibration.map((e) =>
      scaleSample(e, e.cell.seed === 558301 ? 1.05 : e.cell.seed === 558302 ? 0.95 : 1),
    )
    const expected = Math.expm1((Math.log1p(0.05) + Math.log1p(0.05)) / 3)
    expect(measureNativeCalibration(baseline, cal).primaryNoise).toBeCloseTo(expected)
  })
})
