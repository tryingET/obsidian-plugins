import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { buildLayerManagerBundle } from "./build.mjs"
import { packageRoot } from "./recoveryVerificationGate.mjs"
import { MANUAL_RELOAD_CHECKLIST, syncBundleToVault } from "./sync-to-vault.mjs"

const scriptPath = fileURLToPath(import.meta.url)

/**
 * @param {unknown} condition
 * @param {string} message
 * @returns {void}
 */
const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`[deploy-verify] ${message}`)
  }
}

export const verifyDeploymentWorkflow = async () => {
  const workspaceDir = await mkdtemp(resolve(tmpdir(), "lmx-deploy-verify-"))

  try {
    const target = resolve(workspaceDir, "vault/Excalidraw/Scripts/LayerManager.md")
    const deployRoot = resolve(workspaceDir, "deploy-receipts")
    const previousBundle = "/* previous bundle */\nconsole.log('old layer manager')\n"

    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, previousBundle, "utf8")

    const { outputFile } = await buildLayerManagerBundle({ projectRootOverride: packageRoot })
    const receipt = await syncBundleToVault({
      projectRootOverride: packageRoot,
      targetRaw: target,
      deployRootRaw: deployRoot,
      now: new Date("2026-04-14T00:00:00.000Z"),
      log: (message) => console.log(message),
    })

    const sourceText = await readFile(outputFile, "utf8")
    const targetText = await readFile(target, "utf8")
    assert(sourceText === targetText, "target bundle does not match freshly built output")

    assert(receipt.verified === true, "deployment receipt did not mark the copy as verified")
    assert(
      Boolean(receipt.backupPath),
      "expected verification to preserve the previous target as a backup",
    )
    assert(Boolean(receipt.rollbackCommand), "expected verification to record a rollback command")
    assert(
      receipt.rollbackCommand?.startsWith(
        `node -e "require('node:fs').copyFileSync(process.argv[1], process.argv[2])"`,
      ) === true,
      "expected rollback command to use the portable Node copy helper",
    )

    const backupPath = receipt.backupPath
    if (backupPath === null) {
      throw new Error("[deploy-verify] expected verification to preserve a readable backup path")
    }

    const backupText = await readFile(backupPath, "utf8")
    assert(
      backupText === previousBundle,
      "backup bundle did not preserve the previous target contents",
    )

    const targetDirectoryEntries = await readdir(dirname(target))
    assert(
      targetDirectoryEntries.every((entry) => !entry.endsWith(".tmp")),
      "deployment left a temporary bundle next to the live target",
    )

    const receiptRecord = JSON.parse(await readFile(receipt.receiptPath, "utf8"))
    assert(receiptRecord.target === target, "deployment receipt recorded the wrong target path")
    assert(
      JSON.stringify(receiptRecord.manualReloadChecklist) ===
        JSON.stringify(MANUAL_RELOAD_CHECKLIST),
      "deployment receipt lost the manual reload checklist",
    )

    console.log(
      `[deploy-verify] ok: safe deployment + reload receipt workflow verified via ${target}`,
    )
  } finally {
    await rm(workspaceDir, { recursive: true, force: true })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  await verifyDeploymentWorkflow()
}
