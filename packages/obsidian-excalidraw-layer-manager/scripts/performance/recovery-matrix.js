// New output only. No resume/retry switch; the prior operational failure is a separate retained attempt.
import { spawn } from "node:child_process"
import { appendFile, mkdir, open, readFile, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"
import { treeInventory, verifyFreeze, verifyTree } from "./native-freeze.js"
import { json } from "./native-host.js"
import { buildMatrixPlan } from "./native-matrix-plan.js"
import { assertChangedNativeSubject } from "./native-summary.js"
import { importRecoveryCases, inspectRecoveryCase } from "./recovery-evidence.js"
import { verifyRecoveryPrerequisites } from "./recovery-prerequisites.js"
import { advanceRecoveryCases } from "./recovery-runner.js"
import { summarizeWorkloadCases } from "./workload-summary.js"

const scripts = dirname(fileURLToPath(import.meta.url))
async function dispatchNativeCase({
  c,
  previousSizes,
  output,
  executable,
  lockPath,
  lockHash,
  state,
}) {
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
  // Unchanged owner task/retention guard and unchanged native runner. No keep-failure-scratch bypass.
  const argv = [
    "run",
    "--label",
    "ak5583-workload-recovery",
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
    if (state.interrupted) throw Error("controller interrupted before owner admission")
    exit = await new Promise((yes, no) => {
      state.child = spawn("heavy-job", argv, { stdio: ["ignore", log.fd, log.fd] })
      state.child.once("error", no)
      state.child.once("exit", (code, signal) => yes({ code, signal }))
    })
  } finally {
    state.child = null
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
  return exit
}
const defaults = {
  verifyFreeze,
  importRecoveryCases,
  verifyRecoveryPrerequisites,
  dispatchNativeCase,
}
// Dependencies are an in-process test seam, never selectable through CLI/config/environment.
export async function runRecoveryMatrix(args, dependencies = {}) {
  if (args.length !== 5 || process.env.AI_SOCIETY_SCRATCH_RUN)
    throw Error(
      "Usage outside heavy-job: recovery-matrix.js <NEW-output> <exe> <recovery-lock> <trusted-hash> <FRESH-prereqs-root>",
    )
  const [outputArg, executable, lockPath, lockHash, prerequisitesArg] = args
  const output = resolve(outputArg),
    prerequisites = resolve(prerequisitesArg),
    runtime = { ...defaults, ...dependencies }
  await mkdir(output) // Exclusive single attempt; an existing output is never resumed.
  const report = {
    schema: "ak5583-recovery-matrix-v1",
    status: "preflight",
    lockHash,
    cases: buildMatrixPlan(),
    claim:
      "per-workload measured/resource-censored coverage; old focus failure retained; no global aggregate",
  }
  const state = { child: null, interrupted: false }
  const interrupt = () => {
    state.interrupted = true
    state.child?.kill("SIGTERM")
  }
  process.on("SIGTERM", interrupt)
  process.on("SIGINT", interrupt)
  const checkpoint = () =>
    json(join(output, "recovery-index.json"), {
      ...report,
      cases: report.cases.map(({ packets: _packets, ...c }) => c),
    })
  try {
    const frozen = await runtime.verifyFreeze(lockPath, lockHash, executable)
    const carried = await runtime.importRecoveryCases(frozen)
    report.cases = carried.cases
    report.sourceHash = frozen.sourceHash
    report.scriptHash = frozen.scriptHash
    report.recovery = frozen.recoveryContinuation
    report.inheritedCases = carried.facts.length
    report.priorFailures = carried.failures // Never overwritten when the fresh attempt passes or fails.
    const prereqNonces = await runtime.verifyRecoveryPrerequisites(
      prerequisites,
      frozen,
      carried.nonces,
    )
    const prereqInventory = await treeInventory(prerequisites)
    report.prerequisites = {
      root: prerequisites,
      inventory: prereqInventory,
      hostNonces: prereqNonces,
    }
    const usePath = `${resolve(lockPath)}.recovery-use.json`
    const useBytes =
      JSON.stringify({
        lockHash,
        output,
        policy: "single controller attempt; never delete to retry",
      }) + "\n"
    const verify = async () => {
      if ((await readFile(usePath, "utf8")) !== useBytes)
        throw Error("recovery single-use receipt changed")
      await runtime.verifyFreeze(lockPath, lockHash, executable)
      const rechecked = await runtime.importRecoveryCases(frozen)
      if (
        !isDeepStrictEqual(rechecked.facts, carried.facts) ||
        !isDeepStrictEqual(rechecked.failures, carried.failures)
      )
        throw Error("recovery carry-forward facts changed")
      await verifyTree(prerequisites, prereqInventory)
      const checkedNonces = await runtime.verifyRecoveryPrerequisites(
        prerequisites,
        frozen,
        carried.nonces,
      )
      if (!isDeepStrictEqual(checkedNonces, prereqNonces)) throw Error("prerequisite hosts changed")
    }
    // Reserve before any dispatch. Failure/interruption leaves this receipt consumed, not retryable.
    await writeFile(usePath, useBytes, { flag: "wx" })
    report.singleUseReceipt = usePath
    report.status = "running"
    await checkpoint()
    await advanceRecoveryCases(
      report.cases,
      [...carried.nonces, ...prereqNonces],
      verify,
      async (c, previousSizes) => {
        if (state.interrupted) throw Error("controller interrupted before dispatch")
        const exit = await runtime.dispatchNativeCase({
          c,
          previousSizes,
          output,
          executable,
          lockPath,
          lockHash,
          frozen,
          state,
        })
        c.exit = exit
        if (state.interrupted) throw Error("controller interrupted after owner exit")
        return inspectRecoveryCase(c, join(output, c.id), frozen, lockHash, exit)
      },
      checkpoint,
      () => state.interrupted,
    )
    if (state.interrupted) throw Error("controller interrupted at summary")
    await verify()
    await json(join(output, "recovery-summary.json"), {
      ...summarizeWorkloadCases(report.cases),
      priorFailures: report.priorFailures,
      claim: report.claim,
    })
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
  } finally {
    if (state.interrupted) {
      report.status = "failed"
      report.error = "controller interrupted"
    }
    report.completedAt = new Date().toISOString()
    await checkpoint()
    process.off("SIGTERM", interrupt)
    process.off("SIGINT", interrupt)
  }
  return report
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await runRecoveryMatrix(process.argv.slice(2))
  console.log(
    JSON.stringify({
      status: report.status,
      error: report.error,
      inheritedCases: report.inheritedCases,
    }),
  )
  if (report.status === "failed") process.exitCode = 1
}
