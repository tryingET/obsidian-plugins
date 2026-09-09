import { basename } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const io = vi.hoisted(() => ({
  mkdir: vi.fn(),
  mkdtemp: vi.fn(),
  readdir: vi.fn(),
  readFile: vi.fn(),
  appendFile: vi.fn(),
  cp: vi.fn(),
  json: vi.fn(),
  launch: vi.fn(),
  evaluate: vi.fn(),
  stop: vi.fn(),
  resources: vi.fn(),
  focus: vi.fn(),
  verifyInstalled: vi.fn(),
}))
vi.mock("node:fs/promises", () => ({ ...io }))
vi.mock("../../scripts/performance/native-host.js", () => ({
  json: io.json,
  launchHost: io.launch,
  resources: io.resources,
}))
vi.mock("../../scripts/performance/native-freeze.js", () => ({
  verifyFreeze: async () => ({ sourceHash: "source", scriptHash: "subject" }),
}))
vi.mock("../../scripts/performance/native-packet.js", () => ({ validateNativePacket: vi.fn() }))
vi.mock("../../scripts/performance/native-page.js", () => ({
  prepareNativeCase: function fixtureStub() {},
  runNativeOperation: function operationStub() {},
}))

const root = "/mock-heavy/intermediate",
  output = "/mock-evidence/2000-giant"
const saved: Record<string, unknown> = {},
  retained: Record<string, unknown> = {}
const original = {
  argv: process.argv,
  exitCode: process.exitCode,
  tmp: process.env["TMPDIR"],
  run: process.env["AI_SOCIETY_SCRATCH_RUN"],
}
const stopAttempts: { handled: boolean }[] = []
const unhandled: unknown[] = []
let mode = "",
  signal: (() => void) | undefined,
  tick: (() => void) | undefined,
  fired = false
