// Testable orchestration only; native measurement/inspection remains in the unchanged primitives.
import { advanceWorkloads } from "./workload-runner.js"
export async function advanceRecoveryCases(
  cases,
  previousNonces,
  verify,
  measure,
  checkpoint,
  interrupted,
) {
  const nonces = new Set(previousNonces)
  if (nonces.size !== previousNonces.length) throw Error("recovery nonce inventory repeats")
  await advanceWorkloads(
    cases,
    async (c, previousSizes) => {
      await verify()
      let fact
      try {
        fact = await measure(c, previousSizes)
        if (
          typeof fact.hostNonce !== "string" ||
          fact.hostNonce.length < 16 ||
          nonces.has(fact.hostNonce)
        )
          throw Error("recovery native host nonce reused/missing")
        nonces.add(fact.hostNonce)
      } finally {
        await verify() // Also revalidate after unsuccessful effects; never dispatch another case on error.
      }
      return fact
    },
    checkpoint,
    interrupted,
  )
}
