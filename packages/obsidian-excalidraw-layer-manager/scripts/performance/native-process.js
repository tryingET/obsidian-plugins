// Cooperative Linux process-group reconciliation; no global-name or negative-PID signals.
// This cannot close the kernel's read-to-kill race without pidfds. Receipts certify only
// the exact observed group/tracked identities, not arbitrary escaped descendants.
import { execFile } from "node:child_process"
import { readFile } from "node:fs/promises"
import { promisify } from "node:util"

const execute = promisify(execFile)
/** @typedef {{pid:number,start:string,pgid:number,sid:number,cmdline:string[],state?:string}} Identity */
/** @typedef {{pid:number,start:string,pgid?:number,profile:string}} Owned */
/** @typedef {{readIdentity:(pid:number)=>Promise<Identity>,listGroup:(pgid:number)=>Promise<number[]>,signal:(pid:number,signal:string)=>unknown,sleep:(ms:number)=>Promise<unknown>}} Dependencies */
/** @typedef {{termPolls:number,killPolls:number,pollMs:number}} Bounds */

/** @param {unknown} condition @param {string} message */
function requireThat(condition, message) {
  if (!condition) throw Error(message)
}
/** @param {unknown} error */
function code(error) {
  return error && typeof error === "object" && "code" in error ? error.code : undefined
}
/** @param {number} value */
function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0
}
/** @param {number} pid @param {string} stat @param {string} cmdline @returns {Identity} */
export function parseProcessIdentity(pid, stat, cmdline) {
  requireThat(positiveInteger(pid), "invalid PID")
  const close = stat.lastIndexOf(")")
  requireThat(close > 0 && stat.startsWith(`${pid} (`), "proc stat PID/comm mismatch")
  const fields = stat
    .slice(close + 1)
    .trim()
    .split(/\s+/)
  const pgid = Number(fields[2]),
    sid = Number(fields[3]),
    start = fields[19]
  requireThat(
    fields.length >= 20 &&
      /^[RSDZTtXxKWPI]$/.test(fields[0] ?? "") &&
      positiveInteger(pgid) &&
      positiveInteger(sid) &&
      /^\d+$/.test(start ?? ""),
    "malformed proc identity fields",
  )
  return {
    pid,
    start,
    pgid,
    sid,
    state: fields[0],
    cmdline: cmdline.split(/[\0 ]/).filter(Boolean),
  }
}

/** @param {number} pid @returns {Promise<Identity>} */
export async function readProcessIdentity(pid) {
  const path = `/proc/${pid}`
  const before = parseProcessIdentity(pid, await readFile(`${path}/stat`, "utf8"), "")
  const cmdline = await readFile(`${path}/cmdline`, "utf8")
  const after = parseProcessIdentity(pid, await readFile(`${path}/stat`, "utf8"), cmdline)
  requireThat(
    before.start === after.start && before.pgid === after.pgid && before.sid === after.sid,
    "process identity changed during read",
  )
  return after
}

/** @param {number} pgid @returns {Promise<number[]>} */
export async function readProcessGroup(pgid) {
  requireThat(positiveInteger(pgid), "invalid process group")
  // ps supplies the complete group census; unreadable member identities are handled
  // separately as failures, never dropped as though they were absent.
  const { stdout } = await execute("ps", ["-eo", "pid=,pgid="], {
    encoding: "utf8",
    timeout: 5000,
    maxBuffer: 4 * 1024 * 1024,
  })
  const rows = stdout.trim() ? stdout.trim().split("\n") : []
  return rows.flatMap((row) => {
    const fields = row.trim().split(/\s+/)
    const [pid, group] = fields.map(Number)
    requireThat(
      fields.length === 2 && positiveInteger(pid) && Number.isSafeInteger(group) && group >= 0,
      "malformed process group census",
    )
    return group === pgid ? [pid] : []
  })
}

/** @type {Dependencies} */
const linux = {
  readIdentity: readProcessIdentity,
  listGroup: readProcessGroup,
  signal: (pid, signal) => process.kill(pid, /** @type {NodeJS.Signals} */ (signal)),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}
const DEFAULT_BOUNDS = Object.freeze({ termPolls: 50, killPolls: 50, pollMs: 100 })
const CLAIM_LIMIT =
  "Cooperative sampled exact group/tracked-process absence; not pidfd-atomic signaling or proof that arbitrary escaped descendants are inactive."

/**
 * TERM the exact matching leader; allow its normal shutdown to drain the group.
 * After the grace period KILL only individually reverified, previously tracked survivors.
 * Any ambiguous identity/census prevents further signals and returns a non-success receipt.
 * The caller must keep its alias/scratch when status is blocked or indeterminate.
 * No aliases, scratch, logs or foreign lifecycle state are mutated here.
 * @param {Owned} owned
 * @param {Dependencies} deps
 * @param {Bounds} bounds
 */
