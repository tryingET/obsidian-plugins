import { spawnSync } from "node:child_process"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

export const RECOVERY_PACKAGE_DOCS_PATH = "packages/obsidian-excalidraw-layer-manager/docs"
export const DOCS_LIST_SCRIPT = "/home/tryinget/ai-society/core/agent-scripts/scripts/docs-list.mjs"

const scriptPath = fileURLToPath(import.meta.url)
const buildRoot = dirname(scriptPath)
export const packageRoot = resolve(buildRoot, "..")
export const repoRoot = resolve(packageRoot, "..", "..")

export const createRecoveryVerificationPlan = ({
  docsTouched = false,
  packageRootOverride = packageRoot,
  repoRootOverride = repoRoot,
} = {}) => {
  const plan = [
    {
      name: "check:fast",
      command: "npm",
      args: ["run", "check:fast"],
      cwd: packageRootOverride,
    },
    {
      name: "test",
      command: "npm",
      args: ["test"],
      cwd: packageRootOverride,
    },
    {
      name: "arch",
      command: "npm",
      args: ["run", "arch"],
      cwd: packageRootOverride,
    },
  ]

  if (docsTouched) {
    plan.push({
      name: "docs:strict",
      command: "node",
      args: [DOCS_LIST_SCRIPT, "--docs", RECOVERY_PACKAGE_DOCS_PATH, "--strict"],
      cwd: repoRootOverride,
    })
  }

  return plan
}

export const detectPackageDocsTouched = ({ repoRootOverride = repoRoot } = {}) => {
  const result = spawnSync("git", ["status", "--short", "--", RECOVERY_PACKAGE_DOCS_PATH], {
    cwd: repoRootOverride,
    encoding: "utf8",
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(
      `git status failed for ${RECOVERY_PACKAGE_DOCS_PATH} (exit ${result.status ?? "unknown"}).`,
    )
  }

  return result.stdout.trim().length > 0
}

export const runRecoveryVerificationPlan = (plan) => {
  for (const step of plan) {
    console.log(`[recovery-gate] ${step.name}`)
    const result = spawnSync(step.command, step.args, {
      cwd: step.cwd,
      stdio: "inherit",
    })

    if (result.error) {
      throw result.error
    }

    if (result.status !== 0) {
      process.exit(result.status ?? 1)
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  const docsTouched = detectPackageDocsTouched()
  const plan = createRecoveryVerificationPlan({ docsTouched })
  runRecoveryVerificationPlan(plan)
}
