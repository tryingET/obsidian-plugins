// Existing prerequisite contract PLUS fresh, distinct hosts, including exclusion of the failed host.
import { join } from "node:path"
import { readJson } from "./workload-evidence.js"
import { verifyWorkloadPrerequisites } from "./workload-prerequisites.js"
export async function verifyRecoveryPrerequisites(root, frozen, previousNonces) {
  await verifyWorkloadPrerequisites(root, frozen) // Exact NEW evaluator inventory rejects the old prerequisites.
  const seen = new Set(previousNonces),
    nonces = []
  const mutants = await readJson(join(root, "mutants/summary.json"))
  const hosts = ["pilot", "sentinels", ...mutants.results.map((r) => `mutants/${r.mutant}`)]
  for (const host of hosts) {
    const { owned, observed, page } = await readJson(join(root, host, "host-identity.json"))
    const closeout = await readJson(join(root, host, "closeout.json"))
    if (
      !owned ||
      typeof owned.nonce !== "string" ||
      owned.nonce.length < 16 ||
      seen.has(owned.nonce)
    )
      throw Error("prerequisite native host nonce reused/missing")
    if (
      !Number.isSafeInteger(owned.pid) ||
      owned.pid <= 0 ||
      !/^\d+$/.test(owned.start ?? "") ||
      !owned.profile?.startsWith("/") ||
      !owned.vault?.startsWith("/") ||
      ["nonce", "scriptHash", "profile", "vault"].some((k) => observed?.[k] !== owned[k]) ||
      observed?.native !== true ||
      observed.url !== "app://obsidian.md/index.html" ||
      page?.id !== owned.targetId ||
      page?.type !== "page" ||
      page?.url !== observed.url ||
      !Array.isArray(closeout.cleanup?.remaining) ||
      closeout.cleanup.remaining.length !== 0
    )
      throw Error("prerequisite native provenance/cleanup differs")
    seen.add(owned.nonce)
    nonces.push(owned.nonce)
  }
  return nonces
}
