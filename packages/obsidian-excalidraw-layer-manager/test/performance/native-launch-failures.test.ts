import { EventEmitter } from "node:events"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const io = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  realpath: vi.fn(),
  mkdir: vi.fn(),
  cp: vi.fn(),
  open: vi.fn(),
  readlink: vi.fn(),
  symlink: vi.fn(),
  unlink: vi.fn(),
  close: vi.fn(),
  spawn: vi.fn(),
  stop: vi.fn(),
  build: vi.fn(),
}))
vi.mock("node:fs/promises", () => ({ ...io }))
vi.mock("node:child_process", () => ({ spawn: io.spawn, execFileSync: vi.fn(), execFile: vi.fn() }))
vi.mock("esbuild", () => ({ build: io.build }))
vi.mock("../../scripts/performance/native-process.js", () => ({ stopOwnedProcess: io.stop }))

import { launchHost } from "../../scripts/performance/native-host.js"

const root = "/owned-heavy-scratch/case",
  profile = `${root}/profile`
let mode = "",
  emitted: EventEmitter & {
    pid: number | undefined
    exitCode: number | null
    signalCode: string | null
  }
const originalTmp = process.env["TMPDIR"]
const saved: Record<string, unknown> = {}

beforeEach(() => {
  vi.resetAllMocks()
  mode = ""
  for (const key of Object.keys(saved)) delete saved[key]
  process.env["TMPDIR"] = "/owned-heavy-scratch"
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw Error("unexpected real network path")
    }),
  )
  io.realpath.mockImplementation(async (path: string) => path)
  io.open.mockResolvedValue({ fd: 99, close: io.close })
  io.close.mockResolvedValue(undefined)
  io.readlink.mockResolvedValue(root)
  io.stop.mockResolvedValue({ status: "stopped", reason: "mock exact identity absent" })
  io.build.mockResolvedValue({ outputFiles: [{ text: "subject-bundle" }] })
  io.readFile.mockImplementation(async (path: string) => {
    if (path.endsWith("host-deps.json"))
      return JSON.stringify({ baseUrl: "https://invalid/", files: {} })
    if (path.endsWith("data.json")) return "{}"
    if (path.endsWith("/stat")) {
      if (mode.startsWith("identity")) throw Error("injected process identity read failure")
      return `123 (obsidian) ${Array.from({ length: 20 }, (_, i) => (i === 19 ? "777" : "0")).join(" ")}`
    }
    if (path.endsWith("/cmdline")) return `obsidian\0--user-data-dir=${profile}\0`
    if (path.endsWith("DevToolsActivePort")) return ""
    throw Error(`unexpected read ${path}`)
  })
  io.writeFile.mockImplementation(async (path: string, data: string) => {
    if (path.endsWith("owned-process.json") && mode.startsWith("owned-write"))
      throw Error("injected owned-process write failure")
    if (path.endsWith("launch-failure.json") && mode.endsWith("report-fails"))
      throw Error("injected launch failure report write failure")
    saved[path] = data.startsWith("{") ? JSON.parse(data) : data
  })
  io.spawn.mockImplementation(() => {
    emitted = Object.assign(new EventEmitter(), {
      pid: mode === "spawn-error" ? undefined : 123,
      exitCode: mode === "early-exit" ? 1 : null,
      signalCode: null,
    })
    queueMicrotask(() =>
      mode === "spawn-error"
        ? emitted.emit("error", Error("injected spawn failure"))
        : emitted.emit("spawn"),
    )
    return emitted
  })
})
afterEach(() => {
  if (originalTmp === undefined) delete process.env["TMPDIR"]
  else process.env["TMPDIR"] = originalTmp
  vi.unstubAllGlobals()
})

describe("Given launchHost owns only a fresh injected native process", () => {
  it("When spawn emits an error Then retain launch failure and no-child cleanup, close log and release only its alias", async () => {
    mode = "spawn-error"
    await expect(launchHost(root, "/never-executed-obsidian")).rejects.toThrow(
      "injected spawn failure",
    )
    expect(saved[`${root}/launch-failure.json`]).toMatchObject({
      error: "Error: injected spawn failure",
    })
    expect(saved[`${root}/host-cleanup.json`]).toMatchObject({ status: "already-absent" })
    expect(io.stop).not.toHaveBeenCalled()
    expect(io.close).toHaveBeenCalledOnce()
    expect(io.unlink).toHaveBeenCalledOnce()
    expect(io.spawn).toHaveBeenCalledOnce()
  })
  it("When the child exits before CDP appears Then reconcile the captured identity without replay", async () => {
    mode = "early-exit"
    await expect(launchHost(root, "/never-executed-obsidian")).rejects.toThrow(
      "owned host exited 1/null",
    )
    expect(io.stop).toHaveBeenCalledWith(
      expect.objectContaining({ pid: 123, pgid: 123, start: "777", profile }),
    )
    expect(saved[`${root}/host-cleanup.json`]).toMatchObject({ status: "stopped" })
    expect(io.close).toHaveBeenCalledOnce()
    expect(io.spawn).toHaveBeenCalledOnce()
  })
  it("When identity capture fails Then do not signal an unverified PID or delete its alias; retain indeterminate cleanup", async () => {
    mode = "identity"
    await expect(launchHost(root, "/never-executed-obsidian")).rejects.toThrow(
      "identity read failure",
    )
    expect(saved[`${root}/host-cleanup.json`]).toMatchObject({ status: "indeterminate", pid: 123 })
    expect(io.stop).not.toHaveBeenCalled()
    expect(io.unlink).not.toHaveBeenCalled()
    expect(io.close).toHaveBeenCalledOnce()
  })
  it.each(["owned-write", "owned-write-report-fails"])(
    "When %s fails Then cleanup still uses the in-memory owned identity and original launch failure escapes",
    async (failure) => {
      mode = failure
      await expect(launchHost(root, "/never-executed-obsidian")).rejects.toThrow(
        "owned-process write failure",
      )
      expect(io.stop).toHaveBeenCalledWith(expect.objectContaining({ pid: 123, start: "777" }))
      expect(saved[`${root}/host-cleanup.json`]).toMatchObject({ status: "stopped" })
      expect(io.close).toHaveBeenCalledOnce()
      expect(io.unlink).toHaveBeenCalledOnce()
      if (failure.endsWith("report-fails"))
        expect(saved[`${root}/launch-failure.json`]).toBeUndefined()
    },
  )
  it("When owned stop itself rejects Then never report stopped or remove the alias", async () => {
    mode = "owned-write"
    io.stop.mockRejectedValue(Error("injected stop failure"))
    await expect(launchHost(root, "/never-executed-obsidian")).rejects.toThrow(
      "owned-process write failure",
    )
    expect(saved[`${root}/host-cleanup.json`]).toMatchObject({
      status: "indeterminate",
      error: "Error: injected stop failure",
    })
    expect(io.unlink).not.toHaveBeenCalled()
    expect(io.close).toHaveBeenCalledOnce()
  })
})
