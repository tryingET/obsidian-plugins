// Development probe only, NOT a benchmark. Use under the admitted heavy-job wrapper.
import { cp, mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { bytesHash, treeInventory, verifyTree } from "./native-freeze.js"
import { json, launchHost } from "./native-host.js"
import { validateSentinelReceipt } from "./native-sentinel-packet.js"

const [outputArg, executable, program] = process.argv.slice(2)
if (!outputArg || !executable || !program)
  throw Error("artifact-dir, executable and browser-program required")
const output = resolve(outputArg)
await mkdir(output) // exclusive: never overwrite an earlier run
const root = await mkdtemp(join(process.env.TMPDIR, "ak5583-native-"))
let host, failure, cleanup
const scripts = dirname(fileURLToPath(import.meta.url)),
  evaluatorInputs = await treeInventory(scripts)
await json(join(root, "evaluator-inputs.json"), evaluatorInputs)
try {
  host = await launchHost(root, executable)
  const module = await import(pathToFileURL(resolve(program)).href)
  const probe = module.default ?? module.runNativeSentinels
  const expression = module.buildNativeSentinelExpression
    ? module.buildNativeSentinelExpression({ output: root })
    : `(${probe.toString()})(${JSON.stringify({ output: root })})`
  await writeFile(join(root, "expression.txt"), expression)
  await json(join(root, "program-provenance.json"), {
    program: resolve(program),
    expressionSha256: bytesHash(expression),
  })
  const result = await host.evaluate(expression)
  await json(join(root, "result.json"), result)
  if (!result || result.failed || result.status === "failed")
    throw Error(`native program failed: ${result?.failed ?? result?.error}`)
  if (module.runNativeSentinels) validateSentinelReceipt(result, module.requiredCheckNames)
  await host.verifyInstalled()
  await verifyTree(scripts, evaluatorInputs)
  console.log(JSON.stringify({ output, result }))
} catch (error) {
  failure = String(error)
  process.exitCode = 1
  await json(join(root, "failure.json"), {
    error: failure,
    effect: "indeterminate until cleanup; never replay same mutation",
    at: new Date().toISOString(),
  }).catch(() => {})
} finally {
  try {
    if (host) cleanup = await host.stop()
  } catch (error) {
    cleanup = { status: "indeterminate", error: String(error) }
  }
  if (!cleanup)
    cleanup = await readFile(join(root, "host-cleanup.json"), "utf8")
      .then(JSON.parse)
      .catch(() => ({ status: "indeterminate", reason: "no cleanup receipt" }))
  if (!["stopped", "already-absent"].includes(cleanup.status)) process.exitCode = 1
  await json(join(root, "closeout.json"), {
    failure: failure ?? null,
    cleanup,
    nativeMeasurementClaim: false,
  }).catch(() => {})
  for (const entry of await readdir(root, { withFileTypes: true }))
    if (entry.isFile()) await cp(join(root, entry.name), join(output, entry.name))
  console.log(`Retained evidence: ${output}`)
}
