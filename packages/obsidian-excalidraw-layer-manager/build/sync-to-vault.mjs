import { constants } from "node:fs"
import { access, copyFile, mkdir } from "node:fs/promises"
import { dirname, isAbsolute, resolve } from "node:path"

const projectRoot = process.cwd()
const source = resolve(projectRoot, "dist/LayerManager.md")

const defaultTarget = "../../apps/lab-vault/Excalidraw/Scripts/LayerManager.md"

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

const resolveTargetPath = (targetPath) => {
  const normalizedPath = normalizeLegacyWindowsDrivePath(targetPath)
  if (isAbsolute(normalizedPath)) {
    return normalizedPath
  }

  return resolve(projectRoot, normalizedPath)
}

const assertPathExists = async (path, label) => {
  try {
    await access(path, constants.F_OK)
  } catch {
    throw new Error(
      `[sync] Missing ${label}: ${path}\nRun "npm run build" first or use "npm run bundle:and:sync".`,
    )
  }
}

const targetRaw = process.env.LMX_VAULT_TARGET ?? defaultTarget
const target = resolveTargetPath(targetRaw)

await assertPathExists(source, "bundle output")
await mkdir(dirname(target), { recursive: true })
await copyFile(source, target)

console.log(`[sync] Copied ${source} -> ${target}`)
