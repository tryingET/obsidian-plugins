/**
 * Independent evaluator: no application imports/native execution. Rejects throw Error; no mutation.
 * JSON means finite numbers, plain enumerable data objects, dense arrays, no cycles.
 * assertExact(actual,expected,label): deep JSON equality; unordered keys, ordered arrays.
 * integrityHash(value): lowercase SHA-256 of canonical JSON, NOT raw bytes (strings include quotes).
 * Exact schemas: typedefs below; no extra or missing keys.
 * validateSample(sample) -> sample: native must be true; role baseline/calibration/
 * candidate; hashes lowercase hex64; nonempty operation/processPass; index integer 0..9.
 * Cell labels must be from CONTRACT; counts equal actual lengths; each mandatory check once.
 * scene-exact / rows-exact: ordered arrays of JSON objects with unique nonempty id.
 * selection-exact: ordered unique nonempty string IDs. All before/actual/expected obey these types.
 * Actual must exactly match independently produced expected.
 * At least one of scene/rows/selection must differ from before (reject no-op work).
 * runtime-fresh: safe integer revision, actual == expected > before >= 0.
 * staging-preserved: arbitrary JSON, before == actual == expected.
 * Timings: milliseconds FROM THE SAME INPUT START, not phase lengths;
 * 0 <= inputSync <= settlement <= ordered opportunities (2+); renderOpportunity equals last.
 * Size is the input workload label, not necessarily the post-operation scene count.
 * aggregateCell -> {cell,role,sourceHash,warmups,retained,passes,metrics,tailLabel}.
 * Three passes, indices 0..9 each; validate/exclude 0,1: six warmups and 24 retained.
 * metrics: each timing metric -> {median,p95}; passes: [{processPass,metrics}].
 * Median averages the middle pair; p95 is sorted[ceil(.95*n)-1], NOT production tail.
 *
 * validateManifest(actual, trustedExpected) -> actual: exact content pins required;
 * contractHash == integrityHash(CONTRACT); checks == ordered mandatoryChecks.
 * Parent pins evaluator/runner/fixture contents, never candidate-supplied filenames.
 *
 * compareCandidate(baseline,calibration,candidate) -> {status:'win'|'no-win',noise,
 * threshold,cells:[{cell,noise,gains,primaryGain}]} or throws on rejection.
 * Parent must authenticate the TRUSTED baseline. All runs require its exact manifest
 * and unique nonempty operation set, with EVERY Cartesian
 * cell of (seeds + holdoutSeeds) x sizes x shapes x operations, exactly once.
 * Samples are revalidated/reaggregated; supplied summaries are not accepted.
 * Calibration source must equal baseline; candidate source MUST differ.
 * Noise = max absolute relative pooled baseline/calibration difference and within-run
 * pass deviation, both runs/all cells/metrics, median AND p95. >10% fails closed.
 * Any candidate median OR p95 regression >10% in ANY cell/metric rejects the run.
 * Win requires at least one cell's renderOpportunity MEDIAN improvement STRICTLY
 * > max(20%, 2*global noise); all other cells still undergo regression checks.
 * Equal zero times give zero change; any increase from zero fails closed.
 *
 * Trust limit: native execution/processes, independent oracles, opportunities and workload/source
 * labels require runner proof. Hashes detect changed pins, not dishonest self-reported execution.
 */
import { createHash } from "node:crypto"

/**
 * @typedef {{seed:number, size:number, shape:string, operation:string}} Cell
 * @typedef {{id:string, before:unknown, actual:unknown, expected:unknown}} Evidence
 * @typedef {{inputSync:number, settlement:number, renderOpportunity:number,
 * renderOpportunities:number[]}} Timing
 * @typedef {{native:boolean, role:string, sourceHash:string, cell:Cell,
 * processPass:string, index:number, checks:Evidence[], counts:Record<string,number>,
 * timing:Timing}} Sample
 * @typedef {{contractHash:string, evaluatorHash:string, runnerHash:string,
 * fixtureHash:string, checks:string[]}} Manifest
 * @typedef {{sourceHash:string, manifest:Manifest, operations:string[], cells:Sample[][]}} Run
 * @typedef {Record<string, {median:number, p95:number}>} Metrics
 * @typedef {ReturnType<typeof aggregateCell>} Summary
 */
