import { assign, createActor, fromPromise, setup } from "xstate"

import type { EaLike } from "../adapter/excalidraw-types.js"
import type { ApplyPatchOutcome } from "../adapter/excalidrawAdapter.js"
import { applyPatch, readSnapshot } from "../adapter/excalidrawAdapter.js"
import { buildSceneIndexes } from "../model/indexes.js"
import type { ScenePatch } from "../model/patch.js"
import type { CommandPlanner, ExecuteIntentOutcome } from "./intentExecution.js"

interface ApplyRequestEvent {
  readonly type: "APPLY_REQUEST"
  readonly patch: ScenePatch
  readonly resolve: (outcome: ApplyPatchOutcome) => void
  readonly reject: (error: unknown) => void
}

interface ExecuteIntentRequestEvent {
  readonly type: "EXECUTE_INTENT_REQUEST"
  readonly planner: CommandPlanner
  readonly resolve: (outcome: ExecuteIntentOutcome) => void
  readonly reject: (error: unknown) => void
}

type MutationRequest = ApplyRequestEvent | ExecuteIntentRequestEvent

type RuntimeMutationResult =
  | {
      readonly kind: "apply"
      readonly request: ApplyRequestEvent
      readonly outcome: ApplyPatchOutcome
    }
  | {
      readonly kind: "executeIntent"
      readonly request: ExecuteIntentRequestEvent
      readonly outcome: ExecuteIntentOutcome
    }

interface RuntimeLifecycleMachineInput {
  readonly ea: EaLike
  readonly renderLatestSnapshot: () => void
}

interface RuntimeLifecycleMachineContext {
  readonly ea: EaLike
  readonly renderLatestSnapshot: () => void
  readonly interactionDepth: number
  readonly pendingRefreshWhileInteractive: boolean
  readonly refreshRequested: boolean
  readonly mutationQueue: readonly MutationRequest[]
  readonly activeMutation: MutationRequest | null
}

type RuntimeLifecycleMachineEvent =
  | {
      readonly type: "BEGIN_INTERACTION"
    }
  | {
      readonly type: "END_INTERACTION"
    }
  | {
      readonly type: "REFRESH_REQUEST"
    }
  | {
      readonly type: "SCENE_CHANGE_NOTICED"
    }
  | ApplyRequestEvent
  | ExecuteIntentRequestEvent
  | {
      readonly type: "DISPOSE"
    }

const createDisposedError = (): Error => new Error("Layer Manager runtime disposed.")

const executeIntentRequest = async (
  ea: EaLike,
  planner: CommandPlanner,
): Promise<ExecuteIntentOutcome> => {
  let attempts = 0

  while (attempts < 2) {
    attempts += 1
    const attempt = attempts as 1 | 2

    const planningSnapshot = readSnapshot(ea)
    const planningContext = {
      snapshot: planningSnapshot,
      indexes: buildSceneIndexes(planningSnapshot),
    }

    const planned = planner(planningContext)
    if (!planned.ok) {
      return {
        status: "plannerError",
        error: planned.error,
        attempts: attempt,
      }
    }

    const applyOutcome = await applyPatch(ea, planned.value)
    if (applyOutcome.status === "applied") {
      return {
        status: "applied",
        attempts: attempt,
      }
    }

    if (applyOutcome.status === "preflightFailed" && attempts < 2) {
      continue
    }

    return {
      status: applyOutcome.status,
      reason: applyOutcome.reason,
      attempts: attempt,
    }
  }

  return {
    status: "preflightFailed",
    reason: "Patch preflight failed after bounded retry.",
    attempts: 2,
  }
}

