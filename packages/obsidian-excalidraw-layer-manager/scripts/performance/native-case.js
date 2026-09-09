// One admitted native workload/process pass. Invoke via native-matrix.js, not sync:vault.
import { appendFile, cp, mkdir, mkdtemp, readdir, readFile } from "node:fs/promises"
import { join, resolve } from "node:path"
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
import { NATIVE_POLICY } from "./native-policy.js"
import { admitSize, RESOURCE_LIMITS } from "./native-safety.js"
import { settleUntilStable } from "./native-settlement.js"
import { operationsForShape } from "./native-summary.js"

const [outputArg, executable, lockPath, lockHash, configJson] = process.argv.slice(2)
if (!outputArg || !executable || !lockPath || !lockHash || !configJson)
  throw Error("Use native-matrix.js: artifact executable lock trusted-hash case-config required")
const input = JSON.parse(configJson)
const holdout = input.role === "holdout",
  expectedPass = holdout ? 0 : NATIVE_POLICY.trainingSeeds.indexOf(input.seed)
if (
  !["baseline", "calibration", "holdout"].includes(input.role) ||
  !NATIVE_POLICY.sizes.includes(input.size) ||
  !NATIVE_POLICY.shapes.includes(input.shape) ||
  !(holdout ? NATIVE_POLICY.holdoutSeeds : NATIVE_POLICY.trainingSeeds).includes(input.seed) ||
  input.pass !== expectedPass
)
  throw Error("unfrozen v2 case")
const samples = holdout ? NATIVE_POLICY.semanticHoldoutSamples : NATIVE_POLICY.timingSamplesPerBlock
const output = resolve(outputArg)
await mkdir(output)
const root = await mkdtemp(join(process.env.TMPDIR, "ak5583-case-"))
let host,
  cleanup,
  failure,
  monitor,
  monitorBusy = false,
  resourceFailure = null
const envelopes = []
let interrupted = null
const interrupt = (signal) => {
  interrupted = signal
  resourceFailure = `interrupted: ${signal}`
  if (host) void host.stop()
}
const onTerm = () => interrupt("SIGTERM"),
  onInt = () => interrupt("SIGINT")
