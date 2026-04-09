import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

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

  it("routes full checks through the recovery gate before deadcode", () => {
    expect(packageJson.scripts?.["verify:recovery"]).toBe("node build/recoveryVerificationGate.mjs")
    expect(packageJson.scripts?.["check:full"]).toBe("npm run verify:recovery && npm run deadcode")
  })
})
