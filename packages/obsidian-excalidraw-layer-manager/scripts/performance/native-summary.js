// Native preregistration v2 accounting, not native execution/source authentication.
// Controller authenticates frozen source/script/lock bytes and fresh native host receipts.
import { CONTRACT } from "./evaluator-contract.mjs"
import { validateNativePacket } from "./native-packet.js"
import { NATIVE_POLICY as POLICY } from "./native-policy.js"

/** @typedef {'baseline'|'calibration'|'candidate'|'holdout'} Role */
/** @typedef {{size:number,shape:string,seed:number,operation:string}} Cell */
/** @typedef {{role:Role,sourceHash:string,scriptHash:string,lockHash:string,cell:Cell,processPass:string,index:number,hostNonce:string,packet:Record<string,any>}} Envelope */
/** @typedef {{median:number,p95:number}} Statistics */
/** @typedef {Record<string,Statistics>} Metrics */
const METRICS = CONTRACT.rules.metrics
const HOLDOUT_GATE = POLICY.holdoutRequirement
const AGGREGATE_LABEL =
  "floor-adjusted matched geometric-mean ratio; fixed equal-weight primary cells"

/** @param {unknown} value @param {string} label @returns {asserts value} */
function requireThat(value, label) {
  if (!value) throw Error(label)
}
/** @param {unknown} value @param {string} label */
function hash(value, label) {
  requireThat(
    typeof value === "string" && /^[a-f0-9]{64}$/.test(value),
    `${label}: expected lowercase SHA-256`,
  )
}
/** @param {unknown} value @param {string} label */
function text(value, label) {
  requireThat(
    typeof value === "string" && value.trim().length > 0,
    `${label}: nonempty text required`,
  )
}
/** @param {object} value @param {string[]} names @param {string} label */
function keys(value, names, label) {
  requireThat(
    value !== null && typeof value === "object" && !Array.isArray(value),
    `${label}: object required`,
  )
  requireThat(
    Object.keys(value).sort().join("|") === [...names].sort().join("|"),
    `${label}: schema keys`,
  )
}
/** @param {string} shape */
export function operationsForShape(shape) {
  requireThat(POLICY.shapes.includes(shape), "unknown native shape")
  return [
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
}
/** @param {Cell} cell */
function workloadKey(cell) {
  return `${cell.seed}/${cell.size}/${cell.shape}`
}
/** @param {Cell} cell */
function cellKey(cell) {
  return `${workloadKey(cell)}/${cell.operation}`
}
/** @param {Cell} cell */
function primary(cell) {
  return (
    POLICY.primarySizes.includes(cell.size) && POLICY.primaryOperations.includes(cell.operation)
  )
}
/** @param {number[]} seeds */
function requiredCells(seeds) {
  /** @type {Map<string,Cell>} */
  const cells = new Map()
  for (const seed of seeds)
    for (const size of POLICY.sizes)
      for (const shape of POLICY.shapes) {
        for (const operation of operationsForShape(shape)) {
          const cell = { seed, size, shape, operation }
          cells.set(cellKey(cell), cell)
        }
      }
  return cells
}
/** @param {Envelope} e @param {Role} role @param {number[]} seeds @param {number} samples */
function validate(e, role, seeds, samples) {
  keys(
    e,
    [
      "role",
      "sourceHash",
      "scriptHash",
      "lockHash",
      "cell",
      "processPass",
      "index",
      "hostNonce",
      "packet",
    ],
    "envelope",
  )
  requireThat(e.role === role, "envelope role mismatch")
  for (const field of /** @type {const} */ (["sourceHash", "scriptHash", "lockHash"]))
    hash(e[field], field)
  text(e.processPass, "processPass")
  text(e.hostNonce, "hostNonce")
  keys(e.cell, ["size", "shape", "seed", "operation"], "cell")
  requireThat(
    seeds.includes(e.cell.seed) && POLICY.sizes.includes(e.cell.size),
    "unknown native seed/size",
  )
  requireThat(
    operationsForShape(e.cell.shape).includes(e.cell.operation),
    "inapplicable native operation",
  )
  requireThat(
    Number.isSafeInteger(e.index) && e.index >= 0 && e.index < samples,
    "sample index out of range",
  )
  const p = validateNativePacket(e.packet)
  requireThat(
    p.operation === e.cell.operation && p.index === e.index,
    "packet operation/index mismatch",
  )
  requireThat(p.counts.scene === e.cell.size, "scene count mismatch")
  requireThat(
    Number.isFinite(p.timerQuantumMs) && p.timerQuantumMs > 0,
    "positive finite timer quantum required",
  )
  requireThat(p.inputPhase === POLICY.inputPhase, "input phase mismatch")
}
/** @param {number[]} values @returns {Statistics} */
function statistics(values) {
  const sorted = [...values].sort((a, b) => a - b),
    mid = Math.floor(sorted.length / 2)
  return {
    median: sorted.length % 2 ? sorted[mid] : sorted[mid - 1] / 2 + sorted[mid] / 2,
    p95: sorted[Math.ceil(0.95 * sorted.length) - 1],
  }
}
/** @param {Envelope[]} entries @returns {Metrics} */
function metrics(entries) {
  return Object.fromEntries(
    METRICS.map((m) => [m, statistics(entries.map((e) => e.packet.timing[m]))]),
  )
}

/** One process per role/seed/size/shape, shared by all that workload's operations.
 * @param {Envelope[]} envelopes @param {Role} role @param {boolean} holdout
 */
function summarize(envelopes, role, holdout = false) {
  const seeds = holdout ? POLICY.holdoutSeeds : POLICY.trainingSeeds
  const samples = holdout ? POLICY.semanticHoldoutSamples : POLICY.timingSamplesPerBlock
  const warmups = holdout ? 0 : POLICY.warmupsPerBlock
  const expected = requiredCells(seeds)
  requireThat(
    Array.isArray(envelopes) && envelopes.length === expected.size * samples,
    "incomplete native sample matrix",
  )
  const first = envelopes[0]
  /** @type {Map<string,Envelope[]>} */
  const groups = new Map()
  /** @type {Map<string,{workload:string,hostNonce:string}>} */
  const processes = new Map()
  /** @type {Map<string,string>} */
  const nonces = new Map(),
    workloads = new Map()
  for (const e of envelopes) {
    validate(e, role, seeds, samples)
    requireThat(
      e.sourceHash === first.sourceHash &&
        e.scriptHash === first.scriptHash &&
        e.lockHash === first.lockHash,
      "mixed source/script/lock provenance",
    )
    const workload = workloadKey(e.cell),
      key = cellKey(e.cell),
      known = processes.get(e.processPass)
    requireThat(expected.has(key), "unexpected native cell")
    requireThat(
      !known || (known.workload === workload && known.hostNonce === e.hostNonce),
      "process changed workload/nonce",
    )
    requireThat(
      !nonces.has(e.hostNonce) || nonces.get(e.hostNonce) === e.processPass,
      "nonce reused across independent processes",
    )
    requireThat(
      !workloads.has(workload) || workloads.get(workload) === e.processPass,
      "extra process block for seed workload",
    )
    processes.set(e.processPass, { workload, hostNonce: e.hostNonce })
    nonces.set(e.hostNonce, e.processPass)
    workloads.set(workload, e.processPass)
    const entries = groups.get(key) ?? []
    entries.push(e)
    groups.set(key, entries)
  }
  const cells = []
  for (const [key, cell] of expected) {
    const entries = [...(groups.get(key) ?? [])].sort((a, b) => a.index - b.index)
    requireThat(
      entries.length === samples && entries.every((e, i) => e.index === i),
      `missing/duplicate sample: ${key}`,
    )
    const measured = entries.slice(warmups),
      stats = metrics(measured)
    const maxTimerQuantumMs = Math.max(...entries.map((e) => e.packet.timerQuantumMs))
    const counts = { sampleCount: samples, warmupCount: warmups, measuredCount: measured.length }
    cells.push({
      cell,
      ...counts,
      maxTimerQuantumMs,
      metrics: stats,
      blocks: [
        {
          seed: cell.seed,
          processPass: entries[0].processPass,
          hostNonce: entries[0].hostNonce,
          ...counts,
          maxTimerQuantumMs,
          metrics: stats,
        },
      ],
    })
  }
  const warmupCount = cells.length * warmups
  return {
    role,
    sourceHash: first.sourceHash,
    scriptHash: first.scriptHash,
    lockHash: first.lockHash,
    cellCount: cells.length,
    processCount: processes.size,
    sampleCount: envelopes.length,
    warmupCount,
    measuredCount: envelopes.length - warmupCount,
    tailLabel: POLICY.descriptiveP95,
    processDesign: POLICY.processDesign,
    cells,
  }
}
/** @param {Envelope[]} envelopes @param {'baseline'|'calibration'|'candidate'} role */
export function summarizeNative(envelopes, role) {
  requireThat(["baseline", "calibration", "candidate"].includes(role), "unknown training role")
  return summarize(envelopes, role)
}
/** Complete semantic holdouts do NOT satisfy future timing confirmation.
 * @param {Envelope[]} envelopes @param {string} sourceHash @param {string} scriptHash @param {string} lockHash
 */
export function validateNativeHoldouts(envelopes, sourceHash, scriptHash, lockHash) {
  hash(sourceHash, "trusted source")
  hash(scriptHash, "trusted script")
  hash(lockHash, "trusted lock")
  const result = summarize(envelopes, "holdout", true)
  requireThat(
    result.sourceHash === sourceHash &&
      result.scriptHash === scriptHash &&
      result.lockHash === lockHash,
    "holdout trusted provenance mismatch",
  )
  return {
    status: "semantic-holdouts-valid",
    role: "holdout",
    sourceHash,
    scriptHash,
    lockHash,
    cellCount: result.cellCount,
    processCount: result.processCount,
    sampleCount: result.sampleCount,
    holdoutTimingConfirmed: false,
    requiredHoldoutTimingGate: HOLDOUT_GATE,
    cells: result.cells.map((c) => ({
      cell: c.cell,
      processPass: c.blocks[0].processPass,
      hostNonce: c.blocks[0].hostNonce,
    })),
  }
}
/** @typedef {ReturnType<typeof summarizeNative>} Summary */
/** @param {Summary} left @param {Summary} right */
function independentHosts(left, right) {
  const nonces = new Set(left.cells.map((c) => c.blocks[0].hostNonce))
  requireThat(
    right.cells.every((c) => !nonces.has(c.blocks[0].hostNonce)),
    "host nonce reused across independent roles",
  )
}
/** @param {Summary} baseline @param {Summary} calibration */
function verifyControl(baseline, calibration) {
  independentHosts(baseline, calibration)
  requireThat(
    calibration.sourceHash === baseline.sourceHash &&
      calibration.scriptHash === baseline.scriptHash,
    "calibration source AND installed script must be unchanged",
  )
  requireThat(
    calibration.lockHash === baseline.lockHash,
    "trusted baseline evaluator lock mismatch",
  )
}
/** Compensated mean keeps summation error from turning an exact threshold into a win.
 * @param {number[]} values
 */
function mean(values) {
  let sum = 0,
    correction = 0
  for (const value of values) {
    const adjusted = value - correction,
      next = sum + adjusted
    correction = next - sum - adjusted
    sum = next
  }
  return sum / values.length
}
/** @param {Summary} baseline @param {Summary} calibration */
function calibrationFacts(baseline, calibration) {
  verifyControl(baseline, calibration)
  const cells = [],
    noiseLogs = []
  for (let i = 0; i < baseline.cells.length; i++) {
    const base = baseline.cells[i],
      control = calibration.cells[i]
    requireThat(cellKey(base.cell) === cellKey(control.cell), "same-seed control pair mismatch")
    const maxMatchedTimerQuantumMs = Math.max(base.maxTimerQuantumMs, control.maxTimerQuantumMs)
    /** @type {Record<string,number>} */
    const floors = {}
    /** @type {Record<string,number>} */
    const budgets = {}
    /** @type {Record<string,number>} */
    const catastrophicP95Budgets = {}
    /** @type {Record<string,number>} */
    const medianDiscrepancies = {}
    const reasons = []
    for (const metric of METRICS) {
      floors[metric] = Math.max(
        POLICY.absoluteFloorsMs[metric],
        POLICY.minimumTimerQuanta * maxMatchedTimerQuantumMs,
      )
      budgets[metric] = Math.max(
        floors[metric],
        POLICY.maxRegressionFraction * base.metrics[metric].median,
      )
      catastrophicP95Budgets[metric] = Math.max(
        POLICY.p95Catastrophic.absoluteMs,
        POLICY.p95Catastrophic.fraction * base.metrics[metric].p95,
      )
      medianDiscrepancies[metric] = Math.abs(
        control.metrics[metric].median - base.metrics[metric].median,
      )
      if (medianDiscrepancies[metric] > budgets[metric])
        reasons.push(`${metric} calibration median outside frozen budget`)
      if (control.metrics[metric].p95 - base.metrics[metric].p95 > catastrophicP95Budgets[metric])
        reasons.push(`${metric} calibration p95 outside catastrophic budget`)
    }
    const isPrimary = primary(base.cell)
    const primaryDiscrepancy =
      medianDiscrepancies[POLICY.primaryMetric] /
      Math.max(base.metrics[POLICY.primaryMetric].median, floors[POLICY.primaryMetric])
    if (isPrimary) noiseLogs.push(Math.log1p(primaryDiscrepancy))
    cells.push({
      cell: base.cell,
      isPrimary,
      baseline: base.metrics,
      calibration: control.metrics,
      maxMatchedTimerQuantumMs,
      floors,
      budgets,
      catastrophicP95Budgets,
      medianDiscrepancies,
      primaryDiscrepancy,
      reasons,
      status: reasons.length ? "inconclusive" : "within-budget",
    })
  }
  requireThat(noiseLogs.length > 0, "fixed primary set is empty")
  const primaryNoise = Math.expm1(mean(noiseLogs)),
    inconclusiveCells = cells.filter((c) => c.reasons.length)
  return {
    status: inconclusiveCells.length ? "inconclusive" : "calibrated",
    primaryNoise,
    threshold: Math.max(POLICY.practicalImprovementFraction, POLICY.noiseMultiplier * primaryNoise),
    primaryCellCount: noiseLogs.length,
    inconclusiveCells,
    cells,
  }
}
/** Baseline and unchanged control only; no candidates can widen these budgets.
 * @param {Envelope[]} baseline @param {Envelope[]} calibration
 */
export function measureNativeCalibration(baseline, calibration) {
  return calibrationFacts(
    summarizeNative(baseline, "baseline"),
    summarizeNative(calibration, "calibration"),
  )
}
/** Identity guard only: does not invent a candidate role, independent host, or timing proof.
 * @param {{sourceHash:string,scriptHash:string}} baseline @param {{sourceHash:string,scriptHash:string}} subject
 */
export function assertChangedNativeSubject(baseline, subject) {
  for (const value of [
    baseline.sourceHash,
    baseline.scriptHash,
    subject.sourceHash,
    subject.scriptHash,
  ])
    hash(value, "subject identity")
  requireThat(
    subject.sourceHash !== baseline.sourceHash && subject.scriptHash !== baseline.scriptHash,
    "candidate source AND installed script must differ; unchanged/comment-only candidate rejected",
  )
}
/** Training can at most request confirmation. No fresh held-out timing gate is implemented.
 * @param {Envelope[]} baselineEnvelopes @param {Envelope[]} calibrationEnvelopes @param {Envelope[]} candidateEnvelopes
 */
export function compareNative(baselineEnvelopes, calibrationEnvelopes, candidateEnvelopes) {
  const baseline = summarizeNative(baselineEnvelopes, "baseline"),
    calibration = summarizeNative(calibrationEnvelopes, "calibration"),
    candidate = summarizeNative(candidateEnvelopes, "candidate")
  const control = calibrationFacts(baseline, calibration)
  independentHosts(baseline, candidate)
  independentHosts(calibration, candidate)
  assertChangedNativeSubject(baseline, candidate)
  requireThat(candidate.lockHash === baseline.lockHash, "trusted baseline evaluator lock mismatch")
  const cells = [],
    ratioLogs = []
  for (let i = 0; i < control.cells.length; i++) {
    const fact = control.cells[i],
      next = candidate.cells[i],
      reasons = [...fact.reasons]
    requireThat(cellKey(fact.cell) === cellKey(next.cell), "same-seed candidate pair mismatch")
    for (const metric of METRICS) {
      requireThat(
        next.metrics[metric].median - fact.baseline[metric].median <= fact.budgets[metric],
        `measurement exceeded frozen budget: ${cellKey(fact.cell)} ${metric}.median`,
      )
      requireThat(
        next.metrics[metric].p95 - fact.baseline[metric].p95 <= fact.catastrophicP95Budgets[metric],
        `measurement exceeded catastrophic p95 budget: ${cellKey(fact.cell)} ${metric}`,
      )
    }
    // Deliberately no candidate-dependent widening or precision epsilon.
    const precisionCompatible = next.maxTimerQuantumMs <= fact.maxMatchedTimerQuantumMs
    if (!precisionCompatible)
      reasons.push("candidate timer quantum is coarser than matched controls")
    const b = fact.baseline[POLICY.primaryMetric].median,
      c = next.metrics[POLICY.primaryMetric].median,
      floor = fact.floors[POLICY.primaryMetric]
    const ratio = c > b || b - c > floor ? Math.max(c, floor) / Math.max(b, floor) : 1
    if (fact.isPrimary) ratioLogs.push(Math.log(ratio))
    cells.push({
      ...fact,
      candidate: next.metrics,
      precisionCompatible,
      floorAdjustedRatio: ratio,
      reasons,
      status: reasons.length ? "inconclusive" : "within-budget",
    })
  }
  const aggregateRatio = Math.exp(mean(ratioLogs)),
    aggregateGain = 1 - aggregateRatio,
    inconclusiveCells = cells.filter((c) => c.reasons.length)
  const status = inconclusiveCells.length
    ? "inconclusive"
    : aggregateGain > control.threshold
      ? "confirmation-required"
      : "no-win"
  return {
    status,
    aggregateRatio,
    aggregateGain,
    aggregateLabel: AGGREGATE_LABEL,
    primaryNoise: control.primaryNoise,
    threshold: control.threshold,
    primaryCellCount: ratioLogs.length,
    inconclusiveCells,
    cells,
    holdoutTimingConfirmed: false,
    requiredHoldoutTimingGate: HOLDOUT_GATE,
  }
}
