import { createHash } from "node:crypto"
import { constants } from "node:fs"
import { access, copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { basename, dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import {
  DEFAULT_DEPLOY_RECEIPTS_RELATIVE_PATH,
  DEFAULT_OBSIDIAN_SKRIPTE_TARGET_PATH,
  LAYER_MANAGER_BUNDLE_FILENAME,
} from "./recoveryVerificationGate.mjs"

const scriptPath = fileURLToPath(import.meta.url)
const projectRoot = process.cwd()
const defaultSourceRelativePath = `dist/${LAYER_MANAGER_BUNDLE_FILENAME}`

export const MANUAL_RELOAD_CHECKLIST = [
  "Open an Excalidraw drawing in the target vault before re-running LayerManager.",
  "Re-run LayerManager so the fresh bundle disposes the previous runtime and mounts a new one.",
  "If the fresh run fails, restore the previous bundle from the recorded backup path and re-run LayerManager.",
]

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

const resolveProjectPath = (projectRootOverride, targetPath) => {
  const normalizedPath = normalizeLegacyWindowsDrivePath(targetPath)
  if (isAbsolute(normalizedPath)) {
    return normalizedPath
  }

  return resolve(projectRootOverride, normalizedPath)
}

const pathExists = async (path) => {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

const assertPathExists = async (path, label) => {
  if (await pathExists(path)) {
    return
  }

  throw new Error(
    `[sync] Missing ${label}: ${path}\nRun "npm run build" first or use "npm run bundle:and:sync".`,
  )
}

const hashFile = async (path) => {
  const buffer = await readFile(path)
  return createHash("sha256").update(buffer).digest("hex")
}

const createWorkspaceName = (now) => `${now.toISOString().replace(/[:.]/g, "-")}-pid${process.pid}`

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

const buildRollbackCommand = ({ backupPath, target }) => {
  return `node -e "require('node:fs').copyFileSync(process.argv[1], process.argv[2])" ${JSON.stringify(backupPath)} ${JSON.stringify(target)}`
}

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
        error && typeof error === "object" && "code" in error ? error.code : undefined

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
