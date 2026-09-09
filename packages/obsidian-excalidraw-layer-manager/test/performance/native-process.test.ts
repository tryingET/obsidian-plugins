import { describe, expect, it, vi } from "vitest"
// @ts-expect-error -- Pure JS process harness is runtime-tested; no TS declaration surface.
import { parseProcessIdentity, stopOwnedProcess } from "../../scripts/performance/native-process.js"

type Identity = {
  pid: number
  start: string
  pgid: number
  sid: number
  cmdline: string[]
  state?: string
}
const owned = { pid: 100, start: "12345", pgid: 100, profile: "/owned/run/profile" }
const leader = (): Identity => ({
  ...owned,
  sid: 100,
  cmdline: ["obsidian", `--user-data-dir=${owned.profile}`],
})
const member = (pid = 101): Identity => ({
  pid,
  start: "12346",
  pgid: 100,
  sid: 100,
  cmdline: ["obsidian", "--type=renderer"],
})
const error = (code: string) => Object.assign(new Error(code), { code })
const bounds = { termPolls: 2, killPolls: 2, pollMs: 1 }
function world(initial: Identity[] = [leader()]) {
  const processes = new Map(initial.map((p) => [p.pid, p]))
  const readIdentity = vi.fn(async (pid: number) => {
    const value = processes.get(pid)
    if (!value) throw error("ENOENT")
    return { ...value, cmdline: [...value.cmdline] }
  })
  const listGroup = vi.fn(async (pgid: number) =>
    [...processes.values()].filter((p) => p.pgid === pgid).map((p) => p.pid),
  )
  const signal = vi.fn(async (pid: number, _signal: string) => {
    processes.delete(pid)
  })
  const sleep = vi.fn(async (_ms: number) => {})
  return { processes, readIdentity, listGroup, signal, sleep }
}

