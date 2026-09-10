// One additive, externally hash-pinned WORKLOAD recovery. Never rewrite old evidence/locks.
import { readFile, realpath, writeFile } from "node:fs/promises"
import { basename, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"
import { bytesHash, createFreeze, treeInventory, verifyTree } from "./native-freeze.js"
import { buildMatrixPlan } from "./native-matrix-plan.js"
import { RESOURCE_LIMITS } from "./native-safety.js"
import {
  assertLegacyCompatible,
  importLegacyCases,
  inspectWorkloadCase,
  readJson,
  readRows,
  validateWorkloadPackets,
} from "./workload-evidence.js"
import { isResourceCensor, validateWorkloadPlan, workloadDisposition } from "./workload-policy.js"

const failedId = "10000-ungrouped-558302-calibration-1"
const pairsId = "10000-pairs-558301-baseline-0"
const failureFiles = [
  "case-result.json",
  "failure.json",
  "inflight.json",
  "raw-samples.jsonl",
  "host-cleanup.json",
  "host-identity.json",
  "case-provenance.json",
]
const equal = (a, b, label) => {
  if (!isDeepStrictEqual(a, b)) throw Error(`${label} differs`)
}
const requireThat = (ok, label) => {
  if (!ok) throw Error(label)
}
const identityKeys = ["size", "shape", "seed", "pass", "role"]
const configFor = (c, previousSizes) => ({
  ...Object.fromEntries(identityKeys.map((k) => [k, c[k]])),
  previousSizes,
  pilotPassed: true,
})
function compatible(prior, current) {
  assertLegacyCompatible(prior, current)
  for (const key of ["source", "lock"])
    equal(prior.identities[key], current.identities[key], `original ${key}`)
  for (const family of ["evaluator", "tests"])
    for (const name of Object.keys(current.identities[family]))
      requireThat(
        name in prior.identities[family] || name.startsWith("recovery-"),
        `non-recovery addition: ${name}`,
      )
}
async function priorLock(frozen) {
  const r = frozen.recoveryContinuation
  requireThat(r?.schema === "ak5583-workload-recovery-v1", "recovery lineage missing")
  const bytes = await readFile(r.priorLockPath)
  equal(bytesHash(bytes), r.priorLockHash, "trusted prior lock hash")
  const prior = JSON.parse(bytes)
  requireThat(
    prior.schema === "ak5583-native-freeze-v2" && !prior.recoveryContinuation,
    "only one prior WORKLOAD lineage is supported",
  )
  compatible(prior, frozen)
  await verifyTree(r.priorRoot, r.priorInventory)
  return prior
}
function matchFact(label, fact) {
  for (const key of [
    "id",
    ...identityKeys,
    "status",
    "artifact",
    "sourceHash",
    "scriptHash",
    "lockHash",
    "hostNonce",
    "samples",
    "peakRssMiB",
    "failure",
    "cleanup",
    "exit",
    "startedAt",
    "endedAt",
  ])
    equal(label[key], fact[key], `prior ledger ${fact.id}/${key}`)
}
// Independent raw/provenance/cleanup files must corroborate the native envelope inspector.
async function corroborate(c, artifact, frozen, lockHash, failure = false, exit = c.exit) {
  const result = await readJson(join(artifact, "case-result.json"))
  const identity = await readJson(join(artifact, "host-identity.json"))
  const provenance = await readJson(join(artifact, "case-provenance.json"))
  equal(provenance.input, result.input, "case input")
  for (const [key, value] of Object.entries({
    lockHash,
    sourceHash: frozen.sourceHash,
    scriptHash: frozen.scriptHash,
    host: identity.owned,
    resourcePolicy: frozen.resources,
  }))
    equal(provenance[key], value, `native provenance ${key}`)
  equal(await readJson(join(artifact, "host-cleanup.json")), result.cleanup, "native cleanup")
  const absentBeforeSample =
    !failure &&
    result.observed === 0 &&
    isResourceCensor(result, exit, await readRows(join(artifact, "resource-samples.jsonl")))
  const rows = await readRows(join(artifact, "envelopes.jsonl")).catch((error) => {
    if (error.code === "ENOENT" && absentBeforeSample) return []
    throw error
  })
  validateWorkloadPackets(c, result, rows, identity, frozen, lockHash)
  const raw = await readRows(join(artifact, "raw-samples.jsonl")).catch((error) => {
    if (error.code === "ENOENT" && absentBeforeSample) return []
    throw error
  })
  equal(
    raw.slice(0, rows.length),
    rows.map((r) => r.packet),
    "raw native packets",
  )
  equal(raw.length, rows.length + (failure ? 1 : 0), "raw packet count")
  return { result, identity, raw }
}
// Fresh facts require the same independent artifact corroboration as inherited evidence.
export async function inspectRecoveryCase(c, artifact, frozen, lockHash, exit) {
  const fact = await inspectWorkloadCase(c, artifact, frozen, lockHash, exit)
  await corroborate(c, artifact, frozen, lockHash, false, exit)
  return fact
}
async function exitReceipt(c, r, prior, dispatch, previousSizes) {
  const receipt = await readJson(join(r.priorRoot, `${c.id}-exit.json`))
  equal({ code: receipt.code, signal: receipt.signal }, c.exit, "original exit")
  for (const k of ["id", "startedAt", "endedAt"]) equal(receipt[k], c[k], `exit ${k}`)
  requireThat(
    Number.isFinite(Date.parse(c.startedAt)) && Date.parse(c.endedAt) >= Date.parse(c.startedAt),
    "exit timestamps missing/reversed",
  )
  equal(receipt.command, "heavy-job", "exit owner command")
  const a = receipt.argv
  requireThat(Array.isArray(a) && a.length === 17, "original native invocation required")
  equal(
    a.slice(0, 11),
    [
      "run",
      "--label",
      "ak5583-workload-matrix",
      "--task",
      "5583",
      "--defer-retained-age",
      "run-1788137699-9655c994d9827ead",
      "--retention-decision",
      "154",
      "--",
      "node",
    ],
    "original owner argv",
  )
  requireThat(
    a[11].startsWith("/") && basename(a[11]) === "native-case.js",
    "original native runner path required",
  )
  equal(
    a.slice(12, 16),
    [join(r.priorRoot, c.id), prior.binary, r.priorLockPath, r.priorLockHash],
    "exit artifact/binary/lock paths",
  )
  equal(JSON.parse(a[16]), configFor(c, previousSizes), "exit case config")
  equal(
    dispatch,
    { at: c.startedAt, id: c.id, command: receipt.command, argv: a },
    "dispatch/exit receipt",
  )
  const result = await readJson(join(r.priorRoot, c.id, "case-result.json"))
  equal(result.input, JSON.parse(a[16]), "exit/result input")
  return receipt
}
async function reconcile(c, r, prior, receipt) {
  const entry = r.reconciliation
  requireThat(
    entry?.schema === "ak5583-focus-reconciliation-v1" &&
      entry.action === "fresh-host-only" &&
      typeof entry.authorization === "string" &&
      entry.authorization.trim().length > 0,
    "explicit narrow reconciliation required",
  )
  for (const [key, value] of Object.entries({
    priorRoot: r.priorRoot,
    priorLockHash: r.priorLockHash,
    caseId: failedId,
    failure: "Error: native successful sample required",
    operation: "reorder",
    index: 0,
    focusError: "Error: native focus/visibility changed during measurement",
  }))
    equal(entry[key], value, `reconciliation ${key}`)
  equal(c.id, failedId, "only the reconciled focus case")
  const paths = [...failureFiles.map((f) => `${c.id}/${f}`), `${c.id}-exit.json`]
  equal(Object.keys(entry.evidence).sort(), paths.sort(), "reconciliation evidence inventory")
  for (const path of paths) {
    requireThat(
      /^[a-f0-9]{64}$/.test(entry.evidence[path]),
      "reconciliation evidence hash required",
    )
    equal(entry.evidence[path], r.priorInventory[path], `reconciliation pin ${path}`)
  }
  const artifact = join(r.priorRoot, c.id)
  const { result, identity, raw } = await corroborate(c, artifact, prior, r.priorLockHash, true)
  equal({ code: receipt.code, signal: receipt.signal }, { code: 1, signal: null }, "failure exit")
  requireThat(
    result.status === "failed" &&
      result.failure === entry.failure &&
      result.resourceFailure === null &&
      result.observed === 5 &&
      result.expected === 70 &&
      result.cleanup?.status === "stopped" &&
      Array.isArray(result.cleanup.remaining) &&
      result.cleanup.remaining.length === 0,
    "unreconciled failure/cleanup",
  )
  const failure = await readJson(join(artifact, "failure.json"))
  equal(failure.error, entry.failure, "failure cause")
  equal(failure.resourceFailure, null, "failure resource cause")
  equal(failure.effect, "indeterminate until owned cleanup; no replay", "failure effect")
  equal(
    await readJson(join(artifact, "inflight.json")),
    {
      operation: entry.operation,
      index: entry.index,
      state: "dispatched",
      effect: "indeterminate-until-response",
    },
    "failed inflight operation",
  )
  const packet = raw.at(-1)
  for (const [key, value] of Object.entries({
    status: "failed",
    native: true,
    operation: entry.operation,
    index: entry.index,
    error: entry.focusError,
    effect: "indeterminate",
  }))
    equal(packet[key], value, `failed focus packet ${key}`)
  const resources = await readRows(join(artifact, "resource-samples.jsonl"))
  requireThat(
    resources.length > 0 &&
      resources.every(
        (s) =>
          Number.isFinite(s.rssMiB) &&
          s.rssMiB > 0 &&
          s.rssMiB < RESOURCE_LIMITS.rssMiB &&
          Number.isFinite(s.availableMiB) &&
          s.availableMiB >= RESOURCE_LIMITS.availableMiB,
      ),
    "focus failure resources differ",
  )
  // This receipt is NEVER a passed/censored fact. A pending replacement has a different host/lock/artifact.
  return {
    ...c,
    artifact,
    lockHash: r.priorLockHash,
    hostNonce: identity.owned.nonce,
    failure: result.failure,
    focusError: packet.error,
    cleanup: result.cleanup,
    reconciliation: entry,
  }
}

export async function importRecoveryCases(frozen) {
  const r = frozen.recoveryContinuation,
    prior = await priorLock(frozen)
  const inherited = await importLegacyCases(prior) // ORIGINAL lock, original host nonce, unchanged validator.
  requireThat(
    inherited.length === 51 && inherited.filter((c) => c.status === "passed").length === 50,
    "original 50 passes and giant censor required",
  )
  const index = await readJson(join(r.priorRoot, "workload-index.json"))
  validateWorkloadPlan(index.cases)
  for (const [key, value] of Object.entries({
    schema: "ak5583-workload-matrix-v1",
    status: "failed",
    sourceHash: prior.sourceHash,
    scriptHash: prior.scriptHash,
    lockHash: r.priorLockHash,
    inheritedCases: inherited.length,
    legacy: prior.workloadContinuation,
  }))
    equal(index[key], value, `prior index ${key}`)
  const cases = buildMatrixPlan(),
    facts = [...inherited],
    failures = [],
    nonces = new Set()
  const addNonce = (nonce) => {
    requireThat(!nonces.has(nonce), "prior native host nonce reuse")
    nonces.add(nonce)
  }
  for (const fact of inherited) {
    const label = index.cases.find((c) => c.id === fact.id)
    requireThat(label.inherited === true, "missing inherited fact")
    matchFact(label, fact)
    await corroborate(fact, fact.artifact, prior, fact.lockHash)
    Object.assign(
      cases.find((c) => c.id === fact.id),
      fact,
      { inherited: true },
    )
    addNonce(fact.hostNonce)
  }
  const dispatches = await readRows(join(r.priorRoot, "dispatches.jsonl"))
  let dispatched = 0,
    stopped = false
  const counts = {}
  for (const [i, c] of index.cases.entries()) {
    counts[c.status] = (counts[c.status] ?? 0) + 1
    if (cases[i].status !== "pending") continue
    if (stopped) {
      equal(c, buildMatrixPlan()[i], "post-stop canonical pending case")
      continue
    }
    requireThat(c.inherited === undefined, "foreign inherited label")
    const disposition = workloadDisposition(c, cases)
    if (disposition.kind === "not-admitted") {
      equal(
        c,
        { ...buildMatrixPlan()[i], status: "not-admitted", blockedBy: disposition.blockedBy },
        "canonical not-admitted status",
      )
      Object.assign(cases[i], c)
      continue
    }
    const receipt = await exitReceipt(
      c,
      r,
      prior,
      dispatches[dispatched++],
      disposition.previousSizes,
    )
    if (c.status === "operational-failure") {
      const failed = await reconcile(c, r, prior, receipt)
      addNonce(failed.hostNonce)
      failures.push(failed)
      stopped = true
      Object.assign(cases[i], {
        previousFailure: {
          artifact: failed.artifact,
          lockHash: failed.lockHash,
          hostNonce: failed.hostNonce,
          status: failed.status,
        },
        freshHostAuthorized: true,
      })
    } else {
      equal(c.id, pairsId, "only new prior pairs resource finding")
      const fact = await inspectWorkloadCase(
        c,
        join(r.priorRoot, c.id),
        prior,
        r.priorLockHash,
        receipt,
      )
      equal(fact.status, "resource-censored", "prior pairs disposition")
      matchFact(c, fact)
      await corroborate(c, fact.artifact, prior, r.priorLockHash)
      facts.push(fact)
      addNonce(fact.hostNonce)
      Object.assign(cases[i], fact, { inherited: true })
    }
  }
  equal(
    counts,
    {
      passed: 50,
      "resource-censored": 2,
      "not-admitted": 2,
      "operational-failure": 1,
      pending: 137,
    },
    "stopped prior status census",
  )
  requireThat(
    stopped && failures.length === 1 && facts.length === 52 && dispatched === dispatches.length,
    "prior fact/failure/dispatch inventory differs",
  )
  // No unindexed artifact directory/exit can hide an indeterminate dispatch.
  const allowedCases = new Set([pairsId, failedId])
  for (const path of Object.keys(r.priorInventory)) {
    const top = path.split("/")[0]
    requireThat(!path.includes("/") || allowedCases.has(top), `unindexed prior artifact: ${path}`)
    requireThat(
      path.includes("/") ||
        [
          "workload-index.json",
          "dispatches.jsonl",
          ...[...allowedCases].flatMap((id) => [`${id}-exit.json`, `${id}-driver.txt`]),
        ].includes(top),
      `unindexed prior driver/receipt: ${top}`,
    )
    if (top.endsWith("-exit.json"))
      requireThat(allowedCases.has(top.slice(0, -10)), "unindexed prior exit")
  }
  await verifyTree(r.priorRoot, r.priorInventory)
  return { facts, failures, cases, nonces: [...nonces] }
}

export async function bindRecovery(
  current,
  priorRoot,
  priorLockPath,
  priorLockHash,
  reconciliation,
) {
  const frozen = structuredClone(current)
  delete frozen.workloadContinuation
  frozen.recoveryContinuation = {
    schema: "ak5583-workload-recovery-v1",
    priorRoot: await realpath(priorRoot),
    priorLockPath: await realpath(priorLockPath),
    priorLockHash,
    priorInventory: await treeInventory(priorRoot),
    reconciliation: structuredClone(reconciliation),
  }
  await importRecoveryCases(frozen)
  return frozen
}
export async function createRecoveryFreeze(
  output,
  executable,
  priorRoot,
  priorLockPath,
  priorLockHash,
  reconciliationPath,
  reconciliationHash,
) {
  const entryBytes = await readFile(reconciliationPath)
  equal(bytesHash(entryBytes), reconciliationHash, "trusted reconciliation hash")
  const frozen = await bindRecovery(
    await createFreeze(executable),
    priorRoot,
    priorLockPath,
    priorLockHash,
    JSON.parse(entryBytes),
  )
  const bytes = JSON.stringify(frozen, null, 2) + "\n"
  await writeFile(output, bytes, { flag: "wx" })
  return {
    lock: resolve(output),
    sha256: bytesHash(bytes),
    inheritedFacts: 52,
    retainedFailures: 1,
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, ...args] = process.argv.slice(2)
  if (mode === "freeze" && args.length === 7)
    console.log(JSON.stringify(await createRecoveryFreeze(...args)))
  else if (mode === "audit" && args.length === 5) {
    const [root, lock, hash, entryPath, entryHash] = args,
      bytes = await readFile(entryPath)
    equal(bytesHash(bytes), entryHash, "trusted reconciliation hash")
    const frozen = await bindRecovery(await readJson(lock), root, lock, hash, JSON.parse(bytes))
    const imported = await importRecoveryCases(frozen)
    console.log(
      JSON.stringify({
        evidenceOnly: true,
        nativeLaunches: 0,
        priorLockHash: hash,
        priorInventory: frozen.recoveryContinuation.priorInventory,
        facts: imported.facts.map(({ packets: _packets, ...c }) => c),
        failures: imported.failures,
        next: imported.cases.find((c) => c.status === "pending").id,
      }),
    )
  } else
    throw Error(
      "Usage: recovery-evidence.js freeze <new-lock> <exe> <prior-root> <prior-lock> <trusted-prior-hash> <reconciliation.json> <trusted-reconciliation-hash> | audit <prior-root> <prior-lock> <trusted-prior-hash> <reconciliation.json> <trusted-reconciliation-hash>",
    )
}
