// New lineage: reuse verified v2 cases under their old locks, dispatch only admissible shapes.
import { spawn } from "node:child_process"
import { appendFile, mkdir, open } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { verifyFreeze } from "./native-freeze.js"
import { json } from "./native-host.js"
import { buildMatrixPlan } from "./native-matrix-plan.js"
import { assertChangedNativeSubject } from "./native-summary.js"
import { importLegacyCases, inspectWorkloadCase, verifyLegacy } from "./workload-evidence.js"
import { verifyWorkloadPrerequisites } from "./workload-prerequisites.js"
import { advanceWorkloads } from "./workload-runner.js"
import { summarizeWorkloadCases } from "./workload-summary.js"

const [outputArg, executable, lockPath, lockHash, prerequisites] = process.argv.slice(2)
if (!prerequisites || process.env.AI_SOCIETY_SCRATCH_RUN)
  throw Error(
    "Usage outside heavy-job: workload-matrix.js <new-output> <exe> <continuation-lock> <trusted-hash> <fresh-prereqs-root>",
  )
const output = resolve(outputArg),
  scripts = dirname(fileURLToPath(import.meta.url))
await mkdir(output)
const report = {
  schema: "ak5583-workload-matrix-v1",
  status: "preflight",
  lockHash,
  cases: buildMatrixPlan(),
  claim:
    "per-workload measured/resource-censored coverage, never a complete global performance aggregate",
}
let child,
  interrupted = false
const interrupt = () => {
  interrupted = true
  process.exitCode = 1
  child?.kill("SIGTERM")
}
process.on("SIGTERM", interrupt)
process.on("SIGINT", interrupt)
const checkpoint = () =>
  json(join(output, "workload-index.json"), {
    ...report,
    cases: report.cases.map(({ packets: _packets, ...c }) => c),
  })
try {
  const frozen = await verifyFreeze(lockPath, lockHash, executable)
  await verifyWorkloadPrerequisites(resolve(prerequisites), frozen)
  const inherited = await importLegacyCases(frozen)
  for (const fact of inherited)
    Object.assign(
      report.cases.find((c) => c.id === fact.id),
      fact,
      { inherited: true },
    )
  report.sourceHash = frozen.sourceHash
  report.scriptHash = frozen.scriptHash
  report.legacy = frozen.workloadContinuation
  report.inheritedCases = inherited.length
  report.status = "running"
  await checkpoint()
  const nonces = new Set(inherited.map((c) => c.hostNonce))
  await advanceWorkloads(
    report.cases,
    async (c, previousSizes) => {
      await verifyFreeze(lockPath, lockHash, executable)
      await verifyLegacy(frozen)
      if (interrupted) throw Error("controller interrupted before spawn")
      const artifact = join(output, c.id)
      const config = {
        size: c.size,
        shape: c.shape,
        seed: c.seed,
        pass: c.pass,
        role: c.role,
        previousSizes,
        pilotPassed: true,
      }
      // previousSizes now certifies this exact shape, proven by the scheduler's canonical ledger.
      // Default owner failure cleanup follows successful raw retention and its own inactive-reference proof.
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
        join(scripts, "native-case.js"),
        artifact,
        executable,
        lockPath,
        lockHash,
        JSON.stringify(config),
      ]
      c.startedAt = new Date().toISOString()
      await appendFile(
        join(output, "dispatches.jsonl"),
        JSON.stringify({ at: c.startedAt, id: c.id, command: "heavy-job", argv }) + "\n",
      )
      const log = await open(join(output, `${c.id}-driver.txt`), "wx")
      let exit
      try {
        if (interrupted) throw Error("controller interrupted before owner admission")
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
      await json(join(output, `${c.id}-exit.json`), {
        ...exit,
        id: c.id,
        startedAt: c.startedAt,
        endedAt: c.endedAt,
        command: "heavy-job",
        argv,
      })
      if (interrupted) throw Error("controller interrupted after owner exit")
      const fact = await inspectWorkloadCase(c, artifact, frozen, lockHash, exit)
      if (nonces.has(fact.hostNonce)) throw Error("native host nonce reused")
      nonces.add(fact.hostNonce)
      await verifyFreeze(lockPath, lockHash, executable)
      await verifyLegacy(frozen)
      console.log(
        `${fact.status}: ${c.id} (${fact.samples} samples, peak sampled RSS ${fact.peakRssMiB.toFixed(1)}MiB)`,
      )
      return fact
    },
    checkpoint,
    () => interrupted,
  )
  if (interrupted) throw Error("controller interrupted at summary")
  await verifyFreeze(lockPath, lockHash, executable)
  await verifyLegacy(frozen)
  await json(join(output, "workload-summary.json"), summarizeWorkloadCases(report.cases))
  let unchangedRejected = false
  try {
    assertChangedNativeSubject(frozen, frozen)
  } catch (error) {
    unchangedRejected = String(error).includes("unchanged")
  }
  if (!unchangedRejected) throw Error("unchanged subject rejection missing")
  await json(join(output, "unchanged-control.json"), {
    selectedAsImprovement: false,
    unchangedRejected,
    note: "identity guard only; no fabricated candidate or global aggregate",
  })
  report.status = "complete-resource-censored"
} catch (error) {
  report.status = "failed"
  report.error = String(error)
  process.exitCode = 1
} finally {
  if (interrupted) {
    report.status = "failed"
    report.error = "controller interrupted"
    process.exitCode = 1
  }
  report.completedAt = new Date().toISOString()
  await checkpoint()
  process.off("SIGTERM", interrupt)
  process.off("SIGINT", interrupt)
}
