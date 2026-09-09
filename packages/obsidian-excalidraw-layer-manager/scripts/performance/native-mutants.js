// Deliberate fault proof in fresh disposable hosts. Never candidate/baseline measurements.
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
import { json, launchHost } from "./native-host.js"
import { validateNativePacket } from "./native-packet.js"
import { prepareNativeCase, runNativeOperation } from "./native-page.js"
import { settleUntilStable } from "./native-settlement.js"

const [outputArg, executable] = process.argv.slice(2)
if (!outputArg || !executable)
  throw Error("new artifact directory and Obsidian executable required")
const output = resolve(outputArg)
await mkdir(output)
const scripts = dirname(fileURLToPath(import.meta.url)),
  evaluatorInputs = await treeInventory(scripts)
await json(join(output, "evaluator-inputs.json"), evaluatorInputs)
const results = []
for (const mutant of ["no-op", "dropped-row", "stale-cache", "check-bypass"]) {
  const artifact = join(output, mutant)
  await mkdir(artifact)
  const root = await mkdtemp(join(process.env.TMPDIR, `ak5583-mutant-`))
  let host,
    cleanup,
    failure = null
  try {
    host = await launchHost(root, executable)
    const config = {
      size: 1000,
      shape: "ten",
      seed: 558301,
      output: root,
      timerQuantumMs: host.clock.timerQuantumMs,
    }
    await host.evaluate(
      `(${prepareNativeCase.toString()})(${JSON.stringify(config)},${makeDescriptors.toString()},${expectedRows.toString()},${sceneProjection.toString()},${settleUntilStable.toString()},${expectedFrontOrder.toString()})`,
    )
    validateNativePacket(await host.evaluate(`(${runNativeOperation.toString()})('open',0)`))
    const injection = await host.evaluate(`(()=>{
      const b=globalThis.__AK5583, rt=b.runtime();b.config.mutant=${JSON.stringify(mutant)};
      if(b.config.mutant==='no-op') rt.commands.renameNode=async()=>({status:'applied'});
      if(b.config.mutant==='stale-cache'){const frozen=rt.getSnapshot();rt.getSnapshot=()=>frozen;}
      return {mutant:b.config.mutant,version:rt.getSnapshot().version,scene:b.api.getSceneElements().length};
    })()`)
    await json(join(root, "injection.json"), injection)
    const operation = mutant === "stale-cache" ? "external" : "rename"
    const sample = await host.evaluate(
      `(${runNativeOperation.toString()})(${JSON.stringify(operation)},1)`,
    )
    await json(join(root, "mutant-sample.json"), sample)
    let rejection
    try {
      validateNativePacket(sample)
    } catch (error) {
      rejection = String(error)
    }
    const exactFault =
      mutant === "check-bypass"
        ? sample.status === "passed" &&
          sample.checks.length === 0 &&
          rejection?.includes("mandatory checks")
        : mutant === "dropped-row"
          ? sample.error?.includes("rows-exact")
          : sample.error?.includes("settlement timeout") &&
            (mutant === "no-op"
              ? sample.tails.actual !== sample.tails.expected
              : sample.tails.actual === sample.tails.expected &&
                sample.tails.runtime !== sample.tails.expected)
    if (!rejection || !exactFault)
      throw Error(`mutant survived or failed for an unrelated reason: ${mutant}`)
    await host.verifyInstalled()
    await verifyTree(scripts, evaluatorInputs)
    results.push({ mutant, status: "killed", rejection, native: true, diagnosticOnly: true })
    await json(join(root, "mutant-result.json"), results.at(-1))
    console.log(`${mutant}: killed by independent oracle`)
  } catch (error) {
    failure = String(error)
    process.exitCode = 1
    results.push({ mutant, status: "invalid-proof", error: String(error) })
    await json(join(root, "failure.json"), results.at(-1)).catch(() => {})
  } finally {
    try {
      if (host) cleanup = await host.stop()
    } catch (error) {
      cleanup = { status: "indeterminate", error: String(error) }
    }
    if (!cleanup || !["stopped", "already-absent"].includes(cleanup.status)) {
      process.exitCode = 1
      failure ??= "cleanup not verified"
    }
    await json(join(root, "closeout.json"), { failure, cleanup: cleanup ?? null }).catch(() => {})
    for (const entry of await readdir(root, { withFileTypes: true }))
      if (entry.isFile()) await cp(join(root, entry.name), join(artifact, entry.name))
  }
  if (process.exitCode) break
}
await json(join(output, "summary.json"), {
  protocolVersion: 2,
  status:
    results.length === 4 && results.every((r) => r.status === "killed") && !process.exitCode
      ? "passed"
      : "failed",
  results,
  nativeBaselineComplete: false,
})
