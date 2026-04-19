import { createHash } from "node:crypto"
import { constants } from "node:fs"
import { access, copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { basename, dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import {
  DEFAULT_DEPLOY_RECEIPTS_RELATIVE_PATH,
  DEFAULT_OBSIDIAN_SKRIPTE_TARGET_PATH,
} from "../layer-manager.config.mjs"
import { LAYER_MANAGER_BUNDLE_FILENAME } from "./recoveryVerificationGate.mjs"

const scriptPath = fileURLToPath(import.meta.url)
const projectRoot = process.cwd()
const defaultSourceRelativePath = `dist/${LAYER_MANAGER_BUNDLE_FILENAME}`

/**
 * @typedef {{
 *   backupPath: string,
 *   backupHash: string,
 * }} ExistingTargetBackup
 */

/**
 * @typedef {{
 *   deployedAt: string,
 *   source: string,
 *   target: string,
 *   sourceHash: string,
 *   targetHash: string,
 *   verified: true,
 *   backupPath: string | null,
 *   backupHash: string | null,
 *   receiptPath: string,
 *   deployRoot: string,
 *   rollbackCommand: string | null,
 *   manualReloadChecklist: readonly string[],
 * }} SyncReceipt
 */

/**
 * @typedef {{
 *   projectRootOverride?: string,
 *   sourceRelativePath?: string,
 *   targetRaw?: string,
 *   deployRootRaw?: string,
 *   now?: Date,
 *   log?: (message: string) => void,
 * }} SyncBundleToVaultOptions
 */

export const MANUAL_RELOAD_CHECKLIST = [
  "Open an Excalidraw drawing in the target vault before re-running LayerManager.",
  "Re-run LayerManager so the fresh bundle disposes the previous runtime and mounts a new one.",
  "If the fresh run fails, restore the previous bundle from the recorded backup path and re-run LayerManager.",
]

/**
 * @param {string} targetPath
 * @returns {string}
 */
const normalizeLegacyWindowsDrivePath = (targetPath) => {
  if (process.platform !== "win32") {
    return targetPath
  }

  const drivePathMatch = targetPath.match(/^\/([a-zA-Z])\/(.+)$/)
  if (!drivePathMatch) {
    return targetPath
  }

  const [, drive, remainder] = drivePathMatch
  return `${drive.toUpperCase()}:/${remainder}`
}

/**
 * @param {string} projectRootOverride
 * @param {string} targetPath
 * @returns {string}
 */
const resolveProjectPath = (projectRootOverride, targetPath) => {
  const normalizedPath = normalizeLegacyWindowsDrivePath(targetPath)
  if (isAbsolute(normalizedPath)) {
    return normalizedPath
  }

  return resolve(projectRootOverride, normalizedPath)
}

/**
 * @param {string} path
 * @returns {Promise<boolean>}
 */
const pathExists = async (path) => {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

/**
 * @param {string} path
 * @param {string} label
 * @returns {Promise<void>}
 */
const assertPathExists = async (path, label) => {
  if (await pathExists(path)) {
    return
  }

  throw new Error(
    `[sync] Missing ${label}: ${path}\nRun "npm run build" first or use "npm run bundle:and:sync".`,
  )
}

/**
 * @param {string} path
 * @returns {Promise<string>}
 */
const hashFile = async (path) => {
  const buffer = await readFile(path)
  return createHash("sha256").update(buffer).digest("hex")
}

/**
 * @param {Date} now
 * @returns {string}
 */
const createWorkspaceName = (now) => `${now.toISOString().replace(/[:.]/g, "-")}-pid${process.pid}`

/**
 * @param {{ target: string, workspaceDir: string }} input
 * @returns {Promise<ExistingTargetBackup | null>}
 */
const backupExistingTarget = async ({ target, workspaceDir }) => {
  if (!(await pathExists(target))) {
    return null
  }

  const backupPath = resolve(workspaceDir, "previous", basename(target))
  await mkdir(dirname(backupPath), { recursive: true })
  await copyFile(target, backupPath)

  return {
    backupPath,
    backupHash: await hashFile(backupPath),
  }
}

/**
 * @param {{ backupPath: string, target: string }} input
 * @returns {string}
 */
const buildRollbackCommand = ({ backupPath, target }) => {
  return `node -e "require('node:fs').copyFileSync(process.argv[1], process.argv[2])" ${JSON.stringify(backupPath)} ${JSON.stringify(target)}`
}

/**
 * @param {{ source: string, target: string, workspaceName: string, sourceHash: string }} input
 * @returns {Promise<void>}
 */
const swapVerifiedBundleIntoTarget = async ({ source, target, workspaceName, sourceHash }) => {
  const temporaryTarget = resolve(dirname(target), `.${basename(target)}.${workspaceName}.tmp`)

  try {
    await copyFile(source, temporaryTarget)

    const temporaryTargetHash = await hashFile(temporaryTarget)
    if (temporaryTargetHash !== sourceHash) {
      throw new Error(
        `[sync] Verification failed: temporary target hash mismatch for ${temporaryTarget}`,
      )
    }

    try {
      await rename(temporaryTarget, target)
    } catch (error) {
      const errorCode =
        error && typeof error === "object" && "code" in error
          ? /** @type {NodeJS.ErrnoException} */ (error).code
          : undefined

      if (errorCode !== "EEXIST" && errorCode !== "EPERM") {
        throw error
      }

      await rm(target, { force: true })
      await rename(temporaryTarget, target)
    }
  } finally {
    if (await pathExists(temporaryTarget)) {
      await rm(temporaryTarget, { force: true })
    }
  }
}

/**
 * @param {SyncBundleToVaultOptions} [options]
 * @returns {Promise<SyncReceipt>}
 */
export const syncBundleToVault = async ({
  projectRootOverride = projectRoot,
  sourceRelativePath = defaultSourceRelativePath,
  targetRaw = process.env.LMX_VAULT_TARGET ?? DEFAULT_OBSIDIAN_SKRIPTE_TARGET_PATH,
  deployRootRaw = process.env.LMX_DEPLOY_ROOT ?? DEFAULT_DEPLOY_RECEIPTS_RELATIVE_PATH,
  now = new Date(),
  log = console.log,
} = {}) => {
  const source = resolve(projectRootOverride, sourceRelativePath)
  const target = resolveProjectPath(projectRootOverride, targetRaw)
  const deployRoot = resolveProjectPath(projectRootOverride, deployRootRaw)

  await assertPathExists(source, "bundle output")
  await mkdir(deployRoot, { recursive: true })

  const workspaceDir = resolve(deployRoot, createWorkspaceName(now))
  await mkdir(workspaceDir, { recursive: true })

  const backup = await backupExistingTarget({ target, workspaceDir })

  await mkdir(dirname(target), { recursive: true })

  const sourceHash = await hashFile(source)
  await swapVerifiedBundleIntoTarget({
    source,
    target,
    workspaceName: basename(workspaceDir),
    sourceHash,
  })

  const targetHash = await hashFile(target)
  if (sourceHash !== targetHash) {
    throw new Error(`[sync] Verification failed: target hash mismatch for ${target}`)
  }

  const receiptPath = resolve(workspaceDir, "deployment-receipt.json")
  /** @type {SyncReceipt} */
  const receipt = {
    deployedAt: now.toISOString(),
    source,
    target,
    sourceHash,
    targetHash,
    verified: true,
    backupPath: backup?.backupPath ?? null,
    backupHash: backup?.backupHash ?? null,
    receiptPath,
    deployRoot,
    rollbackCommand: backup
      ? buildRollbackCommand({
          backupPath: backup.backupPath,
          target,
        })
      : null,
    manualReloadChecklist: MANUAL_RELOAD_CHECKLIST,
  }

  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8")

  log(`[sync] Copied ${source} -> ${target}`)
  if (backup) {
    log(`[sync] Backed up previous target -> ${backup.backupPath}`)
  } else {
    log("[sync] No previous target existed; rollback starts from the deployment receipt only.")
  }
  log(`[sync] Verified copied bundle sha256=${targetHash}`)
  log(`[sync] Wrote deployment receipt -> ${receiptPath}`)
  log(`[sync] Reload workflow: ${MANUAL_RELOAD_CHECKLIST.join(" ")}`)

  return receipt
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  await syncBundleToVault()
}
