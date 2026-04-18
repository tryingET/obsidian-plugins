import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const scriptPath = fileURLToPath(import.meta.url)
const packageRoot = resolve(dirname(scriptPath), "..")
const repoRoot = resolve(packageRoot, "..", "..")
const packageRootFromRepo = relative(repoRoot, packageRoot).replaceAll("\\", "/")
const tsQualityRoot = process.env.LMX_TS_QUALITY_ROOT
  ? resolve(process.env.LMX_TS_QUALITY_ROOT)
  : resolve(packageRoot, "..", "..", "..", "ts-quality")
const tsQualityCliPath = resolve(tsQualityRoot, "dist/packages/ts-quality/src/cli.js")
const baseConfigPath = resolve(packageRoot, "ts-quality.base.config.json")
const runtimeDir = resolve(packageRoot, ".ts-quality/runtime")
const runtimeConfigPath = resolve(runtimeDir, "ts-quality.runtime.config.json")
const runtimeDiffPath = resolve(runtimeDir, "changes.diff")

/** @param {string} command @param {string[]} args */
const runText = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status ?? "unknown"}`)
  }

  return result.stdout
}

/** @param {string} command @param {string[]} args */
const runStatus = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "ignore",
  })

  if (result.error) {
    throw result.error
  }

  return result.status ?? 1
}

const resolveDiffRangeArgs = () => {
  const explicitRange = process.env.LMX_TS_QUALITY_DIFF_RANGE?.trim()
  if (explicitRange) {
    return {
      label: explicitRange,
      args: explicitRange.split(/\s+/g),
    }
  }

  const worktreeDirty =
    runStatus("git", ["diff", "--quiet", "HEAD", "--", `${packageRootFromRepo}/src`]) !== 0

  if (worktreeDirty) {
    return {
      label: "HEAD (worktree)",
      args: ["HEAD"],
    }
  }

  const hasParent = runStatus("git", ["rev-parse", "--verify", "HEAD^"]) === 0
  if (hasParent) {
    return {
      label: "HEAD^ HEAD",
      args: ["HEAD^", "HEAD"],
    }
  }

  return null
}

const ensureTsQualityBuilt = () => {
  if (existsSync(tsQualityCliPath)) {
    return
  }

  throw new Error(
    `[quality:ts] Missing ts-quality CLI build at ${tsQualityCliPath}. Build ../../owned/ts-quality first or set LMX_TS_QUALITY_ROOT.`,
  )
}

const main = async () => {
  ensureTsQualityBuilt()

  const diffRange = resolveDiffRangeArgs()
  if (!diffRange) {
    console.log("[quality:ts] No diff range available; skipping ts-quality change review.")
    return
  }

  const diffArgs = ["diff", ...diffRange.args, "--", `${packageRootFromRepo}/src`]
  const changedFileOutput = runText("git", [
    "diff",
    "--name-only",
    ...diffRange.args,
    "--",
    `${packageRootFromRepo}/src`,
  ])
  const changedFiles = changedFileOutput
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(`${packageRootFromRepo}/`, ""))

  if (changedFiles.length === 0) {
    await rm(runtimeDir, { recursive: true, force: true })
    console.log(
      `[quality:ts] No changed package source files for range ${diffRange.label}; skipping.`,
    )
    return
  }

  const diffText = runText("git", diffArgs)
  const baseConfig = JSON.parse(await readFile(baseConfigPath, "utf8"))
  const runtimeConfig = {
    ...baseConfig,
    changeSet: {
      files: changedFiles,
      diffFile: ".ts-quality/runtime/changes.diff",
    },
  }

  await mkdir(runtimeDir, { recursive: true })
  await writeFile(runtimeDiffPath, diffText, "utf8")
  await writeFile(runtimeConfigPath, `${JSON.stringify(runtimeConfig, null, 2)}\n`, "utf8")

  console.log(`[quality:ts] diff-range=${diffRange.label}`)
  console.log(`[quality:ts] changed-files=${changedFiles.length}`)

  const result = spawnSync(
    "node",
    [
      tsQualityCliPath,
      "check",
      "--root",
      ".",
      "--config",
      ".ts-quality/runtime/ts-quality.runtime.config.json",
    ],
    {
      cwd: packageRoot,
      stdio: "inherit",
      env: process.env,
    },
  )

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

await main()
