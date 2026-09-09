// Pure subset accounting, not native/source authentication or branch-admission authority.
// The controller must verify compatible legacy/current lock lineage before combining cases.
import { validateNativePacket } from "./native-packet.js"
import { NATIVE_POLICY as POLICY } from "./native-policy.js"
import { operationsForShape } from "./native-summary.js"

const METRICS = ["inputSync", "settlement", "renderOpportunity"]
const ROLES = ["baseline", "calibration", "holdout"]
const UNRESOLVED = ["pending", "dispatched-effect-indeterminate", "operational-failure"]
const STATUSES = ["passed", "resource-censored", "not-admitted", ...UNRESOLVED]
const CLAIM_LIMIT =
  "Descriptive per-workload subsamples only; controller authenticates native execution, subject and compatible lock lineage. No global aggregate, candidate selection, causal regression, progression decision or held-out timing confirmation. Censored/omitted cases remain unmeasured."

function requireThat(value, message) {
  if (!value) throw Error(message)
}
function text(value, label) {
  requireThat(
    typeof value === "string" && value.trim().length > 0,
    `${label}: nonempty text required`,
  )
}
function hash(value, label) {
  requireThat(
    typeof value === "string" && /^[a-f0-9]{64}$/.test(value),
    `${label}: lowercase SHA256 required`,
  )
}
function workloadKey(c) {
  return `${c.size}/${c.shape}/${c.seed}`
}
function caseKey(c) {
  return `${workloadKey(c)}/${c.role}`
}
function orderedCases(a, b) {
  return (
    a.size - b.size ||
    POLICY.shapes.indexOf(a.shape) - POLICY.shapes.indexOf(b.shape) ||
    a.seed - b.seed ||
    ROLES.indexOf(a.role) - ROLES.indexOf(b.role)
  )
}
function statistics(values) {
  const sorted = [...values].sort((a, b) => a - b),
    mid = Math.floor(sorted.length / 2)
  requireThat(
    sorted.length > 0 && sorted.every(Number.isFinite),
    "finite nonempty metric samples required",
  )
  return {
    median: sorted.length % 2 ? sorted[mid] : sorted[mid - 1] / 2 + sorted[mid] / 2,
    p95: sorted[Math.ceil(0.95 * sorted.length) - 1],
  }
}
function operationSummary(packets, operation) {
  const all = packets.filter((p) => p.operation === operation)
  const measured = all.filter((p) => p.index >= POLICY.warmupsPerBlock)
  return {
    operation,
    sampleCount: all.length,
    warmupCount: all.length - measured.length,
    measuredCount: measured.length,
    maxTimerQuantumMs: Math.max(...all.map((p) => p.timerQuantumMs)),
    metrics: Object.fromEntries(
      METRICS.map((metric) => [metric, statistics(measured.map((p) => p.timing[metric]))]),
    ),
  }
}
function validateCase(c, state) {
  requireThat(c && typeof c === "object" && !Array.isArray(c), "case object required")
  text(c.id, "case id")
  requireThat(
    POLICY.sizes.includes(c.size) && POLICY.shapes.includes(c.shape),
    "unknown workload size/shape",
  )
  requireThat(ROLES.includes(c.role), "unknown workload role; candidates are not accepted")
  requireThat(
    (c.role === "holdout" ? POLICY.holdoutSeeds : POLICY.trainingSeeds).includes(c.seed),
    "unknown workload seed/role",
  )
  requireThat(STATUSES.includes(c.status), "unknown case status")
  requireThat(
    !state.ids.has(c.id) && !state.keys.has(caseKey(c)),
    "duplicate case id or workload key",
  )
  state.ids.add(c.id)
  state.keys.add(caseKey(c))
  const packets = c.packets ?? []
  requireThat(Array.isArray(packets), "packet array required")
  requireThat(
    c.status !== "not-admitted" || packets.length === 0,
    "not-admitted case cannot contain measured packets",
  )
  const needsIdentity = c.status === "passed" || packets.length > 0
  for (const field of ["sourceHash", "scriptHash", "lockHash"]) {
    if (needsIdentity || c[field] !== undefined) {
      hash(c[field], field)
      if (field === "lockHash") state.locks.add(c[field])
      else {
        requireThat(
          state[field] === null || state[field] === c[field],
          "incompatible subject source/script",
        )
        state[field] = c[field]
      }
    }
  }
  if (needsIdentity || c.hostNonce !== undefined) {
    text(c.hostNonce, "host nonce")
    requireThat(!state.nonces.has(c.hostNonce), "host nonce reused across distinct cases")
    state.nonces.add(c.hostNonce)
  }
  const operations = operationsForShape(c.shape)
  const cycles = c.role === "holdout" ? POLICY.semanticHoldoutSamples : POLICY.timingSamplesPerBlock
  const expected = operations.length * cycles
  requireThat(
    packets.length <= expected && (c.status !== "passed" || packets.length === expected),
    "incomplete or excessive packet inventory",
  )
  const seen = new Set()
  for (const packet of packets) {
    const p = validateNativePacket(packet)
    requireThat(operations.includes(p.operation), "inapplicable packet operation")
    requireThat(
      Number.isSafeInteger(p.index) && p.index >= 0 && p.index < cycles,
      "packet index out of range",
    )
    requireThat(p.counts.scene === c.size, "packet scene count mismatch")
    const key = `${p.index}/${p.operation}`
    requireThat(!seen.has(key), "duplicate packet index/operation")
    seen.add(key)
    requireThat(
      Number.isFinite(POLICY.minimumTimerQuanta * p.timerQuantumMs),
      "timer quantum budget overflow",
    )
  }
  const summary = {
    id: c.id,
    size: c.size,
    shape: c.shape,
    seed: c.seed,
    role: c.role,
    status: c.status,
    ...Object.fromEntries(
      ["sourceHash", "scriptHash", "lockHash", "hostNonce"]
        .filter((k) => c[k] !== undefined)
        .map((k) => [k, c[k]]),
    ),
    sampleCount: packets.length,
    warmupCount: 0,
    measuredCount: 0,
    holdoutTimingConfirmed: false,
  }
  if (c.status === "passed") {
    if (c.role === "holdout") summary.semanticOperations = operations
    else {
      summary.operations = operations.map((operation) => operationSummary(packets, operation))
      summary.warmupCount = POLICY.warmupsPerBlock * operations.length
      summary.measuredCount = packets.length - summary.warmupCount
    }
  }
  return summary
}
function matchedPair(baseline, calibration) {
  const c = baseline ?? calibration
  const result = {
    size: c.size,
    shape: c.shape,
    seed: c.seed,
    baselineId: baseline?.id ?? null,
    calibrationId: calibration?.id ?? null,
  }
  if (baseline?.status !== "passed" || calibration?.status !== "passed")
    return {
      ...result,
      status: "unpaired",
      missingRoles: [
        ...(baseline?.status === "passed" ? [] : ["baseline"]),
        ...(calibration?.status === "passed" ? [] : ["calibration"]),
      ],
    }
  const cells = baseline.operations.map((base, index) => {
    const control = calibration.operations[index]
    requireThat(base.operation === control.operation, "matched operation mismatch")
    const maxMatchedTimerQuantumMs = Math.max(base.maxTimerQuantumMs, control.maxTimerQuantumMs)
    const floors = {},
      budgets = {},
      catastrophicP95Budgets = {},
      medianDiscrepancies = {},
      reasons = []
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
      requireThat(
        [floors[metric], budgets[metric], catastrophicP95Budgets[metric]].every(Number.isFinite),
        "non-finite matched budget",
      )
      medianDiscrepancies[metric] = Math.abs(
        control.metrics[metric].median - base.metrics[metric].median,
      )
      if (medianDiscrepancies[metric] > budgets[metric])
        reasons.push(`${metric} calibration median outside frozen budget`)
      if (control.metrics[metric].p95 - base.metrics[metric].p95 > catastrophicP95Budgets[metric])
        reasons.push(`${metric} calibration p95 outside catastrophic budget`)
    }
    return {
      cell: { size: c.size, shape: c.shape, seed: c.seed, operation: base.operation },
      baseline: base.metrics,
      calibration: control.metrics,
      maxMatchedTimerQuantumMs,
      floors,
      budgets,
      catastrophicP95Budgets,
      medianDiscrepancies,
      reasons,
      status: reasons.length ? "inconclusive" : "within-budget",
    }
  })
  return {
    ...result,
    baselineLockHash: baseline.lockHash,
    calibrationLockHash: calibration.lockHash,
    cells,
    status: cells.some((cell) => cell.status === "inconclusive") ? "inconclusive" : "within-budget",
  }
}
function coverage(cases) {
  return POLICY.sizes.flatMap((size) =>
    POLICY.shapes.map((shape) => {
      const present = cases.filter((c) => c.size === size && c.shape === shape)
      const requiredCases = POLICY.trainingSeeds.length * 2 + POLICY.holdoutSeeds.length
      const passedCases = present.filter((c) => c.status === "passed").length
      const unresolvedCases = present.filter((c) => UNRESOLVED.includes(c.status)).length
      return {
        size,
        shape,
        requiredCases,
        passedCases,
        resourceCensoredCases: present.filter((c) => c.status === "resource-censored").length,
        notAdmittedCases: present.filter((c) => c.status === "not-admitted").length,
        unresolvedCases,
        missingCases: requiredCases - present.length + unresolvedCases,
        complete: passedCases === requiredCases,
      }
    }),
  )
}