const onUnhandled = (error: unknown) => {
  unhandled.push(error)
}
const turn = () => new Promise<void>((resolve) => setImmediate(resolve))

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  mode = ""
  fired = false
  signal = undefined
  tick = undefined
  stopAttempts.length = 0
  unhandled.length = 0
  for (const key of Object.keys(saved)) delete saved[key]
  for (const key of Object.keys(retained)) delete retained[key]
  process.argv = [
    "node",
    "intermediate-case.js",
    output,
    "/never-executed-host",
    "/mock-lock",
    "a".repeat(64),
    "2000",
    "giant",
  ]
  process.exitCode = undefined
  process.env["TMPDIR"] = "/mock-heavy"
  process.env["AI_SOCIETY_SCRATCH_RUN"] = "mock-admission"
  process.on("unhandledRejection", onUnhandled)
  const originalOn = process.on.bind(process)
  vi.spyOn(process, "on").mockImplementation((event, listener) => {
    if (event === "SIGTERM" || event === "SIGINT") {
      signal = listener as () => void
      return process
    }
    return originalOn(event, listener)
  })
  vi.spyOn(globalThis, "setInterval").mockImplementation(((callback: () => void) => {
    tick = callback
    return { mock: true }
  }) as unknown as typeof setInterval)
  vi.spyOn(globalThis, "clearInterval").mockImplementation(() => {})
  io.mkdtemp.mockResolvedValue(root)
  io.launch.mockResolvedValue({
    owned: { pid: 123, scriptHash: "subject" },
    clock: { timerQuantumMs: 0.1 },
    evaluate: io.evaluate,
    stop: io.stop,
    focus: io.focus,
    verifyInstalled: io.verifyInstalled,
  })
  io.resources.mockResolvedValue({ rssMiB: 1000, availableMiB: 10000, pids: [123] })
  io.stop.mockImplementation(() => {
    const attempt = { handled: false }
    stopAttempts.push(attempt)
    if (mode === "late-signal") return Promise.resolve({ status: "stopped" })
    // A rejecting thenable reveals whether the caller consumes the failure; ignored
    // interrupt requests must not be hidden by a catch supplied by this test.
    const failure = Error("injected stop rejection")
    return {
      // biome-ignore lint/suspicious/noThenProperty: intentional rejecting thenable measures caller rejection consumption.
      then(yes: (value: never) => unknown, no: (reason: Error) => unknown) {
        attempt.handled = true
        return Promise.reject(failure).then(yes, no)
      },
      catch(no: (reason: Error) => unknown) {
        attempt.handled = true
        return Promise.reject(failure).catch(no)
      },
    }
  })
  io.evaluate.mockImplementation(async (expression: string) => {
    if (!expression.includes("operationStub")) return {}
    if (!fired && mode !== "late-signal") {
      fired = true
      if (mode === "interrupt-stop") signal?.()
      else {
        io.resources.mockResolvedValue({ rssMiB: 8193, availableMiB: 10000, pids: [123] })
        tick?.()
      }
      await turn()
      throw Error("injected stopped page")
    }
    saved[`${root}/raw-samples.jsonl`] = "mock native packet bytes"
    return { counts: { scene: 2000 }, timing: { renderOpportunity: 10 } }
  })
  io.json.mockImplementation(async (path: string, body: unknown) => {
    saved[path] = structuredClone(body)
  })
  io.appendFile.mockImplementation(async (path: string, body: string) => {
    saved[path] = body
  })
  io.readFile.mockImplementation(async (path: string) => {
    if (!(path in saved)) throw Error("missing mock receipt")
    return JSON.stringify(saved[path])
  })
  io.readdir.mockImplementation(async () =>
    Object.keys(saved).map((path) => ({ name: basename(path), isFile: () => true })),
  )
  io.cp.mockImplementation(async (source: string, target: string) => {
    if (mode === "late-signal" && !fired) {
      fired = true
      signal?.()
    }
    retained[target] = structuredClone(saved[source])
  })
})
afterEach(() => {
  process.removeListener("unhandledRejection", onUnhandled)
  vi.restoreAllMocks()
  process.argv = original.argv
  process.exitCode = original.exitCode
  for (const [key, value] of [
    ["TMPDIR", original.tmp],
    ["AI_SOCIETY_SCRATCH_RUN", original.run],
  ] as const)
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
})
async function run() {
  await import(new URL("../../scripts/performance/intermediate-case.js", import.meta.url).href)
  await turn()
}

describe("Given the actual intermediate driver with no native, network or filesystem effects", () => {
  it("When interruption arrives during final copying Then failed exit and retained failed result forbid5k admission", async () => {
    mode = "late-signal"
    await run()
    expect(fired).toBe(true)
    expect(process.exitCode).toBe(1)
    expect(retained[`${output}/diagnostic-result.json`]).toMatchObject({ status: "failed" })
    expect(retained[`${output}/raw-samples.jsonl`]).toBe("mock native packet bytes")
  })
  it("When interrupted stop rejects Then consume every rejection and retain indeterminate cleanup", async () => {
    mode = "interrupt-stop"
    await run()
    expect(stopAttempts.length).toBeGreaterThanOrEqual(2)
    expect(stopAttempts.every((attempt) => attempt.handled)).toBe(true)
    expect(unhandled).toEqual([])
    expect(process.exitCode).toBe(1)
    expect(retained[`${output}/diagnostic-result.json`]).toMatchObject({
      status: "failed",
      cleanup: { status: "indeterminate" },
    })
  })
  it("When resource-watchdog stop rejects Then no interval rejection escapes and failure artifacts survive", async () => {
    mode = "watchdog-stop"
    await run()
    expect(unhandled).toEqual([])
    expect(process.exitCode).toBe(1)
    expect(retained[`${output}/resource-stop.json`]).toBeDefined()
    expect(retained[`${output}/diagnostic-result.json`]).toMatchObject({
      status: "failed",
      cleanup: { status: "indeterminate" },
    })
  })
})
