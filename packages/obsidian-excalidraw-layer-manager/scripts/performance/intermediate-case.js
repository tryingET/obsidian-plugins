// Explicit exploratory runner: same native helpers, no baseline-role envelopes or policy edits.
import { appendFile, cp, mkdir, mkdtemp, readdir, readFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { admitIntermediate, assertResources, INTERMEDIATE } from "./intermediate-policy.js"
import {
  expectedFrontOrder,
  expectedRows,
  makeDescriptors,
  sceneProjection,
} from "./native-fixture.js"
import { verifyFreeze } from "./native-freeze.js"
import { json, launchHost, resources } from "./native-host.js"
import { validateNativePacket } from "./native-packet.js"
import { prepareNativeCase, runNativeOperation } from "./native-page.js"
import { settleUntilStable } from "./native-settlement.js"
import { operationsForShape } from "./native-summary.js"

const [outputArg, executable, lockPath, lockHash, sizeArg, shape, previousRoot] =
  process.argv.slice(2)
if (!shape || !process.env.AI_SOCIETY_SCRATCH_RUN)
  throw Error(
    "Usage via heavy-job: intermediate-case.js <new-output> <exe> <lock> <trusted-hash> <2000|5000> <giant|skewed> [2k-proof-root]",
  )
const size = Number(sizeArg)
const previous = []
if (size === 5000) {
  if (!previousRoot) throw Error("2k proof root required")
  for (const s of INTERMEDIATE.shapes) {
    const dir = join(previousRoot, `2000-${s}`)
    const exit = JSON.parse(await readFile(`${dir}-exit.json`, "utf8"))
    if (exit.code !== 0) throw Error("successful actual 2k child exit required")
    previous.push(JSON.parse(await readFile(join(dir, "diagnostic-result.json"), "utf8")))
  }
}
admitIntermediate(size, shape, previous, lockHash)
const output = resolve(outputArg)
await mkdir(output)
const root = await mkdtemp(join(process.env.TMPDIR, "ak5583-intermediate-"))
const samples = [],
  resourceSamples = []
let host,
  cleanup,
  failure,
  monitor,
  busy = false,
  resourceFailure = null,
  interrupted = false
const stopSafely = async () => {
  try {
    if (host) return await host.stop()
  } catch (error) {
    failure ??= `stop failed: ${String(error)}`
    process.exitCode = 1
    return { status: "indeterminate", error: String(error) }
  }
}
const interrupt = () => {
  interrupted = true
  failure ??= "interrupted"
  process.exitCode = 1
  void stopSafely()
}
process.on("SIGTERM", interrupt)
process.on("SIGINT", interrupt)
try {
  const frozen = await verifyFreeze(lockPath, lockHash, executable)
  if (interrupted) throw Error("interrupted before host launch")
  host = await launchHost(root, executable)
  if (interrupted) throw Error("interrupted during host launch")
  if (host.owned.scriptHash !== frozen.scriptHash) throw Error("installed subject drift")
  const checkResources = async () => {
    if (busy || resourceFailure) return
    busy = true
    try {
      const snapshot = { at: new Date().toISOString(), ...(await resources(host.owned.pid)) }
      resourceSamples.push(snapshot)
      await appendFile(join(root, "resource-samples.jsonl"), JSON.stringify(snapshot) + "\n")
      assertResources(snapshot)
    } catch (error) {
      resourceFailure = String(error)
      await json(join(root, "resource-stop.json"), { error: resourceFailure }).catch(() => {})
      await stopSafely()
    } finally {
      busy = false
    }
  }
  await checkResources()
  if (resourceFailure) throw Error(resourceFailure)
  monitor = setInterval(() => void checkResources(), 1000)
  const config = {
    size,
    shape,
    seed: INTERMEDIATE.seed,
    output: root,
    retainFullFixture: false,
    timerQuantumMs: host.clock.timerQuantumMs,
  }
  const fixture = await host.evaluate(
    `(${prepareNativeCase.toString()})(${JSON.stringify(config)},${makeDescriptors.toString()},${expectedRows.toString()},${sceneProjection.toString()},${settleUntilStable.toString()},${expectedFrontOrder.toString()})`,
  )
  await json(join(root, "diagnostic-provenance.json"), {
    purpose: INTERMEDIATE.id,
    sourceHash: frozen.sourceHash,
    scriptHash: frozen.scriptHash,
    lockHash,
    config,
    fixture,
    host: host.owned,
    policy: INTERMEDIATE,
    claim:
      "one seeded process per size/shape; exploratory subsamples, not independent baseline/control or causal allocation proof",
  })
  for (let index = 0; index < INTERMEDIATE.cycles; index++) {
    if (resourceFailure || interrupted) throw Error(resourceFailure ?? "interrupted")
    await host.evaluate(
      `(async()=>{const b=globalThis.__AK5583;if(b.effect!=='settled'||b.runtime())throw Error('reset requires settled closed manager');b.api.updateScene({elements:structuredClone(b.initialElements),appState:{selectedElementIds:{},selectedGroupIds:{}},captureUpdate:'NEVER'});b.expanded=[];await b.frame();await b.frame();b.equal(b.digest(b.sceneProjection(b.api.getSceneElements())),b.fixture.nativeInitialHash,'reset scene');})()`,
    )
    for (const operation of operationsForShape(shape)) {
      if (resourceFailure || interrupted) throw Error(resourceFailure ?? "interrupted")
      await host.focus()
      await json(join(root, "inflight.json"), {
        operation,
        index,
        effect: "indeterminate-until-response",
      })
      const packet = await host.evaluate(
        `(${runNativeOperation.toString()})(${JSON.stringify(operation)},${index})`,
      )
      validateNativePacket(packet)
      if (packet.counts.scene !== size) throw Error("diagnostic scene count differs")
      samples.push(packet)
    }
    console.log(`${size}/${shape}: cycle ${index + 1}/${INTERMEDIATE.cycles}`)
  }
  await checkResources()
  if (resourceFailure || interrupted) throw Error(resourceFailure ?? "interrupted")
  await host.verifyInstalled()
  await verifyFreeze(lockPath, lockHash, executable)
} catch (error) {
  failure = String(error)
  process.exitCode = 1
  await json(join(root, "failure.json"), {
    error: failure,
    resourceFailure,
    effect: "no replay; reconcile owned cleanup",
  }).catch(() => {})
} finally {
  clearInterval(monitor)
  while (busy) await new Promise((r) => setTimeout(r, 20))
  try {
    if (host) cleanup = await host.stop()
  } catch (error) {
    cleanup = { status: "indeterminate", error: String(error) }
  }
  if (!cleanup)
    cleanup = await readFile(join(root, "host-cleanup.json"), "utf8")
      .then(JSON.parse)
      .catch(() => ({ status: "indeterminate" }))
  if (cleanup.status !== "stopped" || interrupted || resourceFailure || samples.length !== 90) {
    failure ??= resourceFailure ?? "cleanup, interruption or sample inventory incomplete"
    process.exitCode = 1
  }
  const result = {
    purpose: INTERMEDIATE.id,
    size,
    shape,
    seed: INTERMEDIATE.seed,
    lockHash,
    status: failure ? "failed" : "passed",
    samples: samples.length,
    failure: failure ?? null,
    cleanup,
    peakRssMiB: resourceSamples.length ? Math.max(...resourceSamples.map((r) => r.rssMiB)) : null,
    maxOperationMs: samples.length
      ? Math.max(...samples.map((p) => p.timing.renderOpportunity))
      : null,
    claim: "exploratory only; original 192-case baseline remains incomplete",
  }
  for (const entry of await readdir(root, { withFileTypes: true }))
    if (entry.isFile() && entry.name !== "diagnostic-result.json")
      await cp(join(root, entry.name), join(output, entry.name))
  const retainResult = async () => {
    if (interrupted || failure) {
      result.status = "failed"
      result.failure = failure ?? "interrupted"
    }
    await json(join(root, "diagnostic-result.json"), result)
    await cp(join(root, "diagnostic-result.json"), join(output, "diagnostic-result.json"))
  }
  await retainResult()
  if (interrupted) {
    process.exitCode = 1
    await retainResult()
  }
  // Actual child exit0 is mandatory: even a signal after final serialization rejects admission.
  process.off("SIGTERM", interrupt)
  process.off("SIGINT", interrupt)
  console.log(`Retained diagnostic: ${output}`)
}
