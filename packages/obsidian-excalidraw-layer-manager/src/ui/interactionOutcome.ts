import type { ExecuteIntentOutcome } from "../runtime/intentExecution.js"

export const didInteractionApply = (
  outcome: ExecuteIntentOutcome,
): outcome is Extract<ExecuteIntentOutcome, { readonly status: "applied" }> => {
  return outcome.status === "applied"
}
