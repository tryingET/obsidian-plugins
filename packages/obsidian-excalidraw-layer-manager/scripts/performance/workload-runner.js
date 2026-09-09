import { workloadDisposition } from "./workload-policy.js"
export async function advanceWorkloads(
  cases,
  measure,
  checkpoint = async () => {},
  interrupted = () => false,
) {
  for (const c of cases) {
    if (c.status !== "pending") continue
    if (interrupted()) throw Error("controller interrupted; no further dispatch")
    const disposition = workloadDisposition(c, cases)
    if (disposition.kind === "not-admitted") {
      Object.assign(c, { status: "not-admitted", blockedBy: disposition.blockedBy })
      await checkpoint()
      continue
    }
    c.status = "dispatched-effect-indeterminate"
    await checkpoint()
    try {
      const fact = await measure(c, disposition.previousSizes)
      if (interrupted()) throw Error("controller interrupted after child; no further dispatch")
      if (
        !["passed", "resource-censored"].includes(fact.status) ||
        ["id", "size", "shape", "seed", "role", "pass"].some((k) => fact[k] !== c[k])
      )
        throw Error("unverified case disposition or identity")
      Object.assign(c, fact)
      await checkpoint()
    } catch (error) {
      c.status = "operational-failure"
      c.error = String(error)
      await checkpoint()
      throw error
    }
  }
}