/** @template T @param {T} value @returns {T} */
function freeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}

export const CONTRACT = freeze({
  version: 1,
  seeds: [558301, 558302, 558303],
  holdoutSeeds: [958301, 958302],
  sizes: [1000, 10000, 50000, 100000],
  shapes: ["ungrouped", "pairs", "ten", "giant", "nested8", "skewed"],
  mandatoryChecks: [
    "scene-exact",
    "rows-exact",
    "selection-exact",
    "runtime-fresh",
    "staging-preserved",
  ],
  rules: {
    processPasses: 3,
    samplesPerPass: 10,
    warmupsPerPass: 2,
    renderOpportunities: 2,
    maxRegression: 0.1,
    calibrationNoiseLimit: 0.1,
    minImprovement: 0.2,
    noiseMultiplier: 2,
    primaryMetric: "renderOpportunity",
    metrics: /** @type {const} */ (["inputSync", "settlement", "renderOpportunity"]),
    median: "middle value or mean of middle pair",
    p95: "nearest-rank p95 of retained campaign samples; not production tail",
    noise: "max pooled calibration difference and within-run pass deviation; median and p95",
    win: "any cell primary median strictly above threshold; all cells regression-gated",
    completeCartesian: true,
  },
})
/** @param {unknown} condition @param {string} label @returns {asserts condition} */
function requireThat(condition, label) {
  if (!condition) throw new Error(label)
}
/** @param {unknown} value @param {Set<object>} ancestors @returns {string} */
function canonical(value, ancestors = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value)
  if (typeof value === "number") {
    requireThat(Number.isFinite(value), "non-finite JSON number")
    return JSON.stringify(value)
  }
  requireThat(value && typeof value === "object", "non-JSON value")
  requireThat(!ancestors.has(value), "cyclic JSON value")
  const array = Array.isArray(value)
  const proto = Object.getPrototypeOf(value)
  requireThat(
    array ? proto === Array.prototype : proto === Object.prototype || proto === null,
    "non-plain JSON object",
  )
  const keys = Reflect.ownKeys(value).filter((key) => !(array && key === "length"))
  requireThat(
    keys.every((key) => typeof key === "string"),
    "symbol JSON key",
  )
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    requireThat(descriptor?.enumerable && "value" in descriptor, "hidden/accessor JSON property")
  }
  if (array)
    requireThat(
      keys.length === value.length && keys.every((key, i) => key === String(i)),
      "sparse/extended JSON array",
    )
  ancestors.add(value)
  const result = array
    ? `[${value.map((item) => canonical(item, ancestors)).join(",")}]`
    : `{${keys
        .sort()
        .map(
          (key) =>
            `${JSON.stringify(key)}:${canonical(/** @type {Record<string, unknown>} */ (value)[key], ancestors)}`,
        )
        .join(",")}}`
  ancestors.delete(value)
  return result
}
/** @param {unknown} actual @param {unknown} expected @param {string} label */
export function assertExact(actual, expected, label = "exact") {
  try {
    requireThat(canonical(actual) === canonical(expected), "JSON mismatch")
  } catch (error) {
    throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`)
  }
}
/** @param {unknown} value */
export function integrityHash(value) {
  return createHash("sha256").update(canonical(value)).digest("hex")
}
/** @param {unknown} value @param {string[]} expected @param {string} label */
function keys(value, expected, label) {
  requireThat(
    value !== null && typeof value === "object" && !Array.isArray(value),
    `${label}: expected object`,
  )
  const descriptors = Object.getOwnPropertyDescriptors(value)
  requireThat(Reflect.ownKeys(value).length === expected.length, `${label}: extra/hidden keys`)
  requireThat(
    Object.values(descriptors).every((d) => d.enumerable && "value" in d),
    `${label}: data keys required`,
  )
  assertExact(Object.keys(value).sort(), [...expected].sort(), `${label}: schema keys`)
}
/** @param {unknown} value @param {string} label @returns {asserts value is string} */
function text(value, label) {
  requireThat(
    typeof value === "string" && value.trim().length > 0,
    `${label}: expected nonempty string`,
  )
}
/** @param {unknown} value @param {string} label @returns {asserts value is number} */
function integer(value, label) {
  requireThat(
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0,
    `${label}: expected nonnegative safe integer`,
  )
}
/** @param {unknown} value @param {string} label @returns {asserts value is number} */
function duration(value, label) {
  requireThat(
    typeof value === "number" && Number.isFinite(value) && value >= 0,
    `${label}: expected finite nonnegative milliseconds`,
  )
}
/** @param {unknown} value @param {string} label */
function hash(value, label) {
  requireThat(
    typeof value === "string" && /^[a-f0-9]{64}$/.test(value),
    `${label}: expected lowercase SHA-256`,
  )
}
/** @param {Cell} cell */
function cellKey(cell) {
  return canonical(cell)
}
/** @param {Cell} cell */
function validateCell(cell) {
  keys(cell, ["seed", "size", "shape", "operation"], "cell")
  requireThat(
    [...CONTRACT.seeds, ...CONTRACT.holdoutSeeds].includes(cell.seed),
    "cell: unknown seed",
  )
  requireThat(CONTRACT.sizes.includes(cell.size), "cell: unknown size")
  requireThat(CONTRACT.shapes.includes(cell.shape), "cell: unknown shape")
  text(cell.operation, "cell.operation")
}
/** @param {unknown} value @param {boolean} objects @param {string} label */
function identities(value, objects, label) {
  requireThat(Array.isArray(value), `${label}: expected array`)
  const ids = value.map((entry) => {
    if (objects)
      requireThat(
        entry !== null && typeof entry === "object" && !Array.isArray(entry),
        `${label}: expected object`,
      )
    const id = objects ? entry.id : entry
    text(id, label)
    return id
  })
  requireThat(new Set(ids).size === ids.length, `${label}: duplicate identity`)
}
/** @param {Sample} sample */
export function validateSample(sample) {
  canonical(sample) // Reject hidden properties, undefined, exotic objects and nonfinite numbers.
  keys(
    sample,
    ["native", "role", "sourceHash", "cell", "processPass", "index", "checks", "counts", "timing"],
    "sample",
  )
  requireThat(sample.native === true, "sample: native evidence required")
  requireThat(
    ["baseline", "calibration", "candidate"].includes(sample.role),
    "sample: unknown role",
  )
  hash(sample.sourceHash, "sample.sourceHash")
  validateCell(sample.cell)
  text(sample.processPass, "sample.processPass")
  integer(sample.index, "sample.index")
  requireThat(sample.index < CONTRACT.rules.samplesPerPass, "sample.index: out of range")
  requireThat(Array.isArray(sample.checks), "checks: expected array")
  assertExact(
    sample.checks.map((check) => check?.id).sort(),
    [...CONTRACT.mandatoryChecks].sort(),
    "mandatory checks",
  )
  const byId = /** @type {Record<string, Evidence>} */ ({})
  for (const check of sample.checks) {
    keys(check, ["id", "before", "actual", "expected"], "check")
    assertExact(check.actual, check.expected, check.id)
    byId[check.id] = check
  }
  let changed = false
  for (const id of CONTRACT.mandatoryChecks.slice(0, 3)) {
    const check = byId[id]
    for (const field of /** @type {const} */ (["before", "actual", "expected"]))
      identities(check[field], id !== "selection-exact", `${id}.${field}`)
    changed ||= canonical(check.before) !== canonical(check.expected)
  }
  requireThat(changed, "no-op: scene, rows and selection all unchanged")
  const runtime = byId["runtime-fresh"]
  integer(runtime.before, "runtime-fresh.before")
  integer(runtime.actual, "runtime-fresh.actual")
  integer(runtime.expected, "runtime-fresh.expected")
  requireThat(runtime.actual > runtime.before, "runtime-fresh: stale revision")
  const staging = byId["staging-preserved"]
  assertExact(staging.actual, staging.before, "staging-preserved: changed staging")
  keys(sample.counts, ["scene", "rows", "selection"], "counts")
  for (const name of ["scene", "rows", "selection"]) {
    integer(sample.counts[name], `counts.${name}`)
    const actual = byId[`${name}-exact`].actual
    assertExact(sample.counts[name], Array.isArray(actual) ? actual.length : -1, `counts.${name}`)
  }
  const timing = sample.timing
  keys(timing, [...CONTRACT.rules.metrics, "renderOpportunities"], "timing")
  for (const metric of CONTRACT.rules.metrics) duration(timing[metric], metric)
  requireThat(timing.settlement >= timing.inputSync, "settlement before input sync")
  requireThat(
    Array.isArray(timing.renderOpportunities) &&
      timing.renderOpportunities.length >= CONTRACT.rules.renderOpportunities,
    "need two render opportunities",
  )
  let previous = timing.settlement
  for (const opportunity of timing.renderOpportunities) {
    duration(opportunity, "render opportunity")
    requireThat(
      opportunity >= previous,
      "render opportunity before settlement/previous opportunity",
    )
    previous = opportunity
  }
  assertExact(timing.renderOpportunity, previous, "final render opportunity")
  return sample
}
/** @param {number[]} values */
function statistics(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const median =
    sorted.length % 2 ? sorted[mid] : sorted[mid - 1] + (sorted[mid] - sorted[mid - 1]) / 2
  return { median, p95: sorted[Math.ceil(sorted.length * 0.95) - 1] }
}
/** @param {Sample[]} samples @returns {Metrics} */
function metrics(samples) {
  return Object.fromEntries(
    CONTRACT.rules.metrics.map((metric) => [
      metric,
      statistics(samples.map((sample) => sample.timing[metric])),
    ]),
  )
}
/** @param {Sample[]} samples */
export function aggregateCell(samples) {
  requireThat(
    Array.isArray(samples) &&
      samples.length === CONTRACT.rules.processPasses * CONTRACT.rules.samplesPerPass,
    "cell: require 3 passes of 10 samples",
  )
  const groups = /** @type {Map<string, Sample[]>} */ (new Map())
  const first = samples[0]
  for (const sample of samples) {
    validateSample(sample)
    assertExact(
      [sample.cell, sample.role, sample.sourceHash],
      [first.cell, first.role, first.sourceHash],
      "mixed cell identity",
    )
    if (!groups.has(sample.processPass)) groups.set(sample.processPass, [])
    groups.get(sample.processPass)?.push(sample)
  }
  requireThat(
    groups.size === CONTRACT.rules.processPasses,
    "cell: require three distinct process passes",
  )
  const warmups = [],
    retained = [],
    passes = []
  for (const processPass of [...groups.keys()].sort()) {
    const entries = [...(groups.get(processPass) ?? [])].sort((a, b) => a.index - b.index)
    assertExact(
      entries.map((entry) => entry.index),
      Array.from({ length: CONTRACT.rules.samplesPerPass }, (_, i) => i),
      "pass indices",
    )
    warmups.push(...entries.slice(0, CONTRACT.rules.warmupsPerPass))
    const measured = entries.slice(CONTRACT.rules.warmupsPerPass)
    retained.push(...measured)
    passes.push({ processPass, metrics: metrics(measured) })
  }
  return {
    cell: first.cell,
    role: first.role,
    sourceHash: first.sourceHash,
    warmups,
    retained,
    passes,
    metrics: metrics(retained),
    tailLabel: CONTRACT.rules.p95,
  }
}
/** @param {Manifest} manifest */
function manifestShape(manifest) {
  canonical(manifest)
  keys(
    manifest,
    ["contractHash", "evaluatorHash", "runnerHash", "fixtureHash", "checks"],
    "manifest",
  )
  for (const field of /** @type {const} */ ([
    "contractHash",
    "evaluatorHash",
    "runnerHash",
    "fixtureHash",
  ]))
    hash(manifest[field], `manifest.${field}`)
  assertExact(manifest.contractHash, integrityHash(CONTRACT), "frozen contract hash")
  assertExact(manifest.checks, CONTRACT.mandatoryChecks, "frozen mandatory checks")
}
/** @param {Manifest} actual @param {Manifest} trustedExpected */
export function validateManifest(actual, trustedExpected) {
  manifestShape(trustedExpected)
  manifestShape(actual)
  assertExact(actual, trustedExpected, "manifest integrity")
  return actual
}
/** @param {Run} run @param {string} role @param {Manifest} trustedManifest @param {string[]} operations */
function validateRun(run, role, trustedManifest, operations) {
  keys(run, ["sourceHash", "manifest", "operations", "cells"], `${role} run`)
  hash(run.sourceHash, `${role} sourceHash`)
  validateManifest(run.manifest, trustedManifest)
  identities(run.operations, false, `${role} operations`)
  requireThat(run.operations.length > 0, "run: operations required")
  assertExact([...run.operations].sort(), [...operations].sort(), `${role} operation set`)
  requireThat(Array.isArray(run.cells), `${role}: cells required`)
  const expected = new Set()
  for (const seed of [...CONTRACT.seeds, ...CONTRACT.holdoutSeeds]) {
    for (const size of CONTRACT.sizes)
      for (const shape of CONTRACT.shapes) {
        for (const operation of operations) expected.add(cellKey({ seed, size, shape, operation }))
      }
  }
  requireThat(run.cells.length === expected.size, `${role}: incomplete cell matrix`)
  const cells = /** @type {Map<string, Summary>} */ (new Map())
  for (const samples of run.cells) {
    const summary = aggregateCell(samples)
    requireThat(
      summary.role === role && summary.sourceHash === run.sourceHash,
      `${role}: sample role/source mismatch`,
    )
    const key = cellKey(summary.cell)
    requireThat(expected.delete(key), `${role}: duplicate/unexpected cell`)
    cells.set(key, summary)
  }
  requireThat(expected.size === 0, `${role}: missing cells`)
  return cells
}

// Difference-first division makes exact 10% and 20% boundaries inclusive, avoiding
// the rounding artifact of (110/100 - 1). No epsilon permits above-boundary values.
/** @param {number} value @param {number} reference */
function relative(value, reference) {
  return reference === 0 ? (value === 0 ? 0 : Infinity) : (value - reference) / reference
}
/** @param {Summary} baseline @param {Summary} calibration */
function calibrationNoise(baseline, calibration) {
  let noise = 0
  for (const metric of CONTRACT.rules.metrics)
    for (const statistic of /** @type {const} */ (["median", "p95"])) {
      noise = Math.max(
        noise,
        Math.abs(
          relative(calibration.metrics[metric][statistic], baseline.metrics[metric][statistic]),
        ),
      )
      for (const run of [baseline, calibration])
        for (const pass of run.passes) {
          noise = Math.max(
            noise,
            Math.abs(relative(pass.metrics[metric][statistic], run.metrics[metric][statistic])),
          )
        }
    }
  return noise
}
/** @param {Run} baseline @param {Run} calibration @param {Run} candidate */
export function compareCandidate(baseline, calibration, candidate) {
  requireThat(baseline && calibration && candidate, "three runs required")
  identities(baseline.operations, false, "baseline operations")
  requireThat(
    calibration.sourceHash === baseline.sourceHash,
    "calibration must use unchanged baseline source",
  )
  requireThat(
    candidate.sourceHash !== baseline.sourceHash,
    "unchanged source cannot be an improvement",
  )
  const original = validateRun(baseline, "baseline", baseline.manifest, baseline.operations)
  const control = validateRun(calibration, "calibration", baseline.manifest, baseline.operations)
  const proposed = validateRun(candidate, "candidate", baseline.manifest, baseline.operations)
  let noise = 0
  const cells = []
  for (const [key, base] of original) {
    const cal = control.get(key),
      next = proposed.get(key)
    requireThat(cal && next, "missing comparison cell")
    const cellNoise = calibrationNoise(base, cal)
    requireThat(cellNoise <= CONTRACT.rules.calibrationNoiseLimit, `unstable calibration: ${key}`)
    noise = Math.max(noise, cellNoise)
    const gains = /** @type {Metrics} */ ({})
    for (const metric of CONTRACT.rules.metrics) {
      gains[metric] = { median: 0, p95: 0 }
      for (const statistic of /** @type {const} */ (["median", "p95"])) {
        const change = relative(next.metrics[metric][statistic], base.metrics[metric][statistic])
        requireThat(
          change <= CONTRACT.rules.maxRegression,
          `regression: ${key} ${metric}.${statistic}`,
        )
        gains[metric][statistic] = change === 0 ? 0 : -change
      }
    }
    cells.push({
      cell: base.cell,
      noise: cellNoise,
      gains,
      primaryGain: gains[CONTRACT.rules.primaryMetric].median,
    })
  }
  const threshold = Math.max(CONTRACT.rules.minImprovement, CONTRACT.rules.noiseMultiplier * noise)
  const status = cells.some((cell) => cell.primaryGain > threshold) ? "win" : "no-win"
  return { status, noise, threshold, cells }
}