const runtimeLifecycleMachine = setup({
  types: {
    context: {} as RuntimeLifecycleMachineContext,
    input: {} as RuntimeLifecycleMachineInput,
    events: {} as RuntimeLifecycleMachineEvent,
  },
  actors: {
    flushExternalRefresh: fromPromise(async (): Promise<void> => {
      await Promise.resolve()
    }),
    runMutation: fromPromise(
      async ({
        input,
      }: {
        input: {
          ea: EaLike
          request: MutationRequest
        }
      }): Promise<RuntimeMutationResult> => {
        if (input.request.type === "APPLY_REQUEST") {
          const outcome = await applyPatch(input.ea, input.request.patch)
          return {
            kind: "apply",
            request: input.request,
            outcome,
          }
        }

        const outcome = await executeIntentRequest(input.ea, input.request.planner)
        return {
          kind: "executeIntent",
          request: input.request,
          outcome,
        }
      },
    ),
  },
  guards: {
    hasRefreshRequest: ({ context }) => context.refreshRequested,
    hasQueuedMutation: ({ context }) =>
      context.activeMutation === null && context.mutationQueue.length > 0,
    isInteractionActive: ({ context }) => context.interactionDepth > 0,
    willRemainInteractiveAfterEnd: ({ context }) => context.interactionDepth > 1,
    shouldRefreshAfterInteractionEnd: ({ context }) =>
      context.interactionDepth === 1 && context.pendingRefreshWhileInteractive,
    isFinalInteractionEnd: ({ context }) =>
      context.interactionDepth === 1 && !context.pendingRefreshWhileInteractive,
  },
  actions: {
    beginInteraction: assign({
      interactionDepth: ({ context }) => context.interactionDepth + 1,
      pendingRefreshWhileInteractive: true,
    }),
    decrementInteractionDepth: assign({
      interactionDepth: ({ context }) => Math.max(0, context.interactionDepth - 1),
    }),
    finishInteractionAndPromotePendingRefresh: assign({
      interactionDepth: 0,
      pendingRefreshWhileInteractive: false,
      refreshRequested: true,
    }),
    finishInteractionDuringMutation: assign(({ context }) => {
      const nextDepth = Math.max(0, context.interactionDepth - 1)
      const shouldPromoteRefresh =
        context.interactionDepth === 1 && context.pendingRefreshWhileInteractive

      return {
        interactionDepth: nextDepth,
        pendingRefreshWhileInteractive: shouldPromoteRefresh
          ? false
          : context.pendingRefreshWhileInteractive,
        refreshRequested: shouldPromoteRefresh ? true : context.refreshRequested,
      }
    }),
    requestRefresh: assign(({ context }) => {
      if (context.interactionDepth > 0) {
        return {
          pendingRefreshWhileInteractive: true,
        }
      }

      return {
        refreshRequested: true,
      }
    }),
    enqueueMutationFromEvent: assign({
      mutationQueue: ({ context, event }) => {
        if (event.type !== "APPLY_REQUEST" && event.type !== "EXECUTE_INTENT_REQUEST") {
          return context.mutationQueue
        }

        return [...context.mutationQueue, event]
      },
    }),
    promoteNextMutation: assign(({ context }) => {
      const [activeMutation, ...remaining] = context.mutationQueue
      return {
        activeMutation: activeMutation ?? null,
        mutationQueue: remaining,
      }
    }),
    clearActiveMutation: assign({
      activeMutation: null,
    }),
    resolveMutationRequest: ({ event }) => {
      const { output } = event as unknown as { output: RuntimeMutationResult }

      if (output.kind === "apply") {
        output.request.resolve(output.outcome)
        return
      }

      output.request.resolve(output.outcome)
    },
    rejectActiveMutation: ({ context, event }) => {
      const activeMutation = context.activeMutation
      if (!activeMutation) {
        return
      }

      const { error } = event as unknown as { error: unknown }
      activeMutation.reject(error)
    },
    clearRefreshRequest: assign({
      refreshRequested: false,
      pendingRefreshWhileInteractive: false,
    }),
    performRefresh: ({ context }) => {
      context.renderLatestSnapshot()
    },
    rejectPendingMutations: assign(({ context }) => {
      const disposedError = createDisposedError()

      context.activeMutation?.reject(disposedError)
      for (const request of context.mutationQueue) {
        request.reject(disposedError)
      }

      return {
        activeMutation: null,
        mutationQueue: [],
      }
    }),
  },
}).createMachine({
  id: "layerManagerRuntimeLifecycle",
  initial: "active",
  context: ({ input }) => ({
    ea: input.ea,
    renderLatestSnapshot: input.renderLatestSnapshot,
    interactionDepth: 0,
    pendingRefreshWhileInteractive: false,
    refreshRequested: false,
    mutationQueue: [],
    activeMutation: null,
  }),
  states: {
    active: {
      type: "parallel",
      on: {
        APPLY_REQUEST: {
          actions: "enqueueMutationFromEvent",
        },
        EXECUTE_INTENT_REQUEST: {
          actions: "enqueueMutationFromEvent",
        },
        REFRESH_REQUEST: {
          actions: "requestRefresh",
        },
        DISPOSE: {
          target: "disposed",
          actions: ["rejectPendingMutations"],
        },
      },
      states: {
        lifecycle: {
          initial: "idle",
          states: {
            idle: {
              on: {
                BEGIN_INTERACTION: {
                  target: "interacting",
                  actions: "beginInteraction",
                },
              },
              always: [
                {
                  guard: "hasRefreshRequest",
                  target: "refreshing",
                },
                {
                  guard: "hasQueuedMutation",
                  target: "runningMutation",
                  actions: "promoteNextMutation",
                },
              ],
            },
            interacting: {
              on: {
                BEGIN_INTERACTION: {
                  actions: "beginInteraction",
                },
                END_INTERACTION: [
                  {
                    guard: "willRemainInteractiveAfterEnd",
                    actions: "decrementInteractionDepth",
                  },
                  {
                    guard: "shouldRefreshAfterInteractionEnd",
                    target: "refreshing",
                    actions: "finishInteractionAndPromotePendingRefresh",
                  },
                  {
                    guard: "isFinalInteractionEnd",
                    target: "idle",
                    actions: ["decrementInteractionDepth"],
                  },
                ],
              },
            },
            refreshing: {
              entry: ["performRefresh", "clearRefreshRequest"],
              always: [
                {
                  guard: "isInteractionActive",
                  target: "interacting",
                },
                {
                  guard: "hasQueuedMutation",
                  target: "runningMutation",
                  actions: "promoteNextMutation",
                },
                {
                  target: "idle",
                },
              ],
            },
            runningMutation: {
              invoke: {
                src: "runMutation",
                input: ({ context }) => {
                  if (!context.activeMutation) {
                    throw new Error("Missing active runtime mutation.")
                  }

                  return {
                    ea: context.ea,
                    request: context.activeMutation,
                  }
                },
                onDone: [
                  {
                    guard: "isInteractionActive",
                    target: "interacting",
                    actions: ["resolveMutationRequest", "clearActiveMutation", "requestRefresh"],
                  },
                  {
                    target: "idle",
                    actions: [
                      "clearActiveMutation",
                      "clearRefreshRequest",
                      "performRefresh",
                      "resolveMutationRequest",
                    ],
                  },
                ],
                onError: [
                  {
                    guard: "isInteractionActive",
                    target: "interacting",
                    actions: ["rejectActiveMutation", "clearActiveMutation"],
                  },
                  {
                    target: "idle",
                    actions: ["rejectActiveMutation", "clearActiveMutation"],
                  },
                ],
              },
              on: {
                BEGIN_INTERACTION: {
                  actions: "beginInteraction",
                },
                END_INTERACTION: [
                  {
                    guard: "willRemainInteractiveAfterEnd",
                    actions: "decrementInteractionDepth",
                  },
                  {
                    guard: "shouldRefreshAfterInteractionEnd",
                    actions: "finishInteractionDuringMutation",
                  },
                  {
                    guard: "isFinalInteractionEnd",
                    actions: ["decrementInteractionDepth"],
                  },
                ],
              },
            },
          },
        },
        externalRefresh: {
          initial: "unscheduled",
          states: {
            unscheduled: {
              on: {
                SCENE_CHANGE_NOTICED: {
                  target: "scheduled",
                },
              },
            },
            scheduled: {
              invoke: {
                src: "flushExternalRefresh",
                onDone: {
                  target: "unscheduled",
                  actions: "requestRefresh",
                },
              },
              on: {
                SCENE_CHANGE_NOTICED: {
                  actions: [],
                },
              },
            },
          },
        },
      },
    },
    disposed: {
      type: "final",
    },
  },
})

export const createRuntimeLifecycleActor = (input: RuntimeLifecycleMachineInput) => {
  return createActor(runtimeLifecycleMachine, {
    input,
  })
}
