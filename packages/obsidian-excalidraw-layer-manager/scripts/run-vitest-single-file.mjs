#!/usr/bin/env node
import { spawn } from "node:child_process"
import { createRequire } from "node:module"
import path from "node:path"

const require = createRequire(import.meta.url)
const vitestPackageJsonPath = require.resolve("vitest/package.json")
const vitestEntrypoint = path.join(path.dirname(vitestPackageJsonPath), "vitest.mjs")

const args = process.argv.slice(2)
if (args.length === 0) {
  console.error("Usage: node scripts/run-vitest-single-file.mjs <vitest args...>")
  process.exit(1)
}

const child = spawn(process.execPath, [vitestEntrypoint, "run", "--no-file-parallelism", ...args], {
  stdio: "inherit",
  env: process.env,
})

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 1)
})
