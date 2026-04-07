import { err, ok } from "../model/result.js"
import type { Result } from "../model/result.js"

export interface ReparentValidationInput {
  readonly sourceFrameId: string | null
  readonly targetFrameId: string | null
  readonly sourceGroupId: string | null
  readonly targetParentPath: readonly string[]
}

export const validateNoCrossFrameMove = (
  sourceFrameId: string | null,
  targetFrameId: string | null,
): Result<void, string> => {
  if (sourceFrameId !== targetFrameId) {
    return err("Cross-frame moves are not supported.")
  }
  return ok(undefined)
}

export const validateNoSelfNesting = (
  sourceGroupId: string | null,
  targetParentPath: readonly string[],
): Result<void, string> => {
  if (sourceGroupId && targetParentPath.includes(sourceGroupId)) {
    return err("Cannot move a group into itself.")
  }
  return ok(undefined)
}

export const validateReparentInvariants = (
  input: ReparentValidationInput,
): Result<void, string> => {
  const frameCheck = validateNoCrossFrameMove(input.sourceFrameId, input.targetFrameId)
  if (!frameCheck.ok) {
    return frameCheck
  }

  const cycleCheck = validateNoSelfNesting(input.sourceGroupId, input.targetParentPath)
  if (!cycleCheck.ok) {
    return cycleCheck
  }

  return ok(undefined)
}
