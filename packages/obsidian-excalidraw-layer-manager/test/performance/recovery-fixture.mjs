// Real filesystem/packet fixtures; no mocked authentication or native launches.
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { bytesHash, treeInventory } from "../../scripts/performance/native-freeze.js"
import { buildMatrixPlan } from "../../scripts/performance/native-matrix-plan.js"
import { NATIVE_POLICY } from "../../scripts/performance/native-policy.js"
import { RESOURCE_LIMITS } from "../../scripts/performance/native-safety.js"
import { operationsForShape } from "../../scripts/performance/native-summary.js"
import { inspectWorkloadCase } from "../../scripts/performance/workload-evidence.js"

export const writeJson = (path, value) => writeFile(path, JSON.stringify(value, null, 2) + "\n")
export const writeRows = (path, rows) => writeFile(path, rows.map(JSON.stringify).join("\n") + "\n")
export const failedId = "10000-ungrouped-558302-calibration-1"
export const failureFiles = [
  "case-result.json",
  "failure.json",
  "inflight.json",
  "raw-samples.jsonl",
  "host-cleanup.json",
  "host-identity.json",
  "case-provenance.json",
]
export function reconciliation(root, lockHash, inventory) {
  const paths = [...failureFiles.map((f) => `${failedId}/${f}`), `${failedId}-exit.json`]
  return {
    schema: "ak5583-focus-reconciliation-v1",
    priorRoot: root,
    priorLockHash: lockHash,
    caseId: failedId,
    action: "fresh-host-only",
    authorization:
      "Operator explicitly approved a new fresh host; retain failed attempt, no in-host replay",
    failure: "Error: native successful sample required",
    operation: "reorder",
    index: 0,
    focusError: "Error: native focus/visibility changed during measurement",
    evidence: Object.fromEntries(paths.map((p) => [p, inventory[p]])),
  }
}
export async function caseFiles(root, c, frozen, lockHash, mode, noncePrefix = "unique-host") {
  const artifact = join(root, c.id)
  await mkdir(artifact)
  const owned = {
    pid: 123,
    start: "1234",
    nonce: `${noncePrefix}-${c.id}`,
    scriptHash: frozen.scriptHash,
    profile: `/owned/${c.id}/profile`,
    vault: `/owned/${c.id}/vault`,
    targetId: "page-1",
  }
  const identity = {
    owned,
    observed: { ...owned, native: true, url: "app://obsidian.md/index.html" },
    page: { id: "page-1", type: "page", url: "app://obsidian.md/index.html" },
  }
  const operations = operationsForShape(c.shape),
    expected = (c.role === "holdout" ? 1 : 10) * operations.length
  const count = mode === "pass" ? expected : mode === "focus" ? 5 : 2
  const rows = Array.from({ length: count }, (_, i) => {
    const index = Math.floor(i / operations.length),
      operation = operations[i % operations.length]
    return {
      role: c.role,
      sourceHash: frozen.sourceHash,
      scriptHash: frozen.scriptHash,
      lockHash,
      hostNonce: owned.nonce,
      processPass: c.id,
      index,
      cell: { size: c.size, shape: c.shape, seed: c.seed, operation },
      packet: {
        index,
        operation,
        status: "passed",
        native: true,
        inputPath: "native command facade",
        inputPhase: "post-requestAnimationFrame",
        timerQuantumMs: 0.1,
        checks: [
          "scene-exact",
          "rows-exact",
          "selection-exact",
          "runtime-fresh",
          "staging-preserved",
        ].map((id) => ({ id, actual: "a".repeat(64), expected: "a".repeat(64) })),
        counts: { scene: c.size, rows: c.size, selected: 0 },
        beforeHashes: { scene: "b".repeat(64), rows: "a".repeat(64), selection: "a".repeat(64) },
        timing: {
          inputSync: 1,
          promiseComplete: 2,
          settlement: 3,
          renderOpportunity: 8,
          renderOpportunities: [5, 8],
        },
      },
    }
  })
  const cleanup = { status: "stopped", remaining: [] },
    input = Object.fromEntries(["size", "shape", "seed", "pass", "role"].map((k) => [k, c[k]]))
  input.previousSizes = c.size === 1000 ? [] : [1000]
  input.pilotPassed = true
  const result = {
    input,
    lockHash,
    expected,
    observed: count,
    status: mode === "pass" ? "passed" : "failed",
    failure:
      mode === "pass"
        ? null
        : mode === "focus"
          ? "Error: native successful sample required"
          : "Error: CDP closed: effects indeterminate",
    resourceFailure: mode === "censor" ? "Error: sampled native resource limit" : null,
    cleanup,
  }
  await writeJson(join(artifact, "case-result.json"), result)
  await writeJson(join(artifact, "host-identity.json"), identity)
  await writeJson(join(artifact, "host-cleanup.json"), cleanup)
  await writeJson(join(artifact, "case-provenance.json"), {
    input,
    lockHash,
    sourceHash: frozen.sourceHash,
    scriptHash: frozen.scriptHash,
    host: owned,
    resourcePolicy: RESOURCE_LIMITS,
  })
  await writeRows(join(artifact, "envelopes.jsonl"), rows)
  await writeRows(join(artifact, "resource-samples.jsonl"), [
    { rssMiB: mode === "censor" ? 8290 : 1000, availableMiB: 12000 },
  ])
  const raw = rows.map((r) => r.packet)
  if (mode === "focus") {
    raw.push({
      status: "failed",
      native: true,
      operation: "reorder",
      index: 0,
      error: "Error: native focus/visibility changed during measurement",
      effect: "indeterminate",
    })
    await writeJson(join(artifact, "failure.json"), {
      error: result.failure,
      resourceFailure: null,
      effect: "indeterminate until owned cleanup; no replay",
    })
    await writeJson(join(artifact, "inflight.json"), {
      operation: "reorder",
      index: 0,
      state: "dispatched",
      effect: "indeterminate-until-response",
    })
  }
  await writeRows(join(artifact, "raw-samples.jsonl"), raw)
  return { artifact, input }
}
export async function fixture(root) {
  const legacyRoot = join(root, "legacy"),
    priorRoot = join(root, "prior"),
    legacyLockPath = join(root, "legacy-lock.json"),
    priorLockPath = join(root, "prior-lock.json")
  await mkdir(legacyRoot)
  await mkdir(priorRoot)
  const legacy = {
    schema: "ak5583-native-freeze-v2",
    sourceHash: "a".repeat(64),
    scriptHash: "b".repeat(64),
    binary: "/owned/obsidian",
    binaryHash: "c".repeat(64),
    appAsarHash: "d".repeat(64),
    contract: NATIVE_POLICY,
    resources: RESOURCE_LIMITS,
    identities: {
      source: { "main.ts": "original" },
      lock: "original",
      hostSeed: { drawing: "original" },
      evaluator: { "native-case.js": "original" },
      tests: { "native.test.ts": "original" },
    },
  }
  await writeJson(legacyLockPath, legacy)
  const legacyLockHash = bytesHash(JSON.stringify(legacy, null, 2) + "\n"),
    legacyCases = buildMatrixPlan(),
    facts = []
  for (const [i, c] of legacyCases.entries()) {
    if (i > 50) break
    c.startedAt = "2026-09-09T09:00:00.000Z"
    c.endedAt = "2026-09-09T09:01:00.000Z"
    c.exit = { code: i === 50 ? 1 : 0, signal: null }
    c.status = i === 50 ? "failed-or-admission-denied" : "passed"
    const { artifact } = await caseFiles(
      legacyRoot,
      c,
      legacy,
      legacyLockHash,
      i === 50 ? "censor" : "pass",
    )
    facts.push(await inspectWorkloadCase(c, artifact, legacy, legacyLockHash, c.exit))
  }
  await writeJson(join(legacyRoot, "matrix-index.json"), {
    sourceHash: legacy.sourceHash,
    lockHash: legacyLockHash,
    cases: legacyCases,
  })
  const prior = {
    ...legacy,
    identities: {
      ...legacy.identities,
      evaluator: { ...legacy.identities.evaluator, "workload-evidence.js": "original" },
      tests: { ...legacy.identities.tests, "workload.test.ts": "original" },
    },
    workloadContinuation: {
      schema: "ak5583-workload-continuation-v1",
      legacyRoot,
      legacyLockPath,
      legacyLockHash,
      legacyInventory: await treeInventory(legacyRoot),
    },
  }
  await writeJson(priorLockPath, prior)
  const priorLockHash = bytesHash(JSON.stringify(prior, null, 2) + "\n"),
    cases = buildMatrixPlan(),
    dispatches = []
  for (const fact of facts)
    Object.assign(
      cases.find((c) => c.id === fact.id),
      fact,
      { inherited: true },
    )
  for (const i of [51, 53])
    Object.assign(cases[i], { status: "not-admitted", blockedBy: cases[i - 1].id })
  for (const [i, mode] of [
    [52, "censor"],
    [54, "focus"],
  ]) {
    const c = cases[i],
      { artifact, input } = await caseFiles(priorRoot, c, prior, priorLockHash, mode)
    c.startedAt = "2026-09-09T15:00:00.000Z"
    c.endedAt = "2026-09-09T15:01:00.000Z"
    c.exit = { code: 1, signal: null }
    const argv = [
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
      "/subject/scripts/performance/native-case.js",
      artifact,
      prior.binary,
      priorLockPath,
      priorLockHash,
      JSON.stringify(input),
    ]
    dispatches.push({ at: c.startedAt, id: c.id, command: "heavy-job", argv })
    await writeJson(join(priorRoot, `${c.id}-exit.json`), {
      ...c.exit,
      id: c.id,
      startedAt: c.startedAt,
      endedAt: c.endedAt,
      command: "heavy-job",
      argv,
    })
    if (mode === "censor")
      Object.assign(c, await inspectWorkloadCase(c, artifact, prior, priorLockHash, c.exit))
    else
      Object.assign(c, {
        status: "operational-failure",
        error: `Error: operational/semantic/provenance failure, not resource censoring: ${c.id}: Error: native successful sample required`,
      })
  }
  await writeRows(join(priorRoot, "dispatches.jsonl"), dispatches)
  const index = {
    schema: "ak5583-workload-matrix-v1",
    status: "failed",
    sourceHash: prior.sourceHash,
    scriptHash: prior.scriptHash,
    lockHash: priorLockHash,
    inheritedCases: facts.length,
    legacy: prior.workloadContinuation,
    cases,
  }
  await writeJson(join(priorRoot, "workload-index.json"), index)
  const inventory = await treeInventory(priorRoot),
    entry = reconciliation(priorRoot, priorLockHash, inventory)
  const current = structuredClone(prior)
  delete current.workloadContinuation
  current.identities.evaluator["recovery-evidence.js"] = "new"
  current.identities.tests["recovery-evidence.test.mjs"] = "new"
  return { current, prior, priorRoot, priorLockPath, priorLockHash, entry, index, inventory }
}
