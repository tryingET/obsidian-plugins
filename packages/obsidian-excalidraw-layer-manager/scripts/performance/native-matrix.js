// Serial controller: every native case goes through the canonical heavy-job owner route.
// No retries/resume after an indeterminate case. An incomplete matrix never becomes a baseline.
import { spawn } from "node:child_process"
import { appendFile, mkdir, open, readFile } from "node:fs/promises"
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { verifyFreeze } from "./native-freeze.js"
import { json } from "./native-host.js"
import { buildMatrixPlan } from "./native-matrix-plan.js"
import { validateNativePacket } from "./native-packet.js"
import { NATIVE_POLICY as policy } from "./native-policy.js"
import { assertNativePrerequisite } from "./native-prerequisite-proof.js"
import { validateSentinelReceipt } from "./native-sentinel-packet.js"
import { requiredCheckNames } from "./native-sentinels.js"
import {
  assertChangedNativeSubject,
  measureNativeCalibration,
  operationsForShape,
  summarizeNative,
  validateNativeHoldouts,
} from "./native-summary.js"

const [outputArg, executable, lockPath, lockHash, pilotPath, sentinelPath, mutantsPath] =
  process.argv.slice(2)
if (!mutantsPath)
  throw Error(
    "Usage: native-matrix.js <new-artifact-dir> <exe> <lock.json> <trusted-lock-hash> <pilot-dir> <sentinel-dir> <mutants-dir>",
  )
const output = resolve(outputArg),
  scripts = dirname(fileURLToPath(import.meta.url))
await mkdir(output)
const frozen = await verifyFreeze(lockPath, lockHash, executable)
const pilot = JSON.parse(await readFile(join(pilotPath, "pilot-result.json"), "utf8"))
const sentinel = JSON.parse(await readFile(join(sentinelPath, "result.json"), "utf8"))
const mutants = JSON.parse(await readFile(join(mutantsPath, "summary.json"), "utf8"))
if (
  pilot.status !== "passed" ||
  pilot.protocolVersion !== 2 ||
  mutants.status !== "passed" ||
  mutants.protocolVersion !== 2 ||
  mutants.results.length !== 4
)
  throw Error("v2 native pilot/sentinel/mutant proof required before matrix")
validateSentinelReceipt(sentinel, requiredCheckNames)
if (JSON.stringify(pilot.operations) !== JSON.stringify(operationsForShape("ten")))
  throw Error("pilot operation inventory differs")
for (const [i, operation] of pilot.operations.entries())
  validateNativePacket(
    JSON.parse(await readFile(join(pilotPath, `operation-${i}-${operation}.json`), "utf8")),
  )
for (const path of [pilotPath, sentinelPath, mutantsPath])
  if (
    JSON.stringify(JSON.parse(await readFile(join(path, "evaluator-inputs.json"), "utf8"))) !==
    JSON.stringify(frozen.identities.evaluator)
  )
    throw Error("prerequisite proof belongs to a different evaluator revision")
if (
  JSON.stringify(mutants.results.map((r) => r.mutant).sort()) !==
    JSON.stringify(["check-bypass", "dropped-row", "no-op", "stale-cache"]) ||
  !mutants.results.every((r) => r.status === "killed" && r.native === true)
)
  throw Error("mutant proof incomplete")
for (const path of [
  pilotPath,
  sentinelPath,
  ...mutants.results.map((r) => join(mutantsPath, r.mutant)),
]) {
  const identity = JSON.parse(await readFile(join(path, "host-identity.json"), "utf8"))
  const closeout = JSON.parse(await readFile(join(path, "closeout.json"), "utf8"))
  const kind = path === pilotPath ? "pilot" : path === sentinelPath ? "sentinels" : "mutants"
  const proofRoot = resolve(
    kind === "pilot" ? pilotPath : kind === "sentinels" ? sentinelPath : mutantsPath,
  )
  const exitReceipt = JSON.parse(
    await readFile(join(dirname(proofRoot), `${basename(proofRoot)}-exit.json`), "utf8"),
  )
  assertNativePrerequisite(closeout, exitReceipt, { kind, output: proofRoot })
  if (
    identity.owned.scriptHash !== frozen.scriptHash ||
    !["stopped", "already-absent"].includes(closeout.cleanup?.status)
  )
    throw Error("pilot/sentinel source or cleanup proof differs")
}
const cases = buildMatrixPlan()
const report = {
  schema: "ak5583-native-matrix-v2",
  status: "running",
  sourceHash: frozen.sourceHash,
  lockHash,
  proofs: { pilotPath, sentinelPath, mutantsPath },
  cases,
}
await json(join(output, "matrix-index.json"), report)
const previousSizes = []
let child,
  interrupted = false
