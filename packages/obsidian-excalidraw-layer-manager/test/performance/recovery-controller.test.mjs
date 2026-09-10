import assert from "node:assert/strict"
import { mkdir, mkdtemp } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { bindRecovery } from "../../scripts/performance/recovery-evidence.js"
import { runRecoveryMatrix } from "../../scripts/performance/recovery-matrix.js"
import { verifyRecoveryPrerequisites } from "../../scripts/performance/recovery-prerequisites.js"
import { readJson } from "../../scripts/performance/workload-evidence.js"
import { caseFiles, failedId, fixture, writeJson } from "./recovery-fixture.mjs"

assert.ok(process.env.TMPDIR?.startsWith("/home/"))
for (const mode of [
  "focus-stop",
  "success-then-stop",
  "before-drift",
  "after-drift",
  "prerequisite-drift",
  "reuse-failed-host",
]) {
  test(`Given a fresh recovery controller and realistic native file mocks When ${mode} Then preserve history, guard both sides and never dispatch known pairs`, async () => {
    const root = await mkdtemp(join(process.env.TMPDIR, "controller-")),
      f = await fixture(root)
    const frozen = await bindRecovery(
      f.current,
      f.priorRoot,
      f.priorLockPath,
      f.priorLockHash,
      f.entry,
    )
    const prerequisites = join(root, "prerequisites")
    await mkdir(prerequisites)
    await writeJson(join(prerequisites, "mock.json"), { explicit: "test only; no native launch" })
    const output = join(root, "output"),
      events = []
    let verifies = 0,
      dispatches = 0,
      prereqChecks = 0
    const result = await runRecoveryMatrix(
      [output, "/owned/obsidian", join(root, "new-lock.json"), "e".repeat(64), prerequisites],
      {
        verifyFreeze: async () => {
          events.push("freeze")
          verifies++
          if (
            (mode === "before-drift" && verifies === 2) ||
            (mode === "after-drift" && verifies === 3)
          )
            throw Error("frozen drift")
          return frozen
        },
        verifyRecoveryPrerequisites: async () => {
          events.push("prerequisites")
          prereqChecks++
          if (mode === "prerequisite-drift" && prereqChecks === 2) throw Error("prerequisite drift")
          return ["fresh-prerequisite-host"]
        },
        dispatchNativeCase: async ({ c, output, frozen, lockHash }) => {
          events.push(`dispatch:${c.id}`)
          dispatches++
          assert.ok(!c.id.includes("-pairs-") && !c.id.includes("-giant-"))
          const pass =
            mode === "reuse-failed-host" || (mode === "success-then-stop" && dispatches === 1)
          await caseFiles(
            output,
            c,
            frozen,
            lockHash,
            pass ? "pass" : "focus",
            mode === "reuse-failed-host" ? "unique-host" : "fresh-controller-host",
          )
          return { code: pass ? 0 : 1, signal: null }
        },
      },
    )
    assert.equal(result.status, "failed")
    const report = await readJson(join(output, "recovery-index.json"))
    assert.equal(report.inheritedCases, 52)
    assert.equal(report.priorFailures[0].id, failedId)
    assert.equal(report.priorFailures[0].status, "operational-failure")
    assert.equal(report.cases[52].status, "resource-censored")
    assert.equal(
      report.cases.find((c) => c.id === failedId).status,
      mode === "success-then-stop" ? "passed" : "operational-failure",
    )
    assert.equal(
      dispatches,
      ["before-drift", "prerequisite-drift"].includes(mode)
        ? 0
        : mode === "success-then-stop"
          ? 2
          : 1,
    )
    if (dispatches)
      assert.ok(events.lastIndexOf("freeze") > events.findIndex((e) => e.startsWith("dispatch:")))
    assert.ok(!report.cases[55].inherited)
  })
}

test("Given missing prerequisite receipts When preflight runs Then the unchanged native prerequisite guard rejects before dispatch", async () => {
  const root = await mkdtemp(join(process.env.TMPDIR, "prereqs-reject-"))
  await assert.rejects(
    verifyRecoveryPrerequisites(
      root,
      { identities: { evaluator: { "recovery-evidence.js": "new" } } },
      [],
    ),
  )
})

