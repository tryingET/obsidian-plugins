import type { ApplyPatchOutcome } from "../adapter/excalidrawAdapter.js"
import type { CommandContext } from "../commands/context.js"
import type { ScenePatch } from "../model/patch.js"
import type { Result } from "../model/result.js"

export type CommandPlanner = (context: CommandContext) => Result<ScenePatch, string>

export type ExecuteIntentOutcome =
  | {
      readonly status: "applied"
      readonly attempts: 1 | 2
    }
  | {
      readonly status: "plannerError"
      readonly error: string
      readonly attempts: 1 | 2
    }
  | {
      readonly status: Exclude<ApplyPatchOutcome["status"], "applied">
      readonly reason: string
      readonly attempts: 1 | 2
    }

export type ExecuteIntent = (planner: CommandPlanner) => Promise<ExecuteIntentOutcome>