export async function stopOwnedProcess(owned, deps = linux, bounds = DEFAULT_BOUNDS) {
  /** @type {Map<number, Identity>} */
  const tracked = new Map()
  /** @type {{pid:number,start:string,signal:string}[]} */
  const signals = []
  /** @type {Identity[]} */
  let remaining = []
  let attempted = false,
    leaderTermSent = false,
    censuses = 0
  /** @param {'stopped'|'already-absent'|'blocked'|'indeterminate'} status @param {string} reason */
  const receipt = (status, reason) => ({
    status,
    reason,
    signals,
    remaining: remaining.map(publicIdentity),
    tracked: [...tracked.values()].map(publicIdentity),
    censuses,
    claimLimit: CLAIM_LIMIT,
  })
  try {
    requireThat(
      owned &&
        positiveInteger(owned.pid) &&
        typeof owned.start === "string" &&
        /^\d+$/.test(owned.start),
      "invalid owned process identity",
    )
    const pgid = owned.pgid ?? owned.pid
    requireThat(pgid === owned.pid, "owned detached process must lead its group")
    requireThat(
      typeof owned.profile === "string" &&
        owned.profile.startsWith("/") &&
        !/[\s\0]/.test(owned.profile),
      "controlled profile must be absolute and whitespace-free",
    )
    requireThat(
      Number.isSafeInteger(bounds.termPolls) &&
        bounds.termPolls >= 0 &&
        Number.isSafeInteger(bounds.killPolls) &&
        bounds.killPolls >= 0 &&
        Number.isFinite(bounds.pollMs) &&
        bounds.pollMs >= 1 &&
        (bounds.termPolls + bounds.killPolls) * bounds.pollMs <= 120000,
      "invalid shutdown bounds",
    )
    /** @param {number} pid */
    const observe = async (pid) => {
      try {
        const live = await deps.readIdentity(pid)
        requireThat(
          live && live.pid === pid && /^\d+$/.test(live.start ?? "") && Array.isArray(live.cmdline),
          `invalid identity read: ${pid}`,
        )
        return live
      } catch (error) {
        if (code(error) === "ENOENT") return null
        throw error
      }
    }
    /** @param {Identity} live @param {Identity|undefined} prior */
    const verify = (live, prior) => {
      requireThat(
        live.pgid === pgid && live.sid === owned.pid,
        `process left owned group/session: ${live.pid}`,
      )
      requireThat(
        BigInt(live.start) >= BigInt(owned.start),
        `process predates owned launch: ${live.pid}`,
      )
      if (prior) requireThat(live.start === prior.start, `process identity replaced: ${live.pid}`)
      if (live.pid === owned.pid) {
        requireThat(live.start === owned.start, "leader start mismatch")
        if (live.state === "Z") {
          requireThat(
            leaderTermSent && prior?.cmdline.includes(`--user-data-dir=${owned.profile}`),
            "zombie leader lacks prior verified TERM ownership",
          )
        }
        requireThat(
          live.cmdline.includes(`--user-data-dir=${owned.profile}`) ||
            (live.state === "Z" && live.cmdline.length === 0 && leaderTermSent && !!prior),
          "leader profile mismatch",
        )
      }
    }
    /** @param {boolean} initial */
    const census = async (initial) => {
      const listed = await deps.listGroup(pgid)
      requireThat(
        Array.isArray(listed) &&
          listed.every(positiveInteger) &&
          new Set(listed).size === listed.length,
        "invalid group census",
      )
      const current = []
      // Include every tracked PID even after a group change; a census omission must
      // never make an escaped or replaced tracked process look absent.
      for (const pid of [...new Set([owned.pid, ...listed, ...tracked.keys()])].sort(
        (a, b) => a - b,
      )) {
        const live = await observe(pid)
        if (live) current.push(live)
      }
      remaining = current
      censuses += 1
      const root = current.find((p) => p.pid === owned.pid)
      if (root) {
        verify(root, tracked.get(root.pid))
        requireThat(listed.includes(root.pid), "live leader missing from group census")
      } else if (initial && current.length) {
        throw Error("leader absent before ownership census; remaining group cannot be newly owned")
      }
      for (const live of current) {
        const prior = tracked.get(live.pid)
        requireThat(
          prior || (root && root.state !== "Z"),
          `unknown member after leader exit: ${live.pid}`,
        )
        verify(live, prior)
        if (!prior) tracked.set(live.pid, live)
      }
      return current
    }
    /** @param {number} pid @param {string} signal */
    const guardedSignal = async (pid, signal) => {
      const prior = tracked.get(pid)
      requireThat(prior, `untracked signal target: ${pid}`)
      const live = await observe(pid)
      if (!live) return
      verify(live, prior) // immediately before every positive-PID signal
      if (live.state === "Z") return // Still present: only observe until reaped, never signal.
      attempted = true
      try {
        await deps.signal(pid, signal)
        if (pid === owned.pid && signal === "SIGTERM") leaderTermSent = true
        signals.push({ pid, start: live.start, signal })
      } catch (error) {
        // ESRCH is a race, not proof; the following census must establish absence.
        if (code(error) !== "ESRCH") throw error
      }
    }
    /** @param {number} polls */
    const drain = async (polls) => {
      let current = await census(false)
      for (let i = 0; current.length && i < polls; i++) {
        await deps.sleep(bounds.pollMs)
        current = await census(false)
      }
      return current
    }
    const initial = await census(true)
    if (!initial.length) return receipt("already-absent", "leader and owned group are absent")
    await guardedSignal(owned.pid, "SIGTERM")
    const survivors = await drain(bounds.termPolls)
    if (survivors.length) {
      for (const survivor of survivors) await guardedSignal(survivor.pid, "SIGKILL")
      await drain(bounds.killPolls)
    }
    return remaining.length
      ? receipt("indeterminate", "known process survivors remain after bounded shutdown")
      : receipt("stopped", "owned group and all tracked identities are absent")
  } catch (error) {
    return receipt(
      attempted ? "indeterminate" : "blocked",
      error instanceof Error ? error.message : String(error),
    )
  }
}

/** @param {Identity} identity */
function publicIdentity(identity) {
  return {
    pid: identity.pid,
    start: identity.start,
    pgid: identity.pgid,
    sid: identity.sid,
    state: identity.state ?? "unrecorded",
    cmdlineEmpty: identity.cmdline.length === 0,
  }
}