const interrupt = () => {
  interrupted = true
  child?.kill("SIGTERM")
}
process.on("SIGTERM", interrupt)
process.on("SIGINT", interrupt)
try {
  for (const size of policy.sizes) {
    for (const c of cases.filter((c) => c.size === size)) {
      if (interrupted) throw Error("controller interrupted; no replay")
      await verifyFreeze(lockPath, lockHash, executable)
      c.status = "dispatched-effect-indeterminate"
      c.startedAt = new Date().toISOString()
      await json(join(output, "matrix-index.json"), report)
      const artifact = join(output, c.id),
        config = {
          size: c.size,
          shape: c.shape,
          seed: c.seed,
          pass: c.pass,
          role: c.role,
          previousSizes: [...previousSizes],
          pilotPassed: true,
        }
      const argv = [
        "run",
        "--label",
        "ak5583-native-matrix",
        "--task",
        "5583",
        "--defer-retained-age",
        "run-1788137699-9655c994d9827ead",
        "--retention-decision",
        "154",
        "--keep-failure-scratch",
        "--",
        "node",
        join(scripts, "native-case.js"),
        artifact,
        executable,
        lockPath,
        lockHash,
        JSON.stringify(config),
      ]
      await appendFile(
        join(output, "dispatches.jsonl"),
        JSON.stringify({ at: c.startedAt, case: c.id, command: "heavy-job", argv }) + "\n",
      )
      const log = await open(join(output, `${c.id}-driver.txt`), "wx")
      let exit
      try {
        exit = await new Promise((yes, no) => {
          child = spawn("heavy-job", argv, { stdio: ["ignore", log.fd, log.fd] })
          child.once("error", no)
          child.once("exit", (code, signal) => yes({ code, signal }))
        })
      } finally {
        child = null
        await log.close()
      }
      c.exit = exit
      c.endedAt = new Date().toISOString()
      if (exit.code !== 0 || exit.signal) {
        c.status = "failed-or-admission-denied"
        throw Error(`case failed: ${c.id}`)
      }
      const result = JSON.parse(await readFile(join(artifact, "case-result.json"), "utf8"))
      const rows = (await readFile(join(artifact, "envelopes.jsonl"), "utf8"))
        .trim()
        .split("\n")
        .map(JSON.parse)
      const samples =
        c.role === "holdout" ? policy.semanticHoldoutSamples : policy.timingSamplesPerBlock
      const expected = samples * operationsForShape(c.shape).length
      if (
        result.status !== "passed" ||
        result.lockHash !== lockHash ||
        rows.length !== expected ||
        !["stopped", "already-absent"].includes(result.cleanup.status)
      )
        throw Error("case completion/cleanup inventory mismatch")
      const identities = new Set()
      for (const row of rows) {
        validateNativePacket(row.packet)
        if (
          row.role !== c.role ||
          row.sourceHash !== frozen.sourceHash ||
          row.scriptHash !== frozen.scriptHash ||
          row.lockHash !== lockHash ||
          row.cell.size !== c.size ||
          row.cell.seed !== c.seed ||
          row.cell.shape !== c.shape ||
          row.packet.counts.scene !== c.size ||
          !operationsForShape(c.shape).includes(row.cell.operation) ||
          !Number.isInteger(row.index) ||
          row.index < 0 ||
          row.index >= samples
        )
          throw Error("native envelope provenance mismatch")
        identities.add(`${row.index}:${row.cell.operation}`)
      }
      if (identities.size !== expected) throw Error("duplicate/missing sample cells")
      await verifyFreeze(lockPath, lockHash, executable)
      c.status = "passed"
      c.samples = rows.length
      await json(join(output, "matrix-index.json"), report)
      console.log(
        `${cases.filter((c) => c.status === "passed").length}/${cases.length} native process cases passed: ${c.id}`,
      )
    }
    previousSizes.push(size)
  }
  // Node cap on the documented controller invocation bounds aggregation heap.
  const envelopes = []
  for (const c of cases)
    for (const line of (await readFile(join(output, c.id, "envelopes.jsonl"), "utf8"))
      .trim()
      .split("\n"))
      envelopes.push(JSON.parse(line))
  const baseline = envelopes.filter((e) => e.role === "baseline"),
    calibration = envelopes.filter((e) => e.role === "calibration"),
    holdouts = envelopes.filter((e) => e.role === "holdout")
  const holdoutSummary = validateNativeHoldouts(
    holdouts,
    frozen.sourceHash,
    frozen.scriptHash,
    lockHash,
  )
  await json(
    join(output, "holdout-summary.json"),
    holdoutSummary ?? { status: "passed", count: holdouts.length },
  )
  await json(join(output, "noise-summary.json"), measureNativeCalibration(baseline, calibration))
  const baselineSummary = summarizeNative(baseline, "baseline"),
    calibrationSummary = summarizeNative(calibration, "calibration")
  await json(join(output, "baseline-summary.json"), baselineSummary)
  await json(join(output, "calibration-summary.json"), calibrationSummary)
  let rejection
  try {
    assertChangedNativeSubject(baselineSummary, calibrationSummary)
  } catch (error) {
    rejection = String(error)
  }
  if (!rejection?.includes("unchanged")) throw Error("unchanged calibration rejection did not fire")
  await json(join(output, "unchanged-control.json"), {
    selectedAsImprovement: false,
    rejection,
    check: "subject identity only; calibration was not relabeled as a candidate",
  })
  report.status = "passed"
} catch (error) {
  report.status = "failed"
  report.error = String(error)
  process.exitCode = 1
} finally {
  process.off("SIGTERM", interrupt)
  process.off("SIGINT", interrupt)
  report.completedAt = new Date().toISOString()
  report.unmeasured = cases.filter((c) => c.status === "pending").length
  await json(join(output, "matrix-index.json"), report)
}