test("Given authentic prerequisite-shaped receipts When evaluator or host nonce drifts Then fresh prerequisite authentication fails closed", async () => {
  const { requiredCheckNames } = await import("../../scripts/performance/native-sentinels.js")
  const { operationsForShape } = await import("../../scripts/performance/native-summary.js")
  const root = await mkdtemp(join(process.env.TMPDIR, "prerequisite-fixture-")),
    f = await fixture(root)
  const frozen = await bindRecovery(
    f.current,
    f.priorRoot,
    f.priorLockPath,
    f.priorLockHash,
    f.entry,
  )
  const pre = join(root, "prerequisites"),
    operations = operationsForShape("ten")
  const mutants = ["check-bypass", "dropped-row", "no-op", "stale-cache"]
  for (const kind of ["pilot", "sentinels", "mutants"]) {
    const path = join(pre, kind)
    await mkdir(path, { recursive: true })
    await writeJson(join(path, "evaluator-inputs.json"), frozen.identities.evaluator)
    await writeJson(join(pre, `${kind}-exit.json`), {
      schema: "ak5583-prerequisite-exit-v1",
      kind,
      output: path,
      code: 0,
      signal: null,
      pid: 123,
    })
    for (const host of kind === "mutants" ? mutants.map((m) => join(path, m)) : [path]) {
      await mkdir(host, { recursive: true })
      await writeJson(join(host, "closeout.json"), {
        failure: null,
        cleanup: { status: "stopped", remaining: [] },
      })
      const identity = await readJson(join(f.priorRoot, failedId, "host-identity.json"))
      identity.owned.nonce = `fresh-prerequisite-${host}`
      identity.observed.nonce = identity.owned.nonce
      await writeJson(join(host, "host-identity.json"), identity)
    }
  }
  await writeJson(join(pre, "pilot/pilot-result.json"), {
    status: "passed",
    protocolVersion: 2,
    operations,
  })
  const packet = (await import("../../scripts/performance/workload-evidence.js")).readRows
  const first = (await packet(join(f.priorRoot, failedId, "raw-samples.jsonl")))[0]
  for (const [i, operation] of operations.entries())
    await writeJson(join(pre, "pilot", `operation-${i}-${operation}.json`), { ...first, operation })
  await writeJson(join(pre, "sentinels/result.json"), {
    status: "passed",
    native: true,
    checks: requiredCheckNames.map((name) => ({ name, pass: true })),
  })
  await writeJson(join(pre, "mutants/summary.json"), {
    status: "passed",
    protocolVersion: 2,
    results: mutants.map((mutant) => ({ mutant, status: "killed", native: true })),
  })
  const nonces = await verifyRecoveryPrerequisites(pre, frozen, [])
  assert.equal(nonces.length, 6)
  await assert.rejects(verifyRecoveryPrerequisites(pre, frozen, [nonces[0]]), /nonce/)
  await writeJson(join(pre, "pilot/evaluator-inputs.json"), f.prior.identities.evaluator)
  await assert.rejects(verifyRecoveryPrerequisites(pre, frozen, []), /evaluator/)
})

test("Given a consumed recovery freeze When another fresh output attempts to reuse it Then no second host is dispatched", async () => {
  const root = await mkdtemp(join(process.env.TMPDIR, "single-use-")),
    f = await fixture(root)
  const frozen = await bindRecovery(
    f.current,
    f.priorRoot,
    f.priorLockPath,
    f.priorLockHash,
    f.entry,
  )
  const prerequisites = join(root, "pre")
  await mkdir(prerequisites)
  let calls = 0
  const runtime = {
    verifyFreeze: async () => frozen,
    verifyRecoveryPrerequisites: async () => ["fresh-prerequisite-host"],
    dispatchNativeCase: async () => {
      calls++
      throw Error("explicit stop after owner effect")
    },
  }
  for (const output of ["attempt1", "attempt2"]) {
    const result = await runRecoveryMatrix(
      [
        join(root, output),
        "/owned/obsidian",
        join(root, "new-lock.json"),
        "e".repeat(64),
        prerequisites,
      ],
      runtime,
    )
    assert.equal(result.status, "failed")
  }
  assert.equal(calls, 1)
})

