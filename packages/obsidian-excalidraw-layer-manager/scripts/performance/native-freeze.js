// Read-only byte identity boundary. Caller/AK pins the lock hash; same-user files are not a sandbox.
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { lstat, readdir, readFile, realpath, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import { NATIVE_POLICY } from "./native-policy.js"
import { RESOURCE_LIMITS } from "./native-safety.js"

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const repoRoot = resolve(packageRoot, "../..")
export const bytesHash = (bytes) => createHash("sha256").update(bytes).digest("hex")
export async function fileHash(path) {
  const hash = createHash("sha256")
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest("hex")
}
async function files(root, prefix = "") {
  const result = []
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const path = join(prefix, entry.name)
    if (entry.isSymbolicLink()) throw Error(`frozen inventory symlink: ${path}`)
    if (entry.isDirectory()) result.push(...(await files(root, path)))
    else if (entry.isFile()) result.push(path)
  }
  return result.sort()
}
export async function treeInventory(root) {
  return Object.fromEntries(
    await Promise.all(
      (await files(root)).map(async (path) => [path, await fileHash(join(root, path))]),
    ),
  )
}
export async function verifyTree(root, expected) {
  const actual = await treeInventory(root)
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw Error("frozen tree changed: additions, removals or bytes")
}
async function inventory() {
  return {
    source: await treeInventory(join(packageRoot, "src")),
    evaluator: await treeInventory(join(packageRoot, "scripts/performance")),
    tests: await treeInventory(join(packageRoot, "test/performance")),
    lock: await fileHash(join(repoRoot, "package-lock.json")),
    hostSeed: {
      drawing: await fileHash(join(repoRoot, "apps/lab-vault/testing.md")),
      settings: await fileHash(
        join(repoRoot, "apps/lab-vault/.obsidian/plugins/obsidian-excalidraw-plugin/data.json"),
      ),
    },
  }
}
export async function createFreeze(executable) {
  const identities = await inventory(),
    binary = await realpath(executable)
  const bundle = await build({
    entryPoints: [join(packageRoot, "src/main.ts")],
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    target: ["es2022"],
    legalComments: "none",
    sourcemap: false,
    charset: "utf8",
  })
  return {
    schema: "ak5583-native-freeze-v2",
    createdAt: new Date().toISOString(),
    head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim(),
    identities,
    sourceHash: bytesHash(JSON.stringify({ source: identities.source, lock: identities.lock })),
    scriptHash: bytesHash(bundle.outputFiles[0].text),
    binary,
    binaryHash: await fileHash(binary),
    appAsarHash: await fileHash(join(dirname(binary), "resources/obsidian.asar")),
    contract: NATIVE_POLICY,
    resources: RESOURCE_LIMITS,
    semantics:
      "exact ordered full semantic scene excluding version/versionNonce/updated/index; exact native DTO, row IDs/labels/depth/expansion, canvas/runtime/DOM selection, stable two-rAF opportunities; no physical-input or display-presentation claim",
    samplePolicy:
      "3 training seeds as matched independent process blocks per size/shape/role; ten samples/block incl two excluded retained warmups; two separate full-grid semantic holdout seeds, one cycle/cell; fixture reset outside timing; serial counterbalanced roles; 144 timing plus48 semantic hosts required",
    nativeComparison:
      "v2 fixed hybrid absolute/relative matched-control median budgets; descriptive p95 with catastrophic guard; same source or same built script rejected; fixed large-UI aggregate must exceed20percent and paired noise; fresh held-out timing confirmation mandatory; no win implementation in this baseline task",
    holdoutPolicy:
      "958301/958302 reserved for evaluation, never tuning; this same-UID repository does not enforce secrecy",
  }
}
export async function verifyFreeze(lockPath, expectedHash, executable) {
  const bytes = await readFile(lockPath)
  if (bytesHash(bytes) !== expectedHash) throw Error("trusted evaluator lock hash mismatch")
  const lock = JSON.parse(bytes)
  if (lock.schema !== "ak5583-native-freeze-v2") throw Error("unknown frozen lock schema")
  if (JSON.stringify(await inventory()) !== JSON.stringify(lock.identities))
    throw Error("frozen evaluator/source/tests/dependency lock drift")
  const binary = await realpath(executable)
  if (
    binary !== lock.binary ||
    (await fileHash(binary)) !== lock.binaryHash ||
    (await fileHash(join(dirname(binary), "resources/obsidian.asar"))) !== lock.appAsarHash
  )
    throw Error("native binary drift")
  return lock
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [output, executable] = process.argv.slice(2)
  if (!output || !executable)
    throw Error("Usage: native-freeze.js <new-lock.json> <obsidian-executable>")
  if (
    await lstat(output).catch((error) => {
      if (error.code === "ENOENT") return null
      throw error
    })
  )
    throw Error("never overwrite a freeze")
  const bytes = `${JSON.stringify(await createFreeze(executable), null, 2)}\n`
  await writeFile(output, bytes, { flag: "wx" })
  console.log(JSON.stringify({ lock: resolve(output), sha256: bytesHash(bytes) }))
}
