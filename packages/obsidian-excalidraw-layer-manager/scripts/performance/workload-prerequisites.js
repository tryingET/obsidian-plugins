// Same prerequisite contract as v2; separate controller avoids editing the frozen case runner.
import { join } from "node:path"
import { validateNativePacket } from "./native-packet.js"
import { assertNativePrerequisite } from "./native-prerequisite-proof.js"
import { validateSentinelReceipt } from "./native-sentinel-packet.js"
import { requiredCheckNames } from "./native-sentinels.js"
import { operationsForShape } from "./native-summary.js"
import { readJson } from "./workload-evidence.js"

export async function verifyWorkloadPrerequisites(root, frozen) {
  const pilot = await readJson(join(root, "pilot/pilot-result.json"))
  const sentinels = await readJson(join(root, "sentinels/result.json"))
  const mutants = await readJson(join(root, "mutants/summary.json"))
  validateSentinelReceipt(sentinels, requiredCheckNames)
  if (
    pilot.status !== "passed" ||
    pilot.protocolVersion !== 2 ||
    mutants.status !== "passed" ||
    mutants.protocolVersion !== 2 ||
    JSON.stringify(pilot.operations) !== JSON.stringify(operationsForShape("ten")) ||
    JSON.stringify(mutants.results.map((r) => r.mutant).sort()) !==
      JSON.stringify(["check-bypass", "dropped-row", "no-op", "stale-cache"]) ||
    !mutants.results.every((r) => r.status === "killed" && r.native === true)
  )
    throw Error("native prerequisite inventory incomplete")
  for (const [i, operation] of pilot.operations.entries())
    validateNativePacket(await readJson(join(root, "pilot", `operation-${i}-${operation}.json`)))
  for (const kind of ["pilot", "sentinels", "mutants"]) {
    const path = join(root, kind)
    if (
      JSON.stringify(await readJson(join(path, "evaluator-inputs.json"))) !==
      JSON.stringify(frozen.identities.evaluator)
    )
      throw Error("prerequisites belong to another evaluator revision")
    const exit = await readJson(join(root, `${kind}-exit.json`))
    for (const host of kind === "mutants"
      ? mutants.results.map((r) => join(path, r.mutant))
      : [path]) {
      const closeout = await readJson(join(host, "closeout.json"))
      assertNativePrerequisite(closeout, exit, { kind, output: path })
      const identity = await readJson(join(host, "host-identity.json"))
      if (identity.owned.scriptHash !== frozen.scriptHash || closeout.cleanup?.status !== "stopped")
        throw Error("prerequisite subject/cleanup differs")
    }
  }
}
