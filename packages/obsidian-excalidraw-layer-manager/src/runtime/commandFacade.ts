import { type CreateGroupInput, planCreateGroup } from "../commands/createGroup.js"
import { type DeleteNodeInput, planDeleteNode } from "../commands/deleteNode.js"
import { type RenameNodeInput, planRenameNode } from "../commands/renameNode.js"
import { type ReorderInput, planReorder } from "../commands/reorderNode.js"
import { type ReparentNodeInput, planReparentNode } from "../commands/reparentNode.js"
import { type ToggleLockInput, planToggleLock } from "../commands/toggleLock.js"
import { type ToggleVisibilityInput, planToggleVisibility } from "../commands/toggleVisibility.js"
import { ok } from "../model/result.js"
import type { CommandPlanner, ExecuteIntent, ExecuteIntentOutcome } from "./intentExecution.js"

export interface LayerManagerCommandFacade {
  toggleVisibility: (input: ToggleVisibilityInput) => Promise<ExecuteIntentOutcome>
  toggleLock: (input: ToggleLockInput) => Promise<ExecuteIntentOutcome>
  renameNode: (input: RenameNodeInput) => Promise<ExecuteIntentOutcome>
  deleteNode: (input: DeleteNodeInput) => Promise<ExecuteIntentOutcome>
  createGroup: (input: CreateGroupInput) => Promise<ExecuteIntentOutcome>
  reorder: (input: ReorderInput) => Promise<ExecuteIntentOutcome>
  reparent: (input: ReparentNodeInput) => Promise<ExecuteIntentOutcome>
}

interface CreateLayerManagerCommandFacadeInput {
  readonly executeIntent: ExecuteIntent
  readonly notify?: (message: string) => void
}

const formatFailureMessage = (
  commandName: string,
  outcome: Exclude<ExecuteIntentOutcome, { readonly status: "applied" }>,
): string => {
  if (outcome.status === "plannerError") {
    return `${commandName} failed: ${outcome.error}`
  }

  return `${commandName} not applied (${outcome.status}): ${outcome.reason}`
}

const runFacadeCommand = async (
  commandName: string,
  executeIntent: ExecuteIntent,
  planner: CommandPlanner,
  notify?: (message: string) => void,
): Promise<ExecuteIntentOutcome> => {
  const outcome = await executeIntent(planner)

  if (outcome.status !== "applied") {
    notify?.(formatFailureMessage(commandName, outcome))
  }

  return outcome
}

export const createLayerManagerCommandFacade = (
  input: CreateLayerManagerCommandFacadeInput,
): LayerManagerCommandFacade => {
  const run = (commandName: string, planner: CommandPlanner): Promise<ExecuteIntentOutcome> => {
    return runFacadeCommand(commandName, input.executeIntent, planner, input.notify)
  }

  return {
    toggleVisibility: (commandInput) =>
      run("toggleVisibility", (context) => planToggleVisibility(context, commandInput)),

    toggleLock: (commandInput) =>
      run("toggleLock", (context) => planToggleLock(context, commandInput)),

    renameNode: (commandInput) =>
      run("renameNode", (context) => planRenameNode(context, commandInput)),

    deleteNode: (commandInput) =>
      run("deleteNode", (context) => planDeleteNode(context, commandInput)),

    createGroup: (commandInput) =>
      run("createGroup", (context) => {
        const plan = planCreateGroup(context, commandInput)
        if (!plan.ok) {
          return plan
        }

        return ok(plan.value.patch)
      }),

    reorder: (commandInput) => run("reorder", (context) => planReorder(context, commandInput)),

    reparent: (commandInput) =>
      run("reparent", (context) => planReparentNode(context, commandInput)),
  }
}
