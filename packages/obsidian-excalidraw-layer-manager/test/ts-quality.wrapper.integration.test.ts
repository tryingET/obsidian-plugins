import { spawnSync } from "node:child_process"
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

const packagePath = "packages/obsidian-excalidraw-layer-manager"
// Keep developer diff context/prefix settings out of these fixture assertions.
const fixtureEnv = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" }
const originalSource = [
  'import { type Options, create } from "./dependency.js"',
  ...Array.from({ length: 40 }, (_, index) => `// separation ${index}`),
  "export const createRuntime = () => {",
  "  return create({ enabled: true })",
  "}",
  "",
].join("\n")
const importOnlySource = originalSource.replace("type Options, create", "create, type Options")
const bodyEditSource = originalSource.replace("enabled: true", "enabled: false")

let scratch: string
let repo: string
let packageRoot: string
let toolRoot: string

function put(path: string, content: string) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

function git(...args: string[]) {
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf8", env: fixtureEnv })
  if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`)
  return result.stdout.trim()
}

function commit(message: string) {
  git("add", ".")
  git("-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "commit", "-m", message)
}

function runWrapper(range?: string) {
  // This CLI is only a subprocess spy, not a substitute quality analyzer/verdict.
  return spawnSync("node", [join(packageRoot, "build/run-ts-quality.mjs")], {
    cwd: repo,
    encoding: "utf8",
    env: {
      ...fixtureEnv,
      LMX_TS_QUALITY_ROOT: toolRoot,
      LMX_TS_QUALITY_DIFF_RANGE: range ?? "",
    },
  })
}

function capturedReview() {
  const runtime = join(packageRoot, ".ts-quality/runtime")
  const config = JSON.parse(readFileSync(join(runtime, "ts-quality.runtime.config.json"), "utf8"))
  const diff = readFileSync(join(runtime, "changes.diff"), "utf8")
  return { config, diff }
}

// Assert the emitted Git hunk coordinates directly, without replicating ts-quality policy.
function addedSpans(diff: string) {
  return [...diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)].map((match) => {
    const start = Number(match[1])
    return { start, end: start + Number(match[2] ?? 1) - 1 }
  })
}

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "lmx-ts-quality-wrapper-"))
  repo = join(scratch, "repo")
  packageRoot = join(repo, packagePath)
  toolRoot = join(scratch, "tool")
  mkdirSync(join(packageRoot, "build"), { recursive: true })
  copyFileSync(
    new URL("../build/run-ts-quality.mjs", import.meta.url),
    join(packageRoot, "build/run-ts-quality.mjs"),
  )
  copyFileSync(
    new URL("../ts-quality.base.config.json", import.meta.url),
    join(packageRoot, "ts-quality.base.config.json"),
  )
  put(join(packageRoot, "src/main.ts"), originalSource)
  put(join(repo, "packages/sibling/src/main.ts"), originalSource)
  put(join(repo, ".gitignore"), ".ts-quality/\n")
  put(
    join(toolRoot, "dist/packages/ts-quality/src/cli.js"),
    'console.log("CLI_SPY " + JSON.stringify({ cwd: process.cwd(), args: process.argv.slice(2) }))\n',
  )
  git("init")
  git("config", "user.name", "Wrapper Test")
  git("config", "user.email", "wrapper@example.invalid")
  commit("baseline")
})

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true })
})

describe("ts-quality wrapper monorepo diff coordinates", () => {
  it.each(["worktree", "staged", "last commit", "explicit range"])(
    "keeps import-only hunks package-relative and outside the runtime factory (%s)",
    (mode) => {
      put(join(packageRoot, "src/main.ts"), importOnlySource)
      put(join(repo, "packages/sibling/src/main.ts"), bodyEditSource)
      if (mode === "staged") git("add", ".")
      if (mode === "last commit" || mode === "explicit range") commit("imports")
      const range = mode === "explicit range" ? "  HEAD^   HEAD  " : undefined
      const result = runWrapper(range)
      expect(result.status, result.stderr).toBe(0)
      expect(result.stdout).toContain("changed-files=1")
      expect(result.stdout).toContain(
        `diff-range=${range?.trim() ?? (mode === "last commit" ? "HEAD^ HEAD" : "HEAD (worktree)")}`,
      )
      const { config, diff } = capturedReview()
      expect(config.changeSet).toEqual({
        files: ["src/main.ts"],
        diffFile: ".ts-quality/runtime/changes.diff",
      })
      expect(config.policy).toEqual({
        maxChangedCrap: 30,
        minMutationScore: 0.5,
        minMergeConfidence: 60,
      })
      expect(diff).toContain("diff --git a/src/main.ts b/src/main.ts")
      expect(diff).toContain("--- a/src/main.ts\n+++ b/src/main.ts")
      expect(diff).not.toContain("packages/")
      expect(addedSpans(diff)).toEqual([{ start: 1, end: 4 }])
      expect(addedSpans(diff).every((span) => span.end < 42)).toBe(true)
      const spyLine = result.stdout.split("\n").find((line) => line.startsWith("CLI_SPY "))
      expect(JSON.parse(spyLine?.slice(8) ?? "null")).toEqual({
        cwd: packageRoot,
        args: [
          "check",
          "--root",
          ".",
          "--config",
          ".ts-quality/runtime/ts-quality.runtime.config.json",
        ],
      })
    },
  )

  it("keeps a body-edit hunk on the affected factory, including an explicit historical range", () => {
    put(join(packageRoot, "src/main.ts"), bodyEditSource)
    commit("body edit")
    const reviewedHead = git("rev-parse", "HEAD")
    put(join(repo, "README.md"), "later unrelated docs\n")
    commit("docs")
    const result = runWrapper(`${reviewedHead}^ ${reviewedHead}`)
    expect(result.status, result.stderr).toBe(0)
    const { config, diff } = capturedReview()
    expect(config.changeSet.files).toEqual(["src/main.ts"])
    expect(diff).toContain("+++ b/src/main.ts")
    expect(diff).toContain("+  return create({ enabled: false })")
    expect(addedSpans(diff).some((span) => span.start <= 43 && span.end >= 43)).toBe(true)
  })

  it("removes stale runtime artifacts and skips a range without package source changes", () => {
    put(join(packageRoot, "src/main.ts"), importOnlySource)
    expect(runWrapper().status).toBe(0)
    expect(existsSync(join(packageRoot, ".ts-quality/runtime/changes.diff"))).toBe(true)
    git("restore", ".")
    put(join(repo, "README.md"), "docs only\n")
    commit("docs")
    const result = runWrapper()
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain(
      "No changed package source files for range HEAD^ HEAD; skipping.",
    )
    expect(result.stdout).not.toContain("CLI_SPY")
    expect(existsSync(join(packageRoot, ".ts-quality/runtime"))).toBe(false)
  })

  it("skips a clean initial commit without claiming a quality verdict", () => {
    const result = runWrapper()
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain("No diff range available; skipping ts-quality change review.")
    expect(result.stdout).not.toContain("CLI_SPY")
  })

  it("rejects an invalid explicit range rather than substituting a default", () => {
    const result = runWrapper("missing-revision HEAD")
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("failed with exit")
    expect(result.stdout).not.toContain("CLI_SPY")
  })

  it("retains external CLI process-exit propagation", () => {
    put(join(packageRoot, "src/main.ts"), bodyEditSource)
    put(join(toolRoot, "dist/packages/ts-quality/src/cli.js"), "process.exit(7)\n")
    expect(runWrapper().status).toBe(7)
  })
})
