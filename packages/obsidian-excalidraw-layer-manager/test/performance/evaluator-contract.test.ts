import { describe, expect, it } from "vitest"
// @ts-expect-error -- Pure .mjs contract is tested at runtime; no TS declaration surface.
import * as evaluator from "../../scripts/performance/evaluator-contract.mjs"

const {
  aggregateCell,
  assertExact,
  CONTRACT,
  compareCandidate,
  integrityHash,
  validateManifest,
  validateSample,
} = evaluator

// Synthetic Node evidence only: native:true is deliberately a label, not native proof.
const hash = (digit: string) => digit.repeat(64)
const ids = [
  "scene-exact",
  "rows-exact",
  "selection-exact",
  "runtime-fresh",
  "staging-preserved",
] as const
const manifest = () => ({
  contractHash: integrityHash(CONTRACT),
  evaluatorHash: hash("a"),
  runnerHash: hash("b"),
  fixtureHash: hash("c"),
  checks: [...ids],
})
function at<T>(entries: T[], index: number): T {
  const value = entries[index]
  if (value === undefined) throw new Error("missing synthetic fixture entry")
  return value
}
type Check = { id: string; before: unknown; actual: unknown; expected: unknown }
const check = (id: string, before: unknown, expected: unknown): Check => ({
  id,
  before,
  actual: structuredClone(expected),
  expected,
})
function sample(role = "baseline", value = 100, processPass = "p0", index = 0) {
  return {
    native: true,
    role,
    sourceHash: hash(role === "candidate" ? "2" : "1"),
    cell: { seed: 558301, size: 1000, shape: "ungrouped", operation: "rename" },
    processPass,
    index,
    checks: [
      check(ids[0], [{ id: "a", name: "old" }], [{ id: "a", name: "new" }]),
      check(ids[1], [{ id: "a", name: "old" }], [{ id: "a", name: "new" }]),
      check(ids[2], ["a"], ["a"]),
      check(ids[3], 1, 2),
      check(ids[4], { staged: ["a"] }, { staged: ["a"] }),
    ],
    counts: { scene: 1, rows: 1, selection: 1 },
    timing: {
      inputSync: value / 4,
      settlement: value / 2,
      renderOpportunity: value,
      renderOpportunities: [value * 0.75, value],
    },
  }
}
type Sample = ReturnType<typeof sample>
function cellSamples(role = "baseline", value = 100) {
  return Array.from({ length: 3 }, (_, pass) =>
    Array.from({ length: 10 }, (_, index) =>
      sample(role, index < 2 ? 9999 : value, `p${pass}`, index),
    ),
  ).flat()
}
function run(role = "baseline", value = 100) {
  const cells: Sample[][] = []
  for (const seed of [...CONTRACT.seeds, ...CONTRACT.holdoutSeeds]) {
    for (const size of CONTRACT.sizes) {
      for (const shape of CONTRACT.shapes) {
        const samples = cellSamples(role, value)
        for (const entry of samples) entry.cell = { seed, size, shape, operation: "rename" }
        cells.push(samples)
      }
    }
  }
  return {
    sourceHash: hash(role === "candidate" ? "2" : "1"),
    manifest: manifest(),
    operations: ["rename"],
    cells,
  }
}

