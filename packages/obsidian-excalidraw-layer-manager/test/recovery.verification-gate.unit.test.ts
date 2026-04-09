import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

type RecoveryVerificationStep = {
  readonly name: string
  readonly command: string
  readonly args: readonly string[]
  readonly cwd: string
}

type RecoveryGateModule = {
  readonly DOCS_LIST_SCRIPT: string
  readonly RECOVERY_PACKAGE_DOCS_PATH: string
  readonly createRecoveryVerificationPlan: (options?: {
    readonly docsTouched?: boolean
    readonly packageRootOverride?: string
    readonly repoRootOverride?: string
  }) => RecoveryVerificationStep[]
  readonly detectPackageDocsTouched: (options?: {
    readonly repoRootOverride?: string
  }) => boolean
}

const loadRecoveryGateModule = async (): Promise<RecoveryGateModule> => {
  // @ts-ignore -- build/*.mjs utilities are runtime-tested without a typed TS surface.
  return import("../build/recoveryVerificationGate.mjs")
}

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as {
  scripts?: Record<string, string>
}

const tempDirs: string[] = []

const makeTempGitRepo = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "lmx-recovery-gate-"))
  tempDirs.push(dir)

  spawnSync("git", ["init"], { cwd: dir, stdio: "ignore" })
  spawnSync("git", ["config", "user.name", "Pi Test"], { cwd: dir, stdio: "ignore" })
  spawnSync("git", ["config", "user.email", "pi@example.com"], { cwd: dir, stdio: "ignore" })

  mkdirSync(join(dir, "packages/obsidian-excalidraw-layer-manager/docs"), { recursive: true })
  writeFileSync(
    join(dir, "packages/obsidian-excalidraw-layer-manager/docs/test.md"),
    "# Test\n",
    "utf8",
  )

  spawnSync("git", ["add", "."], { cwd: dir, stdio: "ignore" })
  spawnSync("git", ["commit", "-m", "init"], { cwd: dir, stdio: "ignore" })

  return dir
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

describe("recovery verification gate", () => {
  it("keeps the recovery baseline locked to fast checks, tests, then architecture", async () => {
    const { createRecoveryVerificationPlan } = await loadRecoveryGateModule()
    const plan = createRecoveryVerificationPlan({
      docsTouched: false,
      packageRootOverride: "/package-root",
      repoRootOverride: "/repo-root",
    })

    expect(plan).toEqual([
      {
        name: "check:fast",
        command: "npm",
        args: ["run", "check:fast"],
        cwd: "/package-root",
      },
      {
        name: "test",
        command: "npm",
        args: ["test"],
        cwd: "/package-root",
      },
      {
        name: "arch",
        command: "npm",
        args: ["run", "arch"],
        cwd: "/package-root",
      },
    ])
  })

  it("adds strict package-doc validation only when docs are touched", async () => {
    const { DOCS_LIST_SCRIPT, RECOVERY_PACKAGE_DOCS_PATH, createRecoveryVerificationPlan } =
      await loadRecoveryGateModule()
    const plan = createRecoveryVerificationPlan({
      docsTouched: true,
      packageRootOverride: "/package-root",
      repoRootOverride: "/repo-root",
    })

    expect(plan.at(-1)).toEqual({
      name: "docs:strict",
      command: "node",
      args: [DOCS_LIST_SCRIPT, "--docs", RECOVERY_PACKAGE_DOCS_PATH, "--strict"],
      cwd: "/repo-root",
    })
  })

  it("detects docs changes from the working tree", async () => {
    const { detectPackageDocsTouched } = await loadRecoveryGateModule()
    const repoRoot = makeTempGitRepo()

    writeFileSync(
      join(repoRoot, "packages/obsidian-excalidraw-layer-manager/docs/test.md"),
      "# Test\nupdated\n",
      "utf8",
    )

    expect(detectPackageDocsTouched({ repoRootOverride: repoRoot })).toBe(true)
  })

  it("stays false on clean checkouts with no doc changes", async () => {
    const { detectPackageDocsTouched } = await loadRecoveryGateModule()
    const repoRoot = makeTempGitRepo()

    expect(detectPackageDocsTouched({ repoRootOverride: repoRoot })).toBe(false)
  })

  it("detects docs changes relative to HEAD after a clean checkout baseline", async () => {
    const { detectPackageDocsTouched } = await loadRecoveryGateModule()
    const repoRoot = makeTempGitRepo()

    spawnSync(
      "git",
      ["checkout", "--", "packages/obsidian-excalidraw-layer-manager/docs/test.md"],
      {
        cwd: repoRoot,
        stdio: "ignore",
      },
    )

    writeFileSync(
      join(repoRoot, "packages/obsidian-excalidraw-layer-manager/docs/test.md"),
      "# Test\nupdated-again\n",
      "utf8",
    )

    expect(detectPackageDocsTouched({ repoRootOverride: repoRoot })).toBe(true)
  })

  it("routes full checks through the recovery gate before deadcode", () => {
    expect(packageJson.scripts?.["verify:recovery"]).toBe("node build/recoveryVerificationGate.mjs")
    expect(packageJson.scripts?.["check:full"]).toBe("npm run verify:recovery && npm run deadcode")
  })
})