describe("Given one identity-recorded disposable native process group", () => {
  it("When the verified TERM leader becomes a zombie Then await actual absence without signaling it again", async () => {
    const w = world()
    w.signal.mockImplementation(async () => {
      w.processes.set(100, { ...leader(), state: "Z", cmdline: [] })
    })
    w.sleep.mockImplementation(async () => {
      w.processes.delete(100)
    })
    expect((await stopOwnedProcess(owned, w, bounds)).status).toBe("stopped")
    expect(w.signal.mock.calls).toEqual([[100, "SIGTERM"]])
    expect(w.sleep).toHaveBeenCalled()
  })
  it("When a verified zombie persists Then retain indeterminate evidence and never KILL it", async () => {
    const w = world()
    w.signal.mockImplementation(async () => {
      w.processes.set(100, { ...leader(), state: "Z", cmdline: [] })
    })
    const result = await stopOwnedProcess(owned, w, bounds)
    expect(result.status).toBe("indeterminate")
    expect(result.remaining).toMatchObject([{ pid: 100, state: "Z", cmdlineEmpty: true }])
    expect(w.sleep).toHaveBeenCalledTimes(4)
    expect(w.signal.mock.calls).toEqual([[100, "SIGTERM"]])
  })
  it.each([
    "initial",
    "pre-term",
    "non-zombie",
    "wrong-profile",
    "start",
    "pgid",
    "sid",
    "unknown-child",
  ])(
    "When zombie reconciliation sees %s Then no extra signaling or ownership widening",
    async (mode) => {
      const z = { ...leader(), state: "Z", cmdline: [] as string[] }
      if (mode === "non-zombie") z.state = "S"
      if (mode === "wrong-profile") z.cmdline = ["--user-data-dir=/foreign"]
      if (mode === "start") z.start = "99999"
      if (mode === "pgid") z.pgid = 999
      if (mode === "sid") z.sid = 999
      const w = world(mode === "initial" ? [z] : [leader()])
      if (mode === "pre-term") {
        let reads = 0
        w.readIdentity.mockImplementation(async () => (++reads === 1 ? leader() : z))
      }
      w.signal.mockImplementation(async () => {
        w.processes.set(100, z)
        if (mode === "unknown-child") w.processes.set(102, member(102))
      })
      const result = await stopOwnedProcess(owned, w, bounds)
      expect(result.status).toBe(
        ["initial", "pre-term"].includes(mode) ? "blocked" : "indeterminate",
      )
      expect(w.signal.mock.calls).toEqual(
        ["initial", "pre-term"].includes(mode) ? [] : [[100, "SIGTERM"]],
      )
    },
  )
  it("When a tracked child becomes zombie immediately before KILL Then skip the signal and await absence", async () => {
    const w = world([leader(), member()])
    let childReads = 0
    w.readIdentity.mockImplementation(async (pid) => {
      const p = w.processes.get(pid)
      if (!p) throw error("ENOENT")
      if (pid === 101 && ++childReads >= 5) {
        const zombie = { ...p, state: "Z", cmdline: [] }
        w.processes.set(pid, zombie)
        return zombie
      }
      return p
    })
    w.sleep.mockImplementation(async () => {
      if (w.processes.get(101)?.state === "Z") w.processes.delete(101)
    })
    expect((await stopOwnedProcess(owned, w, bounds)).status).toBe("stopped")
    expect(w.signal.mock.calls).toEqual([[100, "SIGTERM"]])
  })
  it("When the matching leader exits after TERM Then only that exact PID is signalled and disappearance is verified", async () => {
    const w = world()
    const result = await stopOwnedProcess(owned, w, bounds)
    expect(result.status).toBe("stopped")
    expect(w.signal.mock.calls).toEqual([[100, "SIGTERM"]])
    expect(result.signals).toEqual([{ pid: 100, start: "12345", signal: "SIGTERM" }])
    expect(result.remaining).toEqual([])
  })
  it("When leader and group were already absent Then no signals are sent", async () => {
    const w = world([])
    expect((await stopOwnedProcess(owned, w, bounds)).status).toBe("already-absent")
    expect(w.signal).not.toHaveBeenCalled()
  })
  for (const drift of ["start", "profile", "pgid", "sid"] as const) {
    it(`When the leader's ${drift} mismatches Then cleanup is blocked without a signal`, async () => {
      const value = leader()
      if (drift === "profile")
        value.cmdline = ["obsidian", "--user-data-dir=/owned/run/profile-other"]
      else if (drift === "start") value.start = "54321"
      else value[drift] = 999
      const w = world([value])
      expect((await stopOwnedProcess(owned, w, bounds)).status).toBe("blocked")
      expect(w.signal).not.toHaveBeenCalled()
    })
  }
  it("When a process identity is unreadable Then EACCES is not mistaken for absence", async () => {
    const w = world()
    w.readIdentity.mockRejectedValue(error("EACCES"))
    const result = await stopOwnedProcess(owned, w, bounds)
    expect(result.status).toBe("blocked")
    expect(result.reason).toContain("EACCES")
    expect(w.signal).not.toHaveBeenCalled()
  })
  it("When group census fails Then cleanup is blocked rather than treating it as empty", async () => {
    const w = world()
    w.listGroup.mockRejectedValue(error("EACCES"))
    expect((await stopOwnedProcess(owned, w, bounds)).status).toBe("blocked")
    expect(w.signal).not.toHaveBeenCalled()
  })
  it("When a tracked child remains after leader exit Then guarded KILL and verified child absence are required", async () => {
    const w = world([leader(), member()])
    const result = await stopOwnedProcess(owned, w, bounds)
    expect(result.status).toBe("stopped")
    expect(w.signal.mock.calls).toEqual([
      [100, "SIGTERM"],
      [101, "SIGKILL"],
    ])
    expect(w.sleep).toHaveBeenCalled()
  })
  it("When TERM fails to stop matching processes Then escalation rechecks their identities", async () => {
    const w = world([leader(), member()])
    w.signal.mockImplementation(async (pid, signal) => {
      if (signal === "SIGKILL") w.processes.delete(pid)
    })
    expect((await stopOwnedProcess(owned, w, bounds)).status).toBe("stopped")
    expect(w.signal.mock.calls).toEqual([
      [100, "SIGTERM"],
      [100, "SIGKILL"],
      [101, "SIGKILL"],
    ])
    expect(w.readIdentity.mock.calls.filter(([pid]) => pid === 100).length).toBeGreaterThan(2)
  })
  it("When the leader PID is replaced after TERM Then the replacement never receives KILL", async () => {
    const w = world()
    w.signal.mockImplementation(async () => {
      w.processes.set(100, { ...leader(), start: "99999" })
    })
    const result = await stopOwnedProcess(owned, w, bounds)
    expect(result.status).toBe("indeterminate")
    expect(w.signal.mock.calls).toEqual([[100, "SIGTERM"]])
  })
  it("When a child PID is replaced immediately before KILL Then the replacement never receives a signal", async () => {
    const w = world([leader(), member()])
    let childReads = 0
    w.readIdentity.mockImplementation(async (pid) => {
      const p = w.processes.get(pid)
      if (!p) throw error("ENOENT")
      if (pid === 101 && ++childReads >= 5) return { ...p, start: "99999" }
      return { ...p, cmdline: [...p.cmdline] }
    })
    const result = await stopOwnedProcess(owned, w, bounds)
    expect(result.status).toBe("indeterminate")
    expect(w.signal.mock.calls).toEqual([[100, "SIGTERM"]])
  })
  it("When a signal syscall races a genuine disappearance Then ESRCH can be reconciled by observed absence", async () => {
    const w = world()
    w.signal.mockImplementation(async (pid) => {
      w.processes.delete(pid)
      throw error("ESRCH")
    })
    expect((await stopOwnedProcess(owned, w, bounds)).status).toBe("stopped")
  })
  it("When signals leave a known survivor Then a stopped receipt is forbidden", async () => {
    const w = world([leader(), member()])
    w.signal.mockImplementation(async () => {})
    const result = await stopOwnedProcess(owned, w, bounds)
    expect(result.status).toBe("indeterminate")
    expect(result.remaining.map((p: Identity) => p.pid)).toEqual([100, 101])
  })
  it("When identities become unreadable after TERM Then the result is indeterminate, not stopped", async () => {
    const w = world()
    w.signal.mockImplementation(async () => {
      w.readIdentity.mockRejectedValue(error("EACCES"))
    })
    const result = await stopOwnedProcess(owned, w, bounds)
    expect(result.status).toBe("indeterminate")
    expect(w.signal.mock.calls).toEqual([[100, "SIGTERM"]])
  })
  it("When a known child moves outside the owned group Then no out-of-group signal is authorized", async () => {
    const w = world([leader(), member()])
    w.signal.mockImplementation(async (pid) => {
      w.processes.delete(pid)
      w.processes.set(101, { ...member(), pgid: 999 })
    })
    expect((await stopOwnedProcess(owned, w, bounds)).status).toBe("indeterminate")
    expect(w.signal.mock.calls).toEqual([[100, "SIGTERM"]])
  })
  it("When the leader was absent before first census but members remain Then ownership cannot be newly inferred", async () => {
    const w = world([member()])
    expect((await stopOwnedProcess(owned, w, bounds)).status).toBe("blocked")
    expect(w.signal).not.toHaveBeenCalled()
  })
  it("When an unknown member appears after leader exit Then it is retained for reconciliation, never signalled", async () => {
    const w = world()
    w.signal.mockImplementation(async (pid) => {
      w.processes.delete(pid)
      w.processes.set(102, member(102))
    })
    expect((await stopOwnedProcess(owned, w, bounds)).status).toBe("indeterminate")
    expect(w.signal.mock.calls).toEqual([[100, "SIGTERM"]])
  })
  it("When the controlled profile contains whitespace Then ambiguous flattened argv is rejected", async () => {
    const w = world()
    expect(
      (await stopOwnedProcess({ ...owned, profile: "/owned/run profile" }, w, bounds)).status,
    ).toBe("blocked")
    expect(w.signal).not.toHaveBeenCalled()
  })
  it("When the leader changes between initial census and TERM Then the final pre-signal guard rejects it", async () => {
    const w = world()
    let reads = 0
    w.readIdentity.mockImplementation(async () => ({
      ...leader(),
      start: ++reads > 1 ? "99999" : owned.start,
    }))
    expect((await stopOwnedProcess(owned, w, bounds)).status).toBe("blocked")
    expect(w.signal).not.toHaveBeenCalled()
  })
})

