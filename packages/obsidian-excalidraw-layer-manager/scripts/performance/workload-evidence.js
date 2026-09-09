// A controller-owned lineage bridge, not permission to relabel old locks or failed cases.
import { readFile, realpath, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { bytesHash, createFreeze, treeInventory, verifyTree } from "./native-freeze.js"
import { validateNativePacket } from "./native-packet.js"
import { NATIVE_POLICY } from "./native-policy.js"
import { RESOURCE_LIMITS } from "./native-safety.js"
import { operationsForShape } from "./native-summary.js"
import { isResourceCensor, validateWorkloadPlan } from "./workload-policy.js"

export const readJson = async (path) => JSON.parse(await readFile(path, "utf8"))
export async function readRows(path) {
  const text = (await readFile(path, "utf8")).trim()
  return text ? text.split("\n").map(JSON.parse) : []
}
export function assertLegacyCompatible(legacy, current) {
  for (const key of [
    "sourceHash",
    "scriptHash",
    "binary",
    "binaryHash",
    "appAsarHash",
    "contract",
    "resources",
  ])
    if (JSON.stringify(legacy[key]) !== JSON.stringify(current[key]))
      throw Error(`legacy compatibility drift: ${key}`)
  if (JSON.stringify(legacy.identities.hostSeed) !== JSON.stringify(current.identities.hostSeed))
    throw Error("legacy host fixture drift")
  for (const family of ["evaluator", "tests"])
    for (const [name, hash] of Object.entries(legacy.identities[family]))
      if (current.identities[family][name] !== hash)
        throw Error(`legacy ${family} byte drift: ${name}`)
}
export async function createWorkloadFreeze(
  output,
  executable,
  legacyRoot,
  legacyLockPath,
  trustedLegacyHash,
) {
  const bytes = await readFile(legacyLockPath)
  if (bytesHash(bytes) !== trustedLegacyHash) throw Error("trusted legacy lock hash differs")
  const legacy = JSON.parse(bytes),
    current = await createFreeze(executable)
  assertLegacyCompatible(legacy, current)
  current.workloadContinuation = {
    schema: "ak5583-workload-continuation-v1",
    legacyRoot: await realpath(legacyRoot),
    legacyLockPath: await realpath(legacyLockPath),
    legacyLockHash: trustedLegacyHash,
    legacyInventory: await treeInventory(legacyRoot),
    policy:
      "same-shape all predecessor seeds/roles/holdouts; verified resource failures censor only own equal/larger shape; operational failures stop; no global aggregate",
  }
  const serialized = JSON.stringify(current, null, 2) + "\n"
  await importLegacyCases(current) // Validate dispositions/packets before publishing a carry-forward lock.
  await writeFile(output, serialized, { flag: "wx" })
  return { lock: resolve(output), sha256: bytesHash(serialized) }
}
export async function verifyLegacy(frozen) {
  const continuation = frozen.workloadContinuation
  if (continuation?.schema !== "ak5583-workload-continuation-v1")
    throw Error("continuation lineage missing")
  const bytes = await readFile(continuation.legacyLockPath)
  if (bytesHash(bytes) !== continuation.legacyLockHash) throw Error("legacy lock drift")
  assertLegacyCompatible(JSON.parse(bytes), frozen)
  await verifyTree(continuation.legacyRoot, continuation.legacyInventory)
}
export function validateWorkloadPackets(c, result, rows, identity, frozen, lockHash) {
  const operations = operationsForShape(c.shape)
  const cycles =
    c.role === "holdout"
      ? NATIVE_POLICY.semanticHoldoutSamples
      : NATIVE_POLICY.timingSamplesPerBlock
  const expected = cycles * operations.length
  const owned = identity.owned
  if (
    !owned ||
    owned.scriptHash !== frozen.scriptHash ||
    typeof owned.nonce !== "string" ||
    owned.nonce.length < 16 ||
    !Number.isSafeInteger(owned.pid) ||
    owned.pid <= 0 ||
    !/^\d+$/.test(owned.start ?? "") ||
    !owned.profile?.startsWith("/") ||
    !owned.vault?.startsWith("/") ||
    ["profile", "vault", "nonce", "scriptHash"].some((k) => identity.observed?.[k] !== owned[k]) ||
    identity.page?.id !== owned.targetId ||
    identity.page?.type !== "page" ||
    identity.page?.url !== "app://obsidian.md/index.html" ||
    identity.observed?.native !== true ||
    identity.observed.url !== "app://obsidian.md/index.html"
  )
    throw Error("native host proof differs")
  if (
    result.lockHash !== lockHash ||
    result.expected !== expected ||
    result.observed !== rows.length ||
    rows.length > expected ||
    ["size", "shape", "seed", "pass", "role"].some((k) => result.input?.[k] !== c[k])
  )
    throw Error("case result provenance/count differs")
  for (const [i, row] of rows.entries()) {
    validateNativePacket(row.packet)
    if (
      row.role !== c.role ||
      row.sourceHash !== frozen.sourceHash ||
      row.scriptHash !== frozen.scriptHash ||
      row.lockHash !== lockHash ||
      row.hostNonce !== owned.nonce ||
      row.processPass !== `${c.size}-${c.shape}-${c.seed}-${c.role}-${c.pass}` ||
      row.cell.size !== c.size ||
      row.cell.shape !== c.shape ||
      row.cell.seed !== c.seed ||
      row.index !== Math.floor(i / operations.length) ||
      row.cell.operation !== operations[i % operations.length] ||
      row.packet.index !== row.index ||
      row.packet.operation !== row.cell.operation ||
      row.packet.counts.scene !== c.size
    )
      throw Error("native packet sequence/subject/case provenance differs")
  }
  return expected
}
export async function inspectWorkloadCase(c, artifact, frozen, lockHash, exit) {
  const result = await readJson(join(artifact, "case-result.json"))
  const identity = await readJson(join(artifact, "host-identity.json"))
  const snapshots = await readRows(join(artifact, "resource-samples.jsonl"))
  let rows
  try {
    rows = await readRows(join(artifact, "envelopes.jsonl"))
  } catch (error) {
    if (
      error.code !== "ENOENT" ||
      result.observed !== 0 ||
      !isResourceCensor(result, exit, snapshots)
    )
      throw error
    rows = [] // Producer creates this file only after its first successful packet.
  }
  const expected = validateWorkloadPackets(c, result, rows, identity, frozen, lockHash)
  const stopped =
    result.cleanup?.status === "stopped" &&
    Array.isArray(result.cleanup.remaining) &&
    result.cleanup.remaining.length === 0
  const finite =
    snapshots.length > 0 &&
    snapshots.every(
      (s) =>
        Number.isFinite(s.rssMiB) &&
        s.rssMiB > 0 &&
        Number.isFinite(s.availableMiB) &&
        s.availableMiB >= 0,
    )
  const passed =
    exit?.code === 0 &&
    exit.signal === null &&
    result.status === "passed" &&
    result.failure === null &&
    result.resourceFailure === null &&
    stopped &&
    rows.length === expected &&
    finite &&
    snapshots.every(
      (s) => s.rssMiB < RESOURCE_LIMITS.rssMiB && s.availableMiB >= RESOURCE_LIMITS.availableMiB,
    )
  const censored = isResourceCensor(result, exit, snapshots)
  if (!passed && !censored)
    throw Error(
      `operational/semantic/provenance failure, not resource censoring: ${c.id}: ${result.failure}`,
    )
  return {
    ...c,
    artifact,
    status: passed ? "passed" : "resource-censored",
    sourceHash: frozen.sourceHash,
    scriptHash: frozen.scriptHash,
    lockHash,
    hostNonce: identity.owned.nonce,
    samples: rows.length,
    peakRssMiB: Math.max(...snapshots.map((s) => s.rssMiB)),
    failure: result.failure,
    cleanup: result.cleanup,
    packets: rows.map((r) => r.packet),
  }
}
export async function importLegacyCases(frozen) {
  await verifyLegacy(frozen)
  const continuation = frozen.workloadContinuation
  const index = await readJson(join(continuation.legacyRoot, "matrix-index.json"))
  validateWorkloadPlan(index.cases)
  if (index.sourceHash !== frozen.sourceHash || index.lockHash !== continuation.legacyLockHash)
    throw Error("legacy index subject/lock differs")
  const facts = []
  for (const c of index.cases) {
    if (c.status === "pending") continue
    if (!["passed", "failed-or-admission-denied"].includes(c.status))
      throw Error("unreconciled legacy dispatch")
    const fact = await inspectWorkloadCase(
      c,
      join(continuation.legacyRoot, c.id),
      frozen,
      continuation.legacyLockHash,
      c.exit,
    )
    if ((c.status === "passed") !== (fact.status === "passed"))
      throw Error("legacy disposition disagrees")
    facts.push(fact)
  }
  if (new Set(facts.map((f) => f.hostNonce)).size !== facts.length)
    throw Error("legacy host nonce reuse")
  return facts
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  if (args.length !== 5)
    throw Error(
      "Usage: workload-evidence.js <new-lock> <exe> <legacy-matrix> <legacy-lock> <trusted-legacy-hash>",
    )
  console.log(JSON.stringify(await createWorkloadFreeze(...args)))
}
