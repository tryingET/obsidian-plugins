import { basename } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const io = vi.hoisted(() => ({
  mkdir: vi.fn(),
  mkdtemp: vi.fn(),
  readdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  cp: vi.fn(),
  json: vi.fn(),
  launch: vi.fn(),
  evaluate: vi.fn(),
  stop: vi.fn(),
  verifyInstalled: vi.fn(),
  verifyTree: vi.fn(),
}))
vi.mock("node:fs/promises", () => ({ ...io }))
vi.mock("../../scripts/performance/native-host.js", () => ({
  json: io.json,
  launchHost: io.launch,
}))
vi.mock("../../scripts/performance/native-freeze.js", () => ({
  bytesHash: () => "mock-expression-hash",
  treeInventory: async () => ({ "native-run.js": "mock-script-hash" }),
  verifyTree: io.verifyTree,
}))
vi.mock("../../scripts/performance/native-sentinel-packet.js", () => ({
  validateSentinelReceipt: vi.fn(),
}))
vi.mock("../../scripts/performance/native-sentinels.js", () => ({
  default: function syntheticProbe() {
    return { status: "passed" }
  },
  buildNativeSentinelExpression: undefined,
  runNativeSentinels: undefined,
}))

const root = "/mock-heavy/ak5583-native-case",
  output = "/mock-evidence/native-case"
const saved: Record<string, unknown> = {},
  retained: Record<string, unknown> = {}
const original = { argv: process.argv, exitCode: process.exitCode, tmp: process.env["TMPDIR"] }
let mode = ""

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  mode = ""
  for (const key of Object.keys(saved)) delete saved[key]
  for (const key of Object.keys(retained)) delete retained[key]
  process.argv = [
    "node",
    "native-run.js",
    output,
    "/never-executed-obsidian",
    fileURLToPath(new URL("../../scripts/performance/native-sentinels.js", import.meta.url)),
  ]
  process.exitCode = undefined
  process.env["TMPDIR"] = "/mock-heavy"
  io.mkdtemp.mockResolvedValue(root)
  io.launch.mockResolvedValue({
    evaluate: io.evaluate,
    stop: io.stop,
    verifyInstalled: io.verifyInstalled,
  })
  io.evaluate.mockResolvedValue({ status: "passed", checks: ["mock native response"] })
  io.stop.mockResolvedValue({ status: "stopped" })
  io.json.mockImplementation(async (path: string, data: unknown) => {
    if (mode === "report-fails" && path.endsWith("failure.json"))
      throw Error("injected failure-report write failure")
    saved[path] = data
  })
  io.writeFile.mockImplementation(async (path: string, data: unknown) => {
    saved[path] = data
  })
  io.readFile.mockImplementation(async (path: string) => {
    if (!(path in saved)) throw Error("missing mock receipt")
    return JSON.stringify(saved[path])
  })
  io.readdir.mockImplementation(async () =>
    Object.keys(saved).map((path) => ({ name: basename(path), isFile: () => true })),
  )
  io.cp.mockImplementation(async (source: string, target: string) => {
    retained[target] = saved[source]
  })
})
afterEach(() => {
  process.argv = original.argv
  process.exitCode = original.exitCode
  if (original.tmp === undefined) delete process.env["TMPDIR"]
  else process.env["TMPDIR"] = original.tmp
})

async function runDriver() {
  // CLI module has no exported API; importing executes its real top-level driver.
  const driver = new URL("../../scripts/performance/native-run.js", import.meta.url).href
  await import(driver)
}

describe("Given the actual native-run driver with all host and filesystem effects injected", () => {
  it("When host.stop throws after a passed probe Then retain raw result and indeterminate closeout, exit unsuccessfully", async () => {
    io.stop.mockRejectedValue(Error("injected stop failure"))
    await runDriver()
    expect(process.exitCode).toBe(1)
    expect(retained[`${output}/result.json`]).toMatchObject({ status: "passed" })
    expect(retained[`${output}/closeout.json`]).toMatchObject({
      failure: null,
      cleanup: { status: "indeterminate", error: "Error: injected stop failure" },
      nativeMeasurementClaim: false,
    })
    expect(retained[`${output}/program-provenance.json`]).toBeDefined()
    expect(retained[`${output}/expression.txt`]).toBeTypeOf("string")
    expect(io.stop).toHaveBeenCalledOnce()
  })
  it("When failure-report writing throws Then still stop the host, retain the original failure in closeout and exit unsuccessfully", async () => {
    mode = "report-fails"
    io.evaluate.mockRejectedValue(Error("injected probe failure"))
    await runDriver()
    expect(process.exitCode).toBe(1)
    expect(retained[`${output}/failure.json`]).toBeUndefined()
    expect(retained[`${output}/closeout.json`]).toMatchObject({
      failure: "Error: injected probe failure",
      cleanup: { status: "stopped" },
    })
    expect(retained[`${output}/expression.txt`]).toBeTypeOf("string")
    expect(io.stop).toHaveBeenCalledOnce()
  })
  it("When launch throws after retaining cleanup Then use that receipt without claiming a returned host", async () => {
    io.launch.mockImplementation(async () => {
      saved[`${root}/host-cleanup.json`] = {
        status: "indeterminate",
        reason: "identity capture unavailable",
      }
      throw Error("injected launch failure")
    })
    await runDriver()
    expect(process.exitCode).toBe(1)
    expect(retained[`${output}/closeout.json`]).toMatchObject({
      failure: "Error: injected launch failure",
      cleanup: { status: "indeterminate" },
    })
    expect(retained[`${output}/host-cleanup.json`]).toMatchObject({ status: "indeterminate" })
    expect(io.stop).not.toHaveBeenCalled()
    expect(io.evaluate).not.toHaveBeenCalled()
  })
  it("When launch throws without a cleanup receipt Then preserve failure and treat cleanup as indeterminate", async () => {
    io.launch.mockRejectedValue(Error("injected launch failure"))
    await runDriver()
    expect(process.exitCode).toBe(1)
    expect(retained[`${output}/closeout.json`]).toMatchObject({
      failure: "Error: injected launch failure",
      cleanup: { status: "indeterminate", reason: "no cleanup receipt" },
    })
    expect(retained[`${output}/failure.json`]).toMatchObject({
      error: "Error: injected launch failure",
    })
  })
  it("When post-result integrity fails Then a semantic pass cannot make driver exit successfully", async () => {
    io.verifyInstalled.mockRejectedValue(Error("injected installed script drift"))
    await runDriver()
    expect(process.exitCode).toBe(1)
    expect(retained[`${output}/result.json`]).toMatchObject({ status: "passed" })
    expect(retained[`${output}/closeout.json`]).toMatchObject({
      failure: "Error: injected installed script drift",
      cleanup: { status: "stopped" },
    })
    expect(io.stop).toHaveBeenCalledOnce()
  })
})
