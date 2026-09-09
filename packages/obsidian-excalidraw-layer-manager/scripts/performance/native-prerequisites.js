// Small controller, NOT a heavy-job child: executes each native prerequisite through its owner.
import { spawn } from "node:child_process"
import { mkdir, open, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const [outputArg, executable] = process.argv.slice(2)
if (!outputArg || !executable || process.env.AI_SOCIETY_SCRATCH_RUN)
  throw Error(
    "Usage outside heavy-job: native-prerequisites.js <new-output-root> <owned-executable>",
  )
const output = resolve(outputArg),
  scripts = dirname(fileURLToPath(import.meta.url))
await mkdir(output)
const jobs = [
  ["sentinels", "native-run.js", [join(scripts, "native-sentinels.js")]],
  ["pilot", "native-evaluate.js", []],
  ["mutants", "native-mutants.js", []],
]
for (const [kind, script, extra] of jobs) {
  const target = join(output, kind),
    startedAt = new Date().toISOString()
  const argv = [
    "run",
    "--label",
    `ak5583-${kind}`,
    "--task",
    "5583",
    "--defer-retained-age",
    "run-1788137699-9655c994d9827ead",
    "--retention-decision",
    "154",
    "--",
    "node",
    join(scripts, script),
    target,
    executable,
    ...extra,
  ]
  const log = await open(join(output, `${kind}-driver.txt`), "wx")
  let child, exit
  const stop = () => child?.kill("SIGTERM")
  process.on("SIGTERM", stop)
  process.on("SIGINT", stop)
  try {
    exit = await new Promise((yes, no) => {
      child = spawn("heavy-job", argv, { stdio: ["ignore", log.fd, log.fd] })
      child.once("error", no)
      child.once("exit", (code, signal) => yes({ code, signal }))
    })
  } catch (error) {
    exit = { code: null, signal: null, error: String(error) }
  } finally {
    await log.close()
    process.off("SIGTERM", stop)
    process.off("SIGINT", stop)
  }
  const receipt = {
    schema: "ak5583-prerequisite-exit-v1",
    kind,
    output: target,
    pid: child?.pid ?? null,
    ...exit,
    startedAt,
    completedAt: new Date().toISOString(),
    command: "heavy-job",
    argv,
  }
  await writeFile(join(output, `${kind}-exit.json`), JSON.stringify(receipt, null, 2) + "\n", {
    flag: "wx",
  })
  if (exit.code !== 0 || exit.signal) {
    process.exitCode = 1
    break
  }
  console.log(`${kind}: controller observed child exit 0`)
}
