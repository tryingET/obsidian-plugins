import { type CreateGroupInput, planCreateGroup } from "../commands/createGroup.js"
import { type DeleteNodeInput, planDeleteNode } from "../commands/deleteNode.js"
import { type RenameNodeInput, planRenameNode } from "../commands/renameNode.js"
import { type ReorderInput, planReorder } from "../commands/reorderNode.js"
import { type ReparentNodeInput, planReparentNode } from "../commands/reparentNode.js"
import { type ToggleLockInput, planToggleLock } from "../commands/toggleLock.js"
import { type ToggleVisibilityInput, planToggleVisibility } from "../commands/toggleVisibility.js"
import { ok } from "../model/result.js"
import type { CommandPlanner, ExecuteIntent, ExecuteIntentOutcome } from "./intentExecution.js"

export interface CommandExecutionOptions {
  readonly notifyOnFailure?: boolean
}

export interface LayerManagerCommandFacade {
  toggleVisibility: (
    input: ToggleVisibilityInput,
    options?: CommandExecutionOptions,
  ) => Promise<ExecuteIntentOutcome>
  toggleLock: (
    input: ToggleLockInput,
    options?: CommandExecutionOptions,
  ) => Promise<ExecuteIntentOutcome>
  renameNode: (
    input: RenameNodeInput,
    options?: CommandExecutionOptions,
  ) => Promise<ExecuteIntentOutcome>
  deleteNode: (
    input: DeleteNodeInput,
    options?: CommandExecutionOptions,
  ) => Promise<ExecuteIntentOutcome>
  createGroup: (
    input: CreateGroupInput,
    options?: CommandExecutionOptions,
  ) => Promise<ExecuteIntentOutcome>
  reorder: (input: ReorderInput, options?: CommandExecutionOptions) => Promise<ExecuteIntentOutcome>
  reparent: (
    input: ReparentNodeInput,
    options?: CommandExecutionOptions,
  ) => Promise<ExecuteIntentOutcome>
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
  options?: CommandExecutionOptions,
): Promise<ExecuteIntentOutcome> => {
  const outcome = await executeIntent(planner)

  if (outcome.status !== "applied" && options?.notifyOnFailure !== false) {
    notify?.(formatFailureMessage(commandName, outcome))
  }

  return outcome
}

export const createLayerManagerCommandFacade = (
  input: CreateLayerManagerCommandFacadeInput,
): LayerManagerCommandFacade => {
  const run = (
    commandName: string,
    planner: CommandPlanner,
    options?: CommandExecutionOptions,
  ): Promise<ExecuteIntentOutcome> => {
    return runFacadeCommand(commandName, input.executeIntent, planner, input.notify, options)
  }

  return {
    toggleVisibility: (commandInput, options) =>
      run("toggleVisibility", (context) => planToggleVisibility(context, commandInput), options),

    toggleLock: (commandInput, options) =>
      run("toggleLock", (context) => planToggleLock(context, commandInput), options),

    renameNode: (commandInput, options) =>
      run("renameNode", (context) => planRenameNode(context, commandInput), options),

    deleteNode: (commandInput, options) =>
      run("deleteNode", (context) => planDeleteNode(context, commandInput), options),

    createGroup: (commandInput, options) =>
      run(
        "createGroup",
        (context) => {
          const plan = planCreateGroup(context, commandInput)
          if (!plan.ok) {
            return plan
          }

          return ok(plan.value.patch)
        },
        options,
      ),

    reorder: (commandInput, options) =>
      run("reorder", (context) => planReorder(context, commandInput), options),

    reparent: (commandInput, options) =>
      run("reparent", (context) => planReparentNode(context, commandInput), options),
  }
}
