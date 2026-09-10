import assert from "node:assert/strict"
import { mkdtemp, readFile, symlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { after, test } from "node:test"
import { bytesHash, treeInventory } from "../../scripts/performance/native-freeze.js"
import { bindRecovery, importRecoveryCases } from "../../scripts/performance/recovery-evidence.js"
import { advanceRecoveryCases } from "../../scripts/performance/recovery-runner.js"
import { readJson, readRows } from "../../scripts/performance/workload-evidence.js"
import { failedId, fixture, reconciliation, writeJson, writeRows } from "./recovery-fixture.mjs"

assert.ok(process.env.TMPDIR?.startsWith("/home/"), "Use a fresh home-backed TMPDIR")
const roots = []
async function setup() {
  const root = await mkdtemp(join(process.env.TMPDIR, "fixture-"))
  roots.push(root)
  return fixture(root)
}
const bind = (f) => bindRecovery(f.current, f.priorRoot, f.priorLockPath, f.priorLockHash, f.entry)
after(() => console.log(JSON.stringify({ retainedFixtureRoots: roots })))

test("Given authentic stopped WORKLOAD history When imported Then 52 original facts survive and a fresh ungrouped attempt is pending, never a green focus failure", async () => {
  const f = await setup(),
    frozen = await bind(f),
    imported = await importRecoveryCases(frozen)
  assert.equal(imported.facts.length, 52)
  assert.equal(imported.facts.filter((c) => c.status === "passed").length, 50)
  assert.equal(imported.facts.filter((c) => c.status === "resource-censored").length, 2)
  assert.equal(new Set(imported.facts.map((c) => c.lockHash)).size, 2)
  assert.equal(imported.cases.length, 192)
  assert.equal(imported.failures.length, 1)
  assert.equal(imported.failures[0].status, "operational-failure")
  assert.equal(imported.failures[0].id, failedId)
  assert.equal(imported.cases.find((c) => c.id === failedId).status, "pending")
  assert.equal(imported.nonces.length, 53)
  const calls = [],
    checks = []
  await assert.rejects(
    advanceRecoveryCases(
      imported.cases,
      imported.nonces,
      async () => {
        checks.push("verify")
      },
      async (c, sizes) => {
        calls.push(c.id)
        assert.deepEqual(sizes, [1000])
        throw Error("new focus failure")
      },
    ),
    /new focus failure/,
  )
  assert.deepEqual(calls, [failedId])
  assert.equal(checks.length, 2)
  assert.equal(imported.cases.find((c) => c.id === failedId).status, "operational-failure")
})

for (const mode of [
  "lock",
  "subject",
  "script",
  "binary",
  "policy",
  "resource-policy",
  "evaluator",
  "workload-evaluator",
  "tests",
  "dependency",
  "source-inventory",
]) {
  test(`Given pinned lineage When ${mode} drifts Then recovery fails closed`, async () => {
    const f = await setup()
    if (mode === "lock") await writeFile(f.priorLockPath, "{}")
    if (mode === "subject") f.current.sourceHash = "f".repeat(64)
    if (mode === "script") f.current.scriptHash = "f".repeat(64)
    if (mode === "binary") f.current.binaryHash = "f".repeat(64)
    if (mode === "policy") f.current.contract = {}
    if (mode === "resource-policy") f.current.resources = {}
    if (mode === "evaluator") f.current.identities.evaluator["native-case.js"] = "changed"
    if (mode === "workload-evaluator")
      f.current.identities.evaluator["workload-evidence.js"] = "changed"
    if (mode === "tests") f.current.identities.tests["workload.test.ts"] = "changed"
    if (mode === "dependency") f.current.identities.lock = "changed"
    if (mode === "source-inventory") f.current.identities.source = {}
    await assert.rejects(bind(f))
  })
}
for (const mode of ["tree-add", "tree-bytes", "tree-symlink", "prior-lock-after-freeze"]) {
  test(`Given a recovery freeze When ${mode} changes Then revalidation rejects`, async () => {
    const f = await setup(),
      frozen = await bind(f)
    if (mode === "tree-add") await writeFile(join(f.priorRoot, "unexpected"), "x")
    if (mode === "tree-bytes") await writeFile(join(f.priorRoot, "dispatches.jsonl"), "")
    if (mode === "tree-symlink") await symlink(f.priorLockPath, join(f.priorRoot, "alias"))
    if (mode === "prior-lock-after-freeze") await writeFile(f.priorLockPath, "{}")
    await assert.rejects(importRecoveryCases(frozen))
  })
}
for (const mode of [
  "inventory",
  "unknown-status",
  "hidden-dispatch",
  "not-admitted",
  "inherited-count",
  "inherited-exit",
  "inherited-artifact",
  "inherited-nonce",
  "inherited-dropped",
  "index-lock",
  "index-subject",
  "exit-code",
  "exit-path",
  "exit-config",
  "dispatch-count",
  "dispatch-command",
  "packet-count",
  "packet-lock",
  "packet-subject",
  "native-provenance",
  "raw-packet",
  "nonce-reuse",
  "false-censor",
  "failure-green",
  "failure-pending",
  "cleanup",
  "focus",
  "reconciliation",
  "reconciliation-pin",
]) {
  test(`Given realistic prior artifacts When ${mode} is corrupted before binding Then ledger labels cannot authorize recovery`, async () => {
    const f = await setup(),
      pairs = f.index.cases[52],
      failed = f.index.cases[54]
    const change = async (relative, fn) => {
      const path = join(f.priorRoot, relative),
        value = await readJson(path)
      fn(value)
      await writeJson(path, value)
    }
    if (mode === "inventory") f.index.cases.pop()
    if (mode === "unknown-status") f.index.cases[60].status = "dispatched-effect-indeterminate"
    if (mode === "hidden-dispatch") f.index.cases[55].status = "passed"
    if (mode === "not-admitted") f.index.cases[51].blockedBy = pairs.id
    if (mode === "inherited-count") f.index.inheritedCases = 50
    if (mode === "inherited-exit") f.index.cases[0].exit.code = 1
    if (mode === "inherited-artifact") f.index.cases[0].artifact = pairs.artifact
    if (mode === "inherited-nonce") f.index.cases[0].hostNonce = "foreign"
    if (mode === "inherited-dropped")
      f.index.cases[0] = { ...f.index.cases[0], status: "pending", inherited: false }
    if (mode === "index-lock") f.index.lockHash = "x"
    if (mode === "index-subject") f.index.sourceHash = "x"
    if (mode === "exit-code")
      await change(`${pairs.id}-exit.json`, (x) => {
        x.code = 0
      })
    if (mode === "exit-path")
      await change(`${pairs.id}-exit.json`, (x) => {
        x.argv[12] = "/foreign/case"
      })
    if (mode === "exit-config")
      await change(`${pairs.id}-exit.json`, (x) => {
        x.argv[16] = "{}"
      })
    if (mode === "dispatch-count")
      await writeRows(
        join(f.priorRoot, "dispatches.jsonl"),
        (await readRows(join(f.priorRoot, "dispatches.jsonl"))).slice(0, 1),
      )
    if (mode === "dispatch-command") {
      const rows = await readRows(join(f.priorRoot, "dispatches.jsonl"))
      rows[0].command = "fake"
      await writeRows(join(f.priorRoot, "dispatches.jsonl"), rows)
    }
    if (mode === "packet-count")
      await change(`${pairs.id}/case-result.json`, (x) => {
        x.observed++
      })
    if (mode === "packet-lock" || mode === "packet-subject") {
      const rows = await readRows(join(pairs.artifact, "envelopes.jsonl"))
      rows[0][mode === "packet-lock" ? "lockHash" : "sourceHash"] = "x"
      await writeRows(join(pairs.artifact, "envelopes.jsonl"), rows)
    }
    if (mode === "native-provenance")
      await change(`${pairs.id}/case-provenance.json`, (x) => {
        x.host.pid++
      })
    if (mode === "raw-packet") {
      const rows = await readRows(join(pairs.artifact, "raw-samples.jsonl"))
      rows[0].counts.scene++
      await writeRows(join(pairs.artifact, "raw-samples.jsonl"), rows)
    }
    if (mode === "nonce-reuse") {
      const nonce = f.index.cases[0].hostNonce
      pairs.hostNonce = nonce
      await change(`${pairs.id}/host-identity.json`, (x) => {
        x.owned.nonce = nonce
        x.observed.nonce = nonce
      })
      await change(`${pairs.id}/case-provenance.json`, (x) => {
        x.host.nonce = nonce
      })
      const rows = await readRows(join(pairs.artifact, "envelopes.jsonl"))
      rows.forEach((x) => {
        x.hostNonce = nonce
      })
      await writeRows(join(pairs.artifact, "envelopes.jsonl"), rows)
    }
    if (mode === "false-censor")
      await writeRows(join(pairs.artifact, "resource-samples.jsonl"), [
        { rssMiB: 100, availableMiB: 12000 },
      ])
    if (mode === "failure-green") failed.status = "passed"
    if (mode === "failure-pending") failed.status = "pending"
    if (mode === "cleanup")
      await change(`${failed.id}/host-cleanup.json`, (x) => {
        x.status = "indeterminate"
      })
    if (mode === "focus") {
      const rows = await readRows(join(f.priorRoot, failed.id, "raw-samples.jsonl"))
      rows.at(-1).error = "semantic mismatch"
      await writeRows(join(f.priorRoot, failed.id, "raw-samples.jsonl"), rows)
    }
    if (mode === "reconciliation") f.entry.action = "replay"
    if (mode === "reconciliation-pin")
      f.entry.evidence[`${failedId}/case-result.json`] = "f".repeat(64)
    await writeJson(join(f.priorRoot, "workload-index.json"), f.index)
    // Refresh pins for semantic mutations: prove validators, not just stale hash detection.
    if (["cleanup", "focus"].includes(mode))
      f.entry = reconciliation(f.priorRoot, f.priorLockHash, await treeInventory(f.priorRoot))
    await assert.rejects(bind(f))
  })
}

test("Given carried resource branches When remaining independent cases pass Then no giant/pairs or authenticated case is dispatched", async () => {
  const f = await setup(),
    imported = await importRecoveryCases(await bind(f)),
    dispatched = [],
    checked = []
  await advanceRecoveryCases(
    imported.cases,
    imported.nonces,
    async () => {
      checked.push(1)
    },
    async (c) => {
      dispatched.push(c.id)
      return { ...c, status: "passed", hostNonce: `new-host-${c.id}` }
    },
  )
  assert.equal(dispatched[0], failedId)
  assert.ok(dispatched.every((id) => !id.includes("-pairs-") && !id.includes("-giant-")))
  assert.ok(dispatched.every((id) => !imported.facts.some((c) => c.id === id)))
  assert.equal(checked.length, dispatched.length * 2)
  assert.ok(
    imported.cases.every((c) => ["passed", "resource-censored", "not-admitted"].includes(c.status)),
  )
  assert.equal(imported.failures[0].status, "operational-failure")
})
for (const mode of ["preflight", "postflight", "nonce", "interrupted"]) {
  test(`Given a fresh continuation When ${mode} fails Then stop explicitly without retries`, async () => {
    const f = await setup(),
      imported = await importRecoveryCases(await bind(f))
    let calls = 0,
      verifies = 0
    await assert.rejects(
      advanceRecoveryCases(
        imported.cases,
        imported.nonces,
        async () => {
          verifies++
          if (mode === "preflight" || (mode === "postflight" && verifies === 2))
            throw Error("guard drift")
        },
        async (c) => {
          calls++
          return {
            ...c,
            status: "passed",
            hostNonce: mode === "nonce" ? imported.nonces.at(-1) : "fresh-new-host-nonce",
          }
        },
        async () => {},
        () => mode === "interrupted",
      ),
    )
    assert.equal(calls, ["preflight", "interrupted"].includes(mode) ? 0 : 1)
  })
}

test("Given real read-only matrix03 When authenticated against original lock Then exactly 52 facts and original focus failure are recovered", {
  skip: !process.env.AK5583_PRIOR_ROOT,
}, async () => {
  const priorRoot = process.env.AK5583_PRIOR_ROOT,
    priorLockPath = process.env.AK5583_PRIOR_LOCK
  const priorLockHash = "99a13058b6a8f65358a0d1f65702d6d8efd503b88cb74a16a377919b5aa9bb4a"
  assert.equal(bytesHash(await readFile(priorLockPath)), priorLockHash)
  const prior = await readJson(priorLockPath),
    entry = reconciliation(priorRoot, priorLockHash, await treeInventory(priorRoot))
  const frozen = await bindRecovery(prior, priorRoot, priorLockPath, priorLockHash, entry)
  const imported = await importRecoveryCases(frozen)
  assert.equal(imported.facts.length, 52)
  assert.equal(imported.failures.length, 1)
  const pairs = imported.facts.find((c) => c.id === "10000-pairs-558301-baseline-0")
  assert.equal(pairs.status, "resource-censored")
  assert.equal(pairs.samples, 29)
  assert.equal(imported.failures[0].id, failedId)
  await writeJson(join(process.env.TMPDIR, "real-import-proof.json"), {
    evidenceOnly: true,
    nativeLaunches: 0,
    priorLockHash,
    priorInventory: frozen.recoveryContinuation.priorInventory,
    facts: imported.facts.map(({ packets, ...c }) => c),
    failures: imported.failures,
    next: imported.cases.find((c) => c.status === "pending").id,
  })
})

test("Given an unindexed driver effect When binding a prior tree Then recovery rejects even if the ledger looks canonical", async () => {
  const f = await setup()
  await writeFile(join(f.priorRoot, "foreign-driver.txt"), "owner effect indeterminate")
  await assert.rejects(bind(f))
})

test("Given authenticated original legacy evidence When its full tree changes Then recovery revalidation rejects", async () => {
  const f = await setup(),
    frozen = await bind(f)
  await writeFile(
    join(f.prior.workloadContinuation.legacyRoot, "hidden-effect.txt"),
    "indeterminate",
  )
  await assert.rejects(importRecoveryCases(frozen))
})