describe("frozen evaluator contract — synthetic Node unit evidence, NOT native proof", () => {
  it("Given contract seeds and rules, When inspected, Then nested surfaces are frozen", () => {
    expect(CONTRACT.seeds).toEqual([558301, 558302, 558303])
    expect(CONTRACT.holdoutSeeds).toEqual([958301, 958302])
    expect(CONTRACT.sizes).toEqual([1000, 10000, 50000, 100000])
    expect(CONTRACT.shapes).toEqual(["ungrouped", "pairs", "ten", "giant", "nested8", "skewed"])
    expect(Object.isFrozen(CONTRACT)).toBe(true)
    expect(Object.isFrozen(CONTRACT.rules)).toBe(true)
    expect(() => CONTRACT.seeds.push(1)).toThrow()
  })
  it("Given JSON objects, When compared or hashed, Then key order is immaterial but arrays are ordered", () => {
    expect(() => assertExact({ b: [2, 1], a: null }, { a: null, b: [2, 1] }, "scene")).not.toThrow()
    expect(integrityHash({ a: 1, b: 2 })).toBe(integrityHash({ b: 2, a: 1 }))
    expect(integrityHash({ a: 1 })).toMatch(/^[a-f0-9]{64}$/)
    expect(() => assertExact([1, 2], [2, 1], "rows-exact")).toThrow(/rows-exact/)
    expect(() => assertExact({ a: 1 }, { a: 1, b: 2 }, "extra")).toThrow(/extra/)
  })
  it.each([undefined, NaN, Infinity, new Date(), new Map(), 1n, () => 1, [undefined], Array(1)])(
    "Given non-JSON value %s, When hashed, Then reject rather than normalize away evidence",
    (value) => {
      expect(() => integrityHash(value)).toThrow()
    },
  )
  it("Given cyclic or hidden properties, When hashed, Then reject ambiguity", () => {
    const cyclic: Record<string, unknown> = {}
    cyclic["self"] = cyclic
    expect(() => integrityHash(cyclic)).toThrow()
    expect(() => integrityHash({ [Symbol("hidden")]: 1 })).toThrow()
    expect(() => integrityHash(Object.defineProperty({}, "hidden", { value: 1 }))).toThrow()
    expect(() =>
      integrityHash(Object.defineProperty({}, "getter", { enumerable: true, get: () => 1 })),
    ).toThrow()
  })
  it("Given trusted frozen pins, When a manifest bypasses checks or changes code, Then reject", () => {
    expect(validateManifest(manifest(), manifest())).toEqual(manifest())
    for (const field of ["evaluatorHash", "runnerHash", "fixtureHash", "contractHash"] as const) {
      expect(() => validateManifest({ ...manifest(), [field]: hash("d") }, manifest())).toThrow()
    }
    expect(() => validateManifest({ ...manifest(), checks: ids.slice(1) }, manifest())).toThrow()
    expect(() => validateManifest(manifest())).toThrow()
  })
  it("Given a complete semantically changed sample, When validated, Then retain it without mutation", () => {
    const entry = sample()
    const before = structuredClone(entry)
    expect(validateSample(entry)).toEqual(before)
    expect(entry).toEqual(before)
  })
  const invalid: [string, (entry: Sample) => void][] = [
    [
      "non-native",
      (s) => {
        s.native = false
      },
    ],
    [
      "unknown role",
      (s) => {
        s.role = "proxy"
      },
    ],
    [
      "bad hash",
      (s) => {
        s.sourceHash = "abc"
      },
    ],
    [
      "unknown seed",
      (s) => {
        s.cell.seed = 1
      },
    ],
    [
      "unknown shape",
      (s) => {
        s.cell.shape = "flat"
      },
    ],
    [
      "unknown size",
      (s) => {
        s.cell.size = 1
      },
    ],
    [
      "empty operation",
      (s) => {
        s.cell.operation = ""
      },
    ],
    [
      "empty process pass",
      (s) => {
        s.processPass = ""
      },
    ],
    [
      "bad index",
      (s) => {
        s.index = 10
      },
    ],
    [
      "missing check",
      (s) => {
        s.checks.pop()
      },
    ],
    [
      "duplicate check",
      (s) => {
        s.checks[1] = at(s.checks, 0)
      },
    ],
    [
      "dropped row",
      (s) => {
        at(s.checks, 1).actual = []
        s.counts.rows = 0
      },
    ],
    [
      "wrong selection",
      (s) => {
        at(s.checks, 2).actual = []
      },
    ],
    [
      "stale cache",
      (s) => {
        at(s.checks, 3).actual = 1
      },
    ],
    [
      "self-consistent stale cache",
      (s) => {
        at(s.checks, 3).actual = 1
        at(s.checks, 3).expected = 1
      },
    ],
    [
      "lost staging",
      (s) => {
        at(s.checks, 4).actual = {}
      },
    ],
    [
      "changed expected staging",
      (s) => {
        at(s.checks, 4).actual = {}
        at(s.checks, 4).expected = {}
      },
    ],
    [
      "no-op",
      (s) => {
        for (const c of s.checks.slice(0, 3)) c.actual = c.expected = c.before
      },
    ],
    [
      "counts mismatch",
      (s) => {
        s.counts.rows = 2
      },
    ],
    [
      "fractional count",
      (s) => {
        s.counts.scene = 1.5
      },
    ],
    [
      "negative duration",
      (s) => {
        s.timing.inputSync = -1
      },
    ],
    [
      "infinite duration",
      (s) => {
        s.timing.renderOpportunity = Infinity
      },
    ],
    [
      "NaN duration",
      (s) => {
        s.timing.settlement = NaN
      },
    ],
    [
      "settlement before sync",
      (s) => {
        s.timing.settlement = 1
      },
    ],
    [
      "render before settlement",
      (s) => {
        s.timing.renderOpportunities = [1, 100]
      },
    ],
    [
      "one opportunity",
      (s) => {
        s.timing.renderOpportunities = [100]
      },
    ],
    [
      "unordered opportunities",
      (s) => {
        s.timing.renderOpportunities = [100, 75]
      },
    ],
    [
      "wrong final opportunity",
      (s) => {
        s.timing.renderOpportunity = 101
      },
    ],
  ]
  it.each(invalid)("Given %s evidence, When validated, Then fail closed", (_name, mutate) => {
    const entry = sample()
    mutate(entry)
    expect(() => validateSample(entry)).toThrow()
  })
  it("Given unknown schema keys or duplicate identities, When validated, Then reject", () => {
    expect(() => validateSample({ ...sample(), bypass: true })).toThrow()
    const entry = sample()
    at(entry.checks, 1).actual = at(entry.checks, 1).expected = [{ id: "a" }, { id: "a" }]
    entry.counts.rows = 2
    expect(() => validateSample(entry)).toThrow()
    entry.checks = sample().checks
    at(entry.checks, 2).actual = at(entry.checks, 2).expected = ["a", "a"]
    entry.counts.selection = 2
    expect(() => validateSample(entry)).toThrow()
  })
  it("Given hidden or missing nested schema keys, When validated, Then reject", () => {
    for (const field of Object.keys(sample())) {
      const entry = { ...sample() } as Record<string, unknown>
      delete entry[field]
      expect(() => validateSample(entry)).toThrow()
    }
    for (const field of ["cell", "counts", "timing"] as const) {
      const entry = sample()
      Object.defineProperty(entry[field], "bypass", { value: true })
      expect(() => validateSample(entry)).toThrow()
    }
    const entry = sample()
    Object.assign(at(entry.checks, 0), { passed: true })
    expect(() => validateSample(entry)).toThrow()
  })
  it("Given no-op actual state against a changed oracle, When validated, Then reject", () => {
    const entry = sample()
    for (const evidence of entry.checks.slice(0, 3)) evidence.actual = evidence.before
    expect(() => validateSample(entry)).toThrow(/scene-exact/)
  })
  it("Given extended or subclass arrays, When hashed, Then reject alternate serialization", () => {
    class AlteredArray extends Array {}
    expect(() => integrityHash(new AlteredArray())).toThrow()
    expect(() => integrityHash(Object.assign([1], { hidden: 2 }))).toThrow()
  })
  it("Given one process relabeled as 30 samples, When aggregated, Then reject", () => {
    const samples = cellSamples()
    for (const entry of samples) entry.processPass = "one-process"
    expect(() => aggregateCell(samples)).toThrow(/three distinct/)
  })
  it("Given zero offsets with two opportunities, When validated, Then finite nonnegative equality is legal", () => {
    expect(() => validateSample(sample("baseline", 0))).not.toThrow()
  })
  it("Given 3 passes of 10, When aggregated, Then retain 6 warmups and compute 24-point median/nearest-rank p95", () => {
    const samples = cellSamples()
    let value = 0
    for (const s of samples) if (s.index >= 2) s.timing = sample("baseline", ++value).timing
    const result = aggregateCell(samples)
    expect(result.warmups).toHaveLength(6)
    expect(result.retained).toHaveLength(24)
    expect(result.metrics.renderOpportunity).toEqual({ median: 12.5, p95: 23 })
    expect(result.passes).toHaveLength(3)
    expect(
      result.passes.map(
        (p: { metrics: { renderOpportunity: { median: number } } }) =>
          p.metrics.renderOpportunity.median,
      ),
    ).toEqual([4.5, 12.5, 20.5])
    expect(result.tailLabel).toBe(
      "nearest-rank p95 of retained campaign samples; not production tail",
    )
    expect(aggregateCell([...samples].reverse()).metrics).toEqual(result.metrics)
  })
  it.each([
    "missing",
    "extra",
    "duplicate",
    "mixed-cell",
    "mixed-role",
    "mixed-source",
    "bad-warmup",
  ])("Given %s samples, When aggregated, Then reject", (kind) => {
    const samples = cellSamples()
    if (kind === "missing") samples.pop()
    if (kind === "extra") samples.push(sample())
    if (kind === "duplicate") samples[1] = at(samples, 0)
    if (kind === "mixed-cell") at(samples, 0).cell.operation = "collapse"
    if (kind === "mixed-role") at(samples, 0).role = "calibration"
    if (kind === "mixed-source") at(samples, 0).sourceHash = hash("9")
    if (kind === "bad-warmup") at(samples, 0).native = false
    expect(() => aggregateCell(samples)).toThrow()
  })
  it("Given a complete stable campaign, When >20% faster, Then win with diagnostic cell results", () => {
    const result = compareCandidate(run(), run("calibration"), run("candidate", 79))
    expect(result.status).toBe("win")
    expect(result.cells).toHaveLength(120)
    expect(result.noise).toBe(0)
    expect(result.threshold).toBe(0.2)
  })
  it.each([100, 80, 90])(
    "Given candidate time %s, When improvement is <=20%, Then no win",
    (value) => {
      expect(compareCandidate(run(), run("calibration"), run("candidate", value)).status).toBe(
        "no-win",
      )
    },
  )
  it("Given an unchanged source hash, When reported much faster, Then refuse improvement", () => {
    const candidate = run("candidate", 50)
    candidate.sourceHash = hash("1")
    for (const cell of candidate.cells) for (const s of cell) s.sourceHash = hash("1")
    expect(() => compareCandidate(run(), run("calibration"), candidate)).toThrow(/unchanged/)
  })
  it.each([
    "missing-cell",
    "duplicate-cell",
    "missing-holdout",
    "missing-size",
    "missing-operation",
    "bad-manifest",
    "bad-source",
    "bad-role",
    "unstable-calibration",
    "regression",
  ])("Given %s campaign, When compared, Then fail closed", (kind) => {
    const baseline = run()
    const calibration = run("calibration")
    const candidate = run("candidate", 75)
    if (kind === "missing-cell") candidate.cells.pop()
    if (kind === "duplicate-cell") candidate.cells[1] = at(candidate.cells, 0)
    if (kind === "missing-holdout")
      for (const r of [baseline, calibration, candidate])
        r.cells = r.cells.filter((c) => at(c, 0).cell.seed < 900000)
    if (kind === "missing-size")
      for (const r of [baseline, calibration, candidate])
        r.cells = r.cells.filter((c) => at(c, 0).cell.size !== 100000)
    if (kind === "missing-operation") candidate.operations = []
    if (kind === "bad-manifest") candidate.manifest.checks.pop()
    if (kind === "bad-source") calibration.sourceHash = hash("9")
    if (kind === "bad-role") at(at(candidate.cells, 0), 0).role = "baseline"
    if (kind === "unstable-calibration")
      for (const s of at(calibration.cells, 0)) s.timing = sample("calibration", 111).timing
    if (kind === "regression")
      for (const s of at(candidate.cells, 0)) s.timing = sample("candidate", 111).timing
    expect(() => compareCandidate(baseline, calibration, candidate)).toThrow()
  })
  it("Given exactly 10% noise or regression, When compared, Then boundaries are inclusive", () => {
    const candidate = run("candidate", 75)
    for (const s of at(candidate.cells, 0)) s.timing = sample("candidate", 110).timing
    const result = compareCandidate(run(), run("calibration", 110), candidate)
    expect(result.status).toBe("win")
    expect(result.noise).toBeCloseTo(0.1)
  })
  it("Given pass drift or a tail-only regression, When compared, Then reject despite a good pooled median", () => {
    const calibration = run("calibration")
    for (const s of at(calibration.cells, 0))
      if (s.processPass === "p2") s.timing = sample("calibration", 115).timing
    expect(() => compareCandidate(run(), calibration, run("candidate", 70))).toThrow(/calibration/)
    const candidate = run("candidate", 70)
    for (const s of at(candidate.cells, 0))
      if (s.index === 9) s.timing = sample("candidate", 120).timing
    expect(() => compareCandidate(run(), run("calibration"), candidate)).toThrow(/regression/)
  })
  it("Given zero baseline time, When candidate is zero or positive, Then avoid division-by-zero wins", () => {
    expect(
      compareCandidate(run("baseline", 0), run("calibration", 0), run("candidate", 0)).status,
    ).toBe("no-win")
    expect(() =>
      compareCandidate(run("baseline", 0), run("calibration", 0), run("candidate", 1)),
    ).toThrow(/regression/)
  })
  it("Given input-sync-only regression, When total render improves, Then still reject", () => {
    const candidate = run("candidate", 75)
    for (const entry of at(candidate.cells, 0)) entry.timing.inputSync = 28
    expect(() => compareCandidate(run(), run("calibration"), candidate)).toThrow(/inputSync/)
  })
  it("Given barely above 10% noise, When compared, Then fail without boundary epsilon", () => {
    expect(() =>
      compareCandidate(run(), run("calibration", 110.000001), run("candidate", 70)),
    ).toThrow(/calibration/)
  })
  it("Given unchanged timing but changed source, When calibrated, Then no improvement", () => {
    const result = compareCandidate(run(), run("calibration", 95), run("candidate"))
    expect(result.status).toBe("no-win")
    expect(result.noise).toBeCloseTo(0.05)
    expect(result.threshold).toBe(0.2)
  })
})
