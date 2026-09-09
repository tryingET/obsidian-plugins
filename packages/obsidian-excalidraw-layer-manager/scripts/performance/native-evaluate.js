// Native pilot CLI; not an optimization runner. All launched hosts are disposable.
import { cp, mkdir, mkdtemp, readdir } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
  expectedFrontOrder,
  expectedRows,
  makeDescriptors,
  sceneProjection,
} from "./native-fixture.js"
import { treeInventory, verifyTree } from "./native-freeze.js"
import { json, launchHost, resources } from "./native-host.js"
import { validateNativePacket } from "./native-packet.js"
import { prepareNativeCase, runNativeOperation } from "./native-page.js"
import { admitSize } from "./native-safety.js"
import { settleUntilStable } from "./native-settlement.js"

const [outputArg, executable] = process.argv.slice(2)
if (!outputArg || !executable)
  throw Error("Usage: native-evaluate.js <new-artifact-dir> <obsidian-executable>")
const output = resolve(outputArg)
await mkdir(output)
const root = await mkdtemp(join(process.env.TMPDIR, "ak5583-pilot-"))
let host, cleanup, failure
const scripts = dirname(fileURLToPath(import.meta.url)),
  evaluatorInputs = await treeInventory(scripts)
await json(join(root, "evaluator-inputs.json"), evaluatorInputs)
try {
  host = await launchHost(root, executable)
  const resource = await resources(host.owned.pid)
  admitSize(1000, { ...resource, completedSizes: [], pilotPassed: false, effect: "settled" })
  await json(join(root, "resource-admission.json"), resource)
  const config = {
    size: 1000,
    shape: "ten",
    seed: 558301,
    output: root,
    timerQuantumMs: host.clock.timerQuantumMs,
  }
  const fixture = await host.evaluate(
    `(${prepareNativeCase.toString()})(${JSON.stringify(config)},${makeDescriptors.toString()},${expectedRows.toString()},${sceneProjection.toString()},${settleUntilStable.toString()},${expectedFrontOrder.toString()})`,
  )
  await json(join(root, "fixture-summary.json"), fixture)
  const operations = [
    "external-closed",
    "open",
    "select",
    "expand",
    "rename",
    "external",
    "reorder",
    "collapse",
    "close",
  ]
  for (const [index, operation] of operations.entries()) {
    await host.focus()
    await json(join(root, "inflight.json"), {
      operation,
      index,
      state: "dispatched",
      effect: "indeterminate-until-response",
    })
    const sample = await host.evaluate(
      `(${runNativeOperation.toString()})(${JSON.stringify(operation)},${index})`,
    )
    await json(join(root, `operation-${index}-${operation}.json`), sample)
    validateNativePacket(sample)
    const resource = await resources(host.owned.pid)
    await json(join(root, `resource-${index}.json`), resource)
    admitSize(1000, { ...resource, completedSizes: [], pilotPassed: false, effect: "settled" })
    console.log(
      `${operation}: ${sample.timing.renderOpportunity.toFixed(1)}ms (${sample.counts.scene} scene / ${sample.counts.rows} rows)`,
    )
  }
  await host.verifyInstalled()
  await verifyTree(scripts, evaluatorInputs)
  await json(join(root, "pilot-result.json"), {
    status: "passed",
    protocolVersion: 2,
    native: true,
    fixture,
    operations,
    claim:
      "development 1k rectangular pilot only; not a frozen matrix baseline or native mixed/undo/save proof",
  })
} catch (error) {
  failure = String(error)
  process.exitCode = 1
  await json(join(root, "failure.json"), {
    error: failure,
    effect: "indeterminate until cleanup; failed sample excluded, no retry",
    at: new Date().toISOString(),
  }).catch(() => {})
} finally {
  try {
    if (host) cleanup = await host.stop()
  } catch (error) {
    cleanup = { status: "indeterminate", error: String(error) }
    process.exitCode = 1
  }
  if (!cleanup || !["stopped", "already-absent"].includes(cleanup.status)) process.exitCode = 1
  await json(join(root, "closeout.json"), {
    failure: failure ?? null,
    cleanup: cleanup ?? null,
    nativeBaselineComplete: false,
  }).catch(() => {})
  for (const entry of await readdir(root, { withFileTypes: true }))
    if (entry.isFile()) await cp(join(root, entry.name), join(output, entry.name))
  console.log(`Evidence retained: ${output}`)
}