for (const mode of ["raw-pass", "cleanup", "provenance", "raw-censor"]) {
  test(`Given a fresh case with contradictory ${mode} artifacts When inspected Then reject before the second dispatch`, async () => {
    const root = await mkdtemp(join(process.env.TMPDIR, "fresh-corroboration-")),
      f = await fixture(root)
    const frozen = await bindRecovery(
      f.current,
      f.priorRoot,
      f.priorLockPath,
      f.priorLockHash,
      f.entry,
    )
    const prerequisites = join(root, "pre")
    await mkdir(prerequisites)
    let calls = 0
    const result = await runRecoveryMatrix(
      [
        join(root, "output"),
        "/owned/obsidian",
        join(root, "new-lock.json"),
        "e".repeat(64),
        prerequisites,
      ],
      {
        verifyFreeze: async () => frozen,
        verifyRecoveryPrerequisites: async () => ["fresh-prerequisite-host"],
        dispatchNativeCase: async ({ c, output, frozen, lockHash }) => {
          calls++
          if (calls > 1) throw Error("second dispatch reached contradictory fresh evidence")
          const censor = mode === "raw-censor"
          const { artifact } = await caseFiles(
            output,
            c,
            frozen,
            lockHash,
            censor ? "censor" : "pass",
            "fresh-corroboration-host",
          )
          if (mode.startsWith("raw-")) {
            const { appendFile } = await import("node:fs/promises")
            await appendFile(
              join(artifact, "raw-samples.jsonl"),
              JSON.stringify({
                status: "failed",
                native: true,
                operation: "reorder",
                index: 0,
                error: "semantic mismatch",
                effect: "indeterminate",
              }) + "\n",
            )
          }
          if (mode === "cleanup")
            await writeJson(join(artifact, "host-cleanup.json"), {
              status: "indeterminate",
              remaining: [{ pid: 999 }],
            })
          if (mode === "provenance") {
            const path = join(artifact, "case-provenance.json"),
              provenance = await readJson(path)
            provenance.scriptHash = "foreign-script"
            provenance.lockHash = "foreign-lock"
            provenance.host.nonce = "foreign-host-nonce"
            await writeJson(path, provenance)
          }
          return { code: censor ? 1 : 0, signal: null }
        },
      },
    )
    assert.equal(
      calls,
      1,
      "contradictory raw/cleanup/provenance must stop before any second callback",
    )
    assert.equal(result.status, "failed")
    assert.equal(result.cases.find((c) => c.id === failedId).status, "operational-failure")
    assert.match(result.error, /raw packet count|native cleanup|native provenance/)
    assert.equal(result.priorFailures[0].status, "operational-failure")
  })
}

for (const mode of [
  "authenticated-zero",
  "zero-extra-failure",
  "zero-no-resource-crossing",
  "nonzero-missing-raw",
]) {
  test(`Given ${mode} pre-sample evidence When a fresh case is inspected Then only an authenticated empty resource stop may advance`, async () => {
    const { unlink, writeFile } = await import("node:fs/promises")
    const root = await mkdtemp(join(process.env.TMPDIR, "fresh-zero-")),
      f = await fixture(root)
    const frozen = await bindRecovery(
      f.current,
      f.priorRoot,
      f.priorLockPath,
      f.priorLockHash,
      f.entry,
    )
    const prerequisites = join(root, "pre")
    await mkdir(prerequisites)
    let calls = 0
    const report = await runRecoveryMatrix(
      [
        join(root, "output"),
        "/owned/obsidian",
        join(root, "new-lock.json"),
        "e".repeat(64),
        prerequisites,
      ],
      {
        verifyFreeze: async () => frozen,
        verifyRecoveryPrerequisites: async () => ["fresh-prerequisite-host"],
        dispatchNativeCase: async ({ c, output, frozen, lockHash }) => {
          calls++
          if (calls > 1) throw Error("intentional stop after authenticated empty resource censor")
          const { artifact } = await caseFiles(
            output,
            c,
            frozen,
            lockHash,
            "censor",
            "fresh-zero-host",
          )
          await unlink(join(artifact, "raw-samples.jsonl"))
          if (mode !== "nonzero-missing-raw") {
            const path = join(artifact, "case-result.json"),
              result = await readJson(path)
            result.observed = 0
            await writeJson(path, result)
            await unlink(join(artifact, "envelopes.jsonl"))
          }
          if (mode === "zero-extra-failure")
            await writeFile(
              join(artifact, "raw-samples.jsonl"),
              JSON.stringify({ status: "failed", native: true, error: "semantic mismatch" }) + "\n",
            )
          if (mode === "zero-no-resource-crossing")
            await writeFile(
              join(artifact, "resource-samples.jsonl"),
              JSON.stringify({ rssMiB: 1000, availableMiB: 12000 }) + "\n",
            )
          return { code: 1, signal: null }
        },
      },
    )
    const accepted = mode === "authenticated-zero"
    assert.equal(calls, accepted ? 2 : 1)
    assert.equal(report.status, "failed") // Intentional second-dispatch stop in the positive control.
    const first = report.cases.find((c) => c.id === failedId)
    assert.equal(first.status, accepted ? "resource-censored" : "operational-failure")
    if (accepted) {
      assert.equal(first.samples, 0)
      assert.deepEqual(first.packets, [])
      assert.deepEqual(first.cleanup, { status: "stopped", remaining: [] })
    }
  })
}
