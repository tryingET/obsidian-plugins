import { describe, expect, it, vi } from "vitest"

const io = vi.hoisted(() => ({ readFile: vi.fn() }))
vi.mock("node:fs/promises", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs/promises")>()),
  readFile: io.readFile,
}))

import {
  assertLegacyCompatible,
  inspectWorkloadCase,
  validateWorkloadPackets,
} from "../../scripts/performance/workload-evidence.js"

const hash = (c: string) => c.repeat(64)
const fixture = () => {
  const c = {
    id: "1000-ungrouped-558301-baseline-0",
    size: 1000,
    shape: "ungrouped",
    seed: 558301,
    role: "baseline",
    pass: 0,
  }
  const operations = ["external-closed", "open", "select", "rename", "external", "reorder", "close"]
  const nonce = "fresh-host-nonce-123"
  const frozen = { sourceHash: hash("a"), scriptHash: hash("b") }
  const lock = hash("c")
  const owned = {
    pid: 123,
    start: "1234",
    profile: "/owned/profile",
    vault: "/owned/vault",
    targetId: "page-1",
    nonce,
    scriptHash: frozen.scriptHash,
  }
  const identity = {
    owned,
    observed: {
      native: true,
      url: "app://obsidian.md/index.html",
      profile: owned.profile,
      vault: owned.vault,
      nonce,
      scriptHash: owned.scriptHash,
    },
    page: { id: "page-1", type: "page", url: "app://obsidian.md/index.html" },
  }
  const rows = Array.from({ length: 70 }, (_, i) => {
    const index = Math.floor(i / 7),
      operation = operations[i % 7]
    return {
      role: c.role,
      sourceHash: frozen.sourceHash,
      scriptHash: frozen.scriptHash,
      lockHash: lock,
      hostNonce: nonce,
      processPass: c.id,
      index,
      cell: { size: c.size, shape: c.shape, seed: c.seed, operation },
      packet: {
        index,
        operation,
        status: "passed",
        native: true,
        inputPath: "native command facade",
        inputPhase: "post-requestAnimationFrame",
        timerQuantumMs: 0.1,
        checks: [
          "scene-exact",
          "rows-exact",
          "selection-exact",
          "runtime-fresh",
          "staging-preserved",
        ].map((id) => ({ id, actual: hash("a"), expected: hash("a") })),
        counts: { scene: 1000, rows: 1000, selected: 0 },
        beforeHashes: { scene: hash("b"), rows: hash("a"), selection: hash("a") },
        timing: {
          inputSync: 1,
          promiseComplete: 2,
          settlement: 3,
          renderOpportunity: 8,
          renderOpportunities: [5, 8],
        },
      },
    }
  })
  const result = { input: c, lockHash: lock, expected: 70, observed: 70 }
  return { c, result, rows, identity, frozen, lock }
}
function verify(f: ReturnType<typeof fixture>) {
  return validateWorkloadPackets(f.c, f.result, f.rows, f.identity, f.frozen, f.lock)
}
describe("Given old and new frozen case evidence retains its original identity", () => {
  it.each([
    "zero-resource",
    "late-resource",
    "missing-nonzero",
    "zero-semantic",
    "zero-unreadable",
  ])(
    "When filesystem evidence is %s Then accept only corroborated resource censoring",
    async (mode) => {
      const f = fixture()
      const zero = mode.startsWith("zero")
      const result = {
        ...f.result,
        observed: zero ? 0 : 70,
        status: "failed",
        failure:
          mode === "late-resource"
            ? "Error: sampled native resource limit"
            : mode === "zero-semantic"
              ? "Error: semantic mismatch"
              : "Error: CDP closed: effects indeterminate",
        resourceFailure: "Error: sampled native resource limit",
        cleanup: { status: "stopped", remaining: [] },
      }
      io.readFile.mockImplementation(async (path: string) => {
        if (path.endsWith("case-result.json")) return JSON.stringify(result)
        if (path.endsWith("host-identity.json")) return JSON.stringify(f.identity)
        if (path.endsWith("resource-samples.jsonl"))
          return JSON.stringify({ rssMiB: 8194, availableMiB: 12000 }) + "\n"
        if (path.endsWith("envelopes.jsonl")) {
          if (mode !== "late-resource")
            throw Object.assign(Error("missing/unreadable envelope inventory"), {
              code: mode === "zero-unreadable" ? "EACCES" : "ENOENT",
            })
          return f.rows.map((r) => JSON.stringify(r)).join("\n")
        }
        throw Error(`unexpected read ${path}`)
      })
      const inspected = inspectWorkloadCase(f.c, "/synthetic-case", f.frozen, f.lock, {
        code: 1,
        signal: null,
      })
      if (["zero-resource", "late-resource"].includes(mode))
        await expect(inspected).resolves.toMatchObject({
          status: "resource-censored",
          samples: result.observed,
        })
      else await expect(inspected).rejects.toThrow()
    },
  )
  it("When exact native packets form the full ordered inventory Then admit without relabelling their lock", () =>
    expect(verify(fixture())).toBe(70))
  it.each([
    "nonce",
    "subject",
    "lock",
    "sequence",
    "packet-index",
    "checks",
    "count",
    "pid",
    "profile",
    "page",
  ])("When %s drifts Then reject the apparent pass", (mode) => {
    const f = fixture()
    const row = f.rows[0]!
    if (mode === "nonce") row.hostNonce = "foreign"
    if (mode === "subject") row.sourceHash = hash("d")
    if (mode === "lock") row.lockHash = hash("d")
    if (mode === "sequence") row.index = 1
    if (mode === "packet-index") row.packet.index = 1
    if (mode === "checks") row.packet.checks.pop()
    if (mode === "count") f.result.observed = 69
    if (mode === "pid") f.identity.owned.pid = 0
    if (mode === "profile") f.identity.observed.profile = "/foreign/profile"
    if (mode === "page") f.identity.page.id = "foreign"
    expect(() => verify(f)).toThrow()
  })
  it("When only controller additions exist Then old native helper/test bytes and subject must still match", () => {
    const legacy = {
      ...fixture().frozen,
      binary: "/owned/obsidian",
      binaryHash: hash("e"),
      appAsarHash: hash("f"),
      contract: { version: 2 },
      resources: { rssMiB: 8192 },
      identities: {
        hostSeed: { drawing: "x" },
        evaluator: { "native-case.js": "old" },
        tests: { "proof.test.ts": "old" },
      },
    }
    const current = structuredClone(legacy)
    expect(() => assertLegacyCompatible(legacy, current)).not.toThrow()
    current.identities.evaluator["native-case.js"] = "changed"
    expect(() => assertLegacyCompatible(legacy, current)).toThrow()
  })
})
