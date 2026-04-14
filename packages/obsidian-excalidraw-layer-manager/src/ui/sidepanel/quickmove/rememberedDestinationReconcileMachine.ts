import { assign, createActor, fromPromise, setup } from "xstate"

import type {
  LastQuickMoveDestination,
  SidepanelQuickMovePersistenceService,
} from "./quickMovePersistenceService.js"

interface RememberedDestinationCandidate {
  readonly lastQuickMoveDestination: LastQuickMoveDestination | null
  readonly recentQuickMoveDestinations: readonly LastQuickMoveDestination[]
}

interface RememberedDestinationReconcileMachineInput {
  readonly service: SidepanelQuickMovePersistenceService
  readonly notify: (message: string) => void
}

interface RememberedDestinationReconcileMachineContext {
  readonly service: SidepanelQuickMovePersistenceService
  readonly notify: (message: string) => void
  readonly activeCandidate: RememberedDestinationCandidate | null
  readonly pendingCandidate: RememberedDestinationCandidate | null
}

type RememberedDestinationReconcileMachineEvent = {
  readonly type: "PROJECTION_UPDATED"
  readonly candidate: RememberedDestinationCandidate
}

const shouldProcessCandidate = (
  service: SidepanelQuickMovePersistenceService,
  candidate: RememberedDestinationCandidate,
): boolean => {
  const preview = service.previewReboundRememberedDestinations(candidate)
  return preview.changed && !service.shouldSuppressRememberedDestinationRebind(preview)
}

const rememberedDestinationReconcileMachine = setup({
  types: {
    context: {} as RememberedDestinationReconcileMachineContext,
    input: {} as RememberedDestinationReconcileMachineInput,
    events: {} as RememberedDestinationReconcileMachineEvent,
  },
  actors: {
    reconcileRememberedDestinations: fromPromise(
      async ({
        input,
      }: {
        input: {
          service: SidepanelQuickMovePersistenceService
          candidate: RememberedDestinationCandidate
        }
      }) => {
        return input.service.rebindRememberedDestinations(input.candidate)
      },
    ),
  },
  guards: {
    shouldStartReconcile: ({ context, event }) => {
      if (event.type !== "PROJECTION_UPDATED") {
        return false
      }

      return shouldProcessCandidate(context.service, event.candidate)
    },
    hasReplayCandidate: ({ context }) => {
      const pendingCandidate = context.pendingCandidate
      if (!pendingCandidate) {
        return false
      }

      return shouldProcessCandidate(context.service, pendingCandidate)
    },
  },
  actions: {
    setActiveCandidateFromEvent: assign({
      activeCandidate: ({ event }) =>
        event.type === "PROJECTION_UPDATED" ? event.candidate : null,
      pendingCandidate: null,
    }),
    updatePendingCandidateFromEvent: assign({
      pendingCandidate: ({ context, event }) => {
        if (event.type !== "PROJECTION_UPDATED") {
          return context.pendingCandidate
        }

        return shouldProcessCandidate(context.service, event.candidate) ? event.candidate : null
      },
    }),
    promotePendingCandidateToActive: assign({
      activeCandidate: ({ context }) => context.pendingCandidate,
      pendingCandidate: null,
    }),
    clearCandidates: assign({
      activeCandidate: null,
      pendingCandidate: null,
    }),
  },
}).createMachine({
  id: "rememberedDestinationReconcile",
  initial: "idle",
  context: ({ input }) => ({
    service: input.service,
    notify: input.notify,
    activeCandidate: null,
    pendingCandidate: null,
  }),
  states: {
    idle: {
      on: {
        PROJECTION_UPDATED: [
          {
            guard: "shouldStartReconcile",
            target: "reconciling",
            actions: "setActiveCandidateFromEvent",
          },
          {
            actions: "clearCandidates",
          },
        ],
      },
    },
    reconciling: {
      invoke: {
        src: "reconcileRememberedDestinations",
        input: ({ context }) => {
          if (!context.activeCandidate) {
            throw new Error("Missing active remembered-destination candidate.")
          }

          return {
            service: context.service,
            candidate: context.activeCandidate,
          }
        },
        onDone: [
          {
            guard: "hasReplayCandidate",
            target: "reconciling",
            actions: [
              ({ context, event }) => {
                if (event.output.status === "reconciled" && !event.output.persisted) {
                  context.notify(
                    "Remembered last-move destination reverted because reconciliation could not persist.",
                  )
                }
              },
              "promotePendingCandidateToActive",
            ],
          },
          {
            target: "idle",
            actions: [
              ({ context, event }) => {
                if (event.output.status === "reconciled" && !event.output.persisted) {
                  context.notify(
                    "Remembered last-move destination reverted because reconciliation could not persist.",
                  )
                }
              },
              "clearCandidates",
            ],
          },
        ],
        onError: {
          target: "idle",
          actions: [
            ({ context, event }) => {
              const message =
                event.error instanceof Error ? event.error.message : String(event.error)
              context.notify(`Quick-move reconciliation failed: ${message}`)
            },
            "clearCandidates",
          ],
        },
      },
      on: {
        PROJECTION_UPDATED: {
          actions: "updatePendingCandidateFromEvent",
        },
      },
    },
  },
})

export const createRememberedDestinationReconcileActor = (
  input: RememberedDestinationReconcileMachineInput,
) => {
  return createActor(rememberedDestinationReconcileMachine, {
    input,
  })
}