export function summarizeWorkloadCases(input) {
  requireThat(Array.isArray(input), "case array required")
  const state = {
    ids: new Set(),
    keys: new Set(),
    nonces: new Set(),
    locks: new Set(),
    sourceHash: null,
    scriptHash: null,
  }
  const cases = input.map((c) => validateCase(c, state)).sort(orderedCases)
  const training = new Map()
  for (const c of cases) {
    if (c.role === "holdout") continue
    const key = workloadKey(c)
    if (!training.has(key)) training.set(key, {})
    training.get(key)[c.role] = c
  }
  const covered = coverage(cases)
  return {
    schema: "ak5583-workload-summary-v1",
    status: "descriptive-subset",
    sourceHash: state.sourceHash,
    scriptHash: state.scriptHash,
    lockHashes: [...state.locks].sort(),
    counts: {
      requiredCases: covered.reduce((sum, c) => sum + c.requiredCases, 0),
      suppliedCases: cases.length,
      passedCases: cases.filter((c) => c.status === "passed").length,
      resourceCensoredCases: cases.filter((c) => c.status === "resource-censored").length,
      notAdmittedCases: cases.filter((c) => c.status === "not-admitted").length,
      missingCases: covered.reduce((sum, c) => sum + c.missingCases, 0),
      unresolvedCases: covered.reduce((sum, c) => sum + c.unresolvedCases, 0),
      retainedSamples: cases.reduce((sum, c) => sum + c.sampleCount, 0),
      measuredTimingSamples: cases.reduce((sum, c) => sum + c.measuredCount, 0),
      semanticHoldoutSamples: cases
        .filter((c) => c.status === "passed" && c.role === "holdout")
        .reduce((sum, c) => sum + c.sampleCount, 0),
    },
    coverage: covered,
    cases,
    pairs: [...training.values()].map((p) => matchedPair(p.baseline, p.calibration)),
    globalAggregateAvailable: false,
    selectedAsImprovement: false,
    holdoutTimingConfirmed: false,
    claimLimit: CLAIM_LIMIT,
  }
}