describe("Given Linux proc snapshots for a controlled space-free profile", () => {
  // stat fields begin at state(3); pgid(5), session(6), starttime(22).
  const stat = `100 (obsidian title) S 10 100 100 ${Array(15).fill("0").join(" ")} 12345 0`
  it.each([
    `obsidian\0--user-data-dir=${owned.profile}\0`,
    `obsidian --user-data-dir=${owned.profile}\0`,
  ])(
    "When argv is NUL-delimited or Electron-flattened Then exact tokens are retained",
    (cmdline) => {
      const parsed = parseProcessIdentity(100, stat, cmdline)
      expect(parsed).toEqual({
        pid: 100,
        start: "12345",
        pgid: 100,
        sid: 100,
        cmdline: ["obsidian", `--user-data-dir=${owned.profile}`],
        state: "S",
      })
    },
  )
  it("When the proc stat PID disagrees or fields are malformed Then identity parsing fails closed", () => {
    expect(() => parseProcessIdentity(101, stat, "obsidian")).toThrow()
    expect(() => parseProcessIdentity(100, "100 broken", "obsidian")).toThrow()
    expect(() => parseProcessIdentity(100, stat.replace(") S ", ") ? "), "")).toThrow()
    expect(parseProcessIdentity(100, stat.replace(") S ", ") Z "), "").state).toBe("Z")
  })
})