process.on("SIGTERM", onTerm)
process.on("SIGINT", onInt)
try {
  const frozen = await verifyFreeze(lockPath, lockHash, executable)
  if (interrupted) throw Error(interrupted)
  host = await launchHost(root, executable)
  if (interrupted) throw Error(interrupted)
  if (host.owned.scriptHash !== frozen.scriptHash)
    throw Error("installed script differs from frozen subject")
  const admission = {
    completedSizes: input.previousSizes,
    pilotPassed: input.pilotPassed,
    effect: "settled",
  }
  admitSize(input.size, { ...admission, ...(await resources(host.owned.pid)) })
  const checkResources = async () => {
    if (monitorBusy || resourceFailure) return
    monitorBusy = true
    try {
      const snapshot = { at: new Date().toISOString(), ...(await resources(host.owned.pid)) }
      await appendFile(join(root, "resource-samples.jsonl"), JSON.stringify(snapshot) + "\n")
      if (
        snapshot.rssMiB >= RESOURCE_LIMITS.rssMiB ||
        snapshot.availableMiB < RESOURCE_LIMITS.availableMiB
      )
        throw Error("sampled native resource limit")
    } catch (error) {
      resourceFailure = String(error)
      await json(join(root, "resource-stop.json"), { error: resourceFailure }).catch(() => {})
      await host.stop()
    } finally {
      monitorBusy = false
    }
  }
  monitor = setInterval(() => void checkResources(), 1000)
  await checkResources()
  const config = {
    size: input.size,
    shape: input.shape,
    seed: input.seed,
    output: root,
    retainFullFixture: false,
    timerQuantumMs: host.clock.timerQuantumMs,
  }
  const fixture = await host.evaluate(
    `(${prepareNativeCase.toString()})(${JSON.stringify(config)},${makeDescriptors.toString()},${expectedRows.toString()},${sceneProjection.toString()},${settleUntilStable.toString()},${expectedFrontOrder.toString()})`,
  )
  await json(join(root, "case-provenance.json"), {
    input,
    lockHash,
    sourceHash: frozen.sourceHash,
    scriptHash: frozen.scriptHash,
    fixture,
    host: host.owned,
    resourcePolicy: RESOURCE_LIMITS,
  })
  for (let index = 0; index < samples; index++) {
    // Fixture reset is not timed. Never reuse a failed/indeterminate operation.
    await host.evaluate(
      `(async()=>{const b=globalThis.__AK5583;if(b.effect!=='settled'||b.runtime())throw Error('reset requires settled closed manager');b.api.updateScene({elements:structuredClone(b.initialElements),appState:{selectedElementIds:{},selectedGroupIds:{}},captureUpdate:'NEVER'});b.expanded=[];await b.frame();await b.frame();b.equal(b.digest(b.sceneProjection(b.api.getSceneElements())),b.fixture.nativeInitialHash,'reset scene');})()`,
    )
    for (const operation of operationsForShape(input.shape)) {
      if (resourceFailure) throw Error(resourceFailure)
      await host.focus()
      await json(join(root, "inflight.json"), {
        operation,
        index,
        state: "dispatched",
        effect: "indeterminate-until-response",
      })
      const packet = await host.evaluate(
        `(${runNativeOperation.toString()})(${JSON.stringify(operation)},${index})`,
      )
      validateNativePacket(packet)
      const envelope = {
        role: input.role,
        sourceHash: frozen.sourceHash,
        scriptHash: frozen.scriptHash,
        lockHash,
        cell: { size: input.size, shape: input.shape, seed: input.seed, operation },
        processPass: `${input.size}-${input.shape}-${input.seed}-${input.role}-${input.pass}`,
        index,
        hostNonce: host.owned.nonce,
        packet,
      }
      envelopes.push(envelope)
      await appendFile(join(root, "envelopes.jsonl"), JSON.stringify(envelope) + "\n")
    }
    console.log(
      `${input.size}/${input.shape}/${input.seed}/${input.role}/${input.pass}: sample ${index + 1}/${samples}`,
    )
  }
  if (resourceFailure) throw Error(resourceFailure)
  await host.verifyInstalled()
  await verifyFreeze(lockPath, lockHash, executable)
} catch (error) {
  failure = String(error)
  process.exitCode = 1
  await json(join(root, "failure.json"), {
    error: failure,
    resourceFailure,
    effect: "indeterminate until owned cleanup; no replay",
    at: new Date().toISOString(),
  }).catch(() => {})
} finally {
  clearInterval(monitor)
  while (monitorBusy) await new Promise((r) => setTimeout(r, 20))
  try {
    if (host) cleanup = await host.stop()
  } catch (error) {
    cleanup = { status: "indeterminate", error: String(error) }
  }
  if (!cleanup)
    cleanup = await readFile(join(root, "host-cleanup.json"), "utf8")
      .then(JSON.parse)
      .catch(() => ({ status: "indeterminate", reason: "no cleanup receipt" }))
  if (!["stopped", "already-absent"].includes(cleanup.status)) {
    failure ??= "cleanup not verified"
    process.exitCode = 1
  }
  if (resourceFailure) {
    failure ??= resourceFailure
    process.exitCode = 1
  }
  const expected = samples * operationsForShape(input.shape).length
  if (envelopes.length !== expected) {
    failure ??= "incomplete native sample inventory"
    process.exitCode = 1
  }
  await json(join(root, "case-result.json"), {
    status: failure ? "failed" : "passed",
    input,
    lockHash,
    expected,
    observed: envelopes.length,
    failure: failure ?? null,
    cleanup,
    resourceFailure,
  }).catch(() => {})
  for (const entry of await readdir(root, { withFileTypes: true }))
    if (entry.isFile()) await cp(join(root, entry.name), join(output, entry.name))
  console.log(`Retained ${output}`)
  process.off("SIGTERM", onTerm)
  process.off("SIGINT", onInt)
}
