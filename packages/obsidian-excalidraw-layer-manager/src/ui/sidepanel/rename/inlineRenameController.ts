import { assign, createActor, fromPromise, setup } from "xstate"

import type { ExecuteIntentOutcome } from "../../../runtime/intentExecution.js"
import { didInteractionApply } from "../../interactionOutcome.js"
import type { LayerManagerUiActions } from "../../renderer.js"

interface InlineRenameState {
  readonly nodeId: string
  readonly draft: string
  readonly shouldAutofocusInput: boolean
}

interface InlineRenameLogPayload {
  readonly [key: string]: unknown
}

interface SidepanelInlineRenameControllerHost {
  notify: (message: string) => void
  requestRenderFromLatestModel: () => void
  setShouldAutofocusContentRoot: (value: boolean) => void
  focusContentRoot: () => void
  suppressNextContentFocusOut: () => void
  getFocusedNodeId: () => string | null
  getKeyboardCaptureActive: () => boolean
  debugInteraction?: (message: string, payload?: InlineRenameLogPayload) => void
}

interface InlineRenameMachineInput {
  readonly host: SidepanelInlineRenameControllerHost
}

interface InlineRenameCommitResolutionEmpty {
  readonly kind: "emptyName"
}

interface InlineRenameCommitResolutionIgnored {
  readonly kind: "ignored"
}

interface InlineRenameCommitResolutionApplied {
  readonly kind: "applied"
  readonly nodeId: string
  readonly outcome: ExecuteIntentOutcome
}

interface InlineRenameCommitResolutionNotApplied {
  readonly kind: "notApplied"
  readonly nodeId: string
  readonly outcome: ExecuteIntentOutcome
  readonly preservedDraft: string
}

type InlineRenameCommitResolution =
  | InlineRenameCommitResolutionEmpty
  | InlineRenameCommitResolutionIgnored
  | InlineRenameCommitResolutionApplied
  | InlineRenameCommitResolutionNotApplied

interface ActiveInlineRenameCommit {
  readonly nodeId: string
  readonly nextName: string
  readonly draft: string
  readonly actions: LayerManagerUiActions
  readonly resolve: (result: InlineRenameCommitResolution) => void
  readonly reject: (error: unknown) => void
}

interface InlineRenameMachineContext {
  readonly host: SidepanelInlineRenameControllerHost
  readonly inlineRenameState: InlineRenameState | null
  readonly activeCommit: ActiveInlineRenameCommit | null
}

type BeginInlineRenameEvent = {
  readonly type: "BEGIN_INLINE_RENAME"
  readonly nodeId: string
  readonly initialValue: string
}

type UpdateInlineRenameDraftEvent = {
  readonly type: "UPDATE_INLINE_RENAME_DRAFT"
  readonly nextDraft: string
}

type CancelInlineRenameEvent = {
  readonly type: "CANCEL_INLINE_RENAME"
}

type MarkInlineRenameAutofocusHandledEvent = {
  readonly type: "MARK_INLINE_RENAME_AUTOFOCUS_HANDLED"
  readonly nodeId: string
}

type ClearInlineRenameEvent = {
  readonly type: "CLEAR_INLINE_RENAME"
}

type CommitInlineRenameEvent = {
  readonly type: "COMMIT_INLINE_RENAME"
  readonly actions: LayerManagerUiActions
  readonly nodeId: string
  readonly resolve: (result: InlineRenameCommitResolution) => void
  readonly reject: (error: unknown) => void
}

type InlineRenameMachineEvent =
  | BeginInlineRenameEvent
  | UpdateInlineRenameDraftEvent
  | CancelInlineRenameEvent
  | MarkInlineRenameAutofocusHandledEvent
  | ClearInlineRenameEvent
  | CommitInlineRenameEvent

interface InlineRenameCommitActorInput {
  readonly actions: LayerManagerUiActions
  readonly nodeId: string
  readonly nextName: string
  readonly draft: string
}

interface InlineRenameCommitActorOutput {
  readonly nodeId: string
  readonly draft: string
  readonly outcome: ExecuteIntentOutcome
}

const haveSameInlineRenameState = (
  left: InlineRenameState | null,
  right: InlineRenameState | null,
): boolean => {
  if (!left || !right) {
    return left === right
  }

  return (
    left.nodeId === right.nodeId &&
    left.draft === right.draft &&
    left.shouldAutofocusInput === right.shouldAutofocusInput
  )
}

const inlineRenameMachine = setup({
  types: {
    context: {} as InlineRenameMachineContext,
    input: {} as InlineRenameMachineInput,
    events: {} as InlineRenameMachineEvent,
  },
  actors: {
    commitInlineRename: fromPromise(async ({ input }: { input: InlineRenameCommitActorInput }) => {
      return {
        nodeId: input.nodeId,
        draft: input.draft,
        outcome: await input.actions.renameNode(input.nodeId, input.nextName),
      } satisfies InlineRenameCommitActorOutput
    }),
  },
  guards: {
    isDuplicateBegin: ({ context, event }) => {
      if (event.type !== "BEGIN_INLINE_RENAME") {
        return false
      }

      const current = context.inlineRenameState
      return current?.nodeId === event.nodeId && current.draft === event.initialValue
    },
    hasNonEmptyCommitDraft: ({ context, event }) => {
      if (event.type !== "COMMIT_INLINE_RENAME") {
        return false
      }

      const current = context.inlineRenameState
      return current?.nodeId === event.nodeId && current.draft.trim().length > 0
    },
    isCommitForActiveNode: ({ context, event }) => {
      if (event.type !== "COMMIT_INLINE_RENAME") {
        return false
      }

      return context.inlineRenameState?.nodeId === event.nodeId
    },
    didCommitApply: ({ event }) => {
      const { output } = event as unknown as { output: InlineRenameCommitActorOutput }
      return didInteractionApply(output.outcome)
    },
    hasInlineRenameState: ({ context }) => context.inlineRenameState !== null,
  },
  actions: {
    setInlineRenameStateFromEvent: assign({
      inlineRenameState: ({ context, event }) => {
        if (event.type !== "BEGIN_INLINE_RENAME") {
          return context.inlineRenameState
        }

        return {
          nodeId: event.nodeId,
          draft: event.initialValue,
          shouldAutofocusInput: true,
        } satisfies InlineRenameState
      },
    }),
    updateInlineRenameDraftFromEvent: assign({
      inlineRenameState: ({ context, event }) => {
        if (event.type !== "UPDATE_INLINE_RENAME_DRAFT") {
          return context.inlineRenameState
        }

        const current = context.inlineRenameState
        if (!current) {
          return current
        }

        return {
          ...current,
          draft: event.nextDraft,
          shouldAutofocusInput: false,
        } satisfies InlineRenameState
      },
    }),
    clearInlineRenameState: assign({
      inlineRenameState: null,
    }),
    clearActiveCommit: assign({
      activeCommit: null,
    }),
    clearAll: assign({
      inlineRenameState: null,
      activeCommit: null,
    }),
    markAutofocusHandledFromEvent: assign({
      inlineRenameState: ({ context, event }) => {
        if (event.type !== "MARK_INLINE_RENAME_AUTOFOCUS_HANDLED") {
          return context.inlineRenameState
        }

        const current = context.inlineRenameState
        if (!current || current.nodeId !== event.nodeId || !current.shouldAutofocusInput) {
          return current
        }

        return {
          ...current,
          shouldAutofocusInput: false,
        } satisfies InlineRenameState
      },
    }),
    storeActiveCommitFromEvent: assign({
      activeCommit: ({ context, event }) => {
        if (event.type !== "COMMIT_INLINE_RENAME") {
          return context.activeCommit
        }

        const current = context.inlineRenameState
        if (!current || current.nodeId !== event.nodeId) {
          return context.activeCommit
        }

        return {
          nodeId: event.nodeId,
          nextName: current.draft.trim(),
          draft: current.draft,
          actions: event.actions,
          resolve: event.resolve,
          reject: event.reject,
        } satisfies ActiveInlineRenameCommit
      },
    }),
    resolveCommitAsEmptyName: ({ event }) => {
      if (event.type !== "COMMIT_INLINE_RENAME") {
        return
      }

      event.resolve({
        kind: "emptyName",
      })
    },
    resolveCommitAsIgnored: ({ event }) => {
      if (event.type !== "COMMIT_INLINE_RENAME") {
        return
      }

      event.resolve({
        kind: "ignored",
      })
    },
    resolveAppliedCommit: ({ context, event }) => {
      const { output } = event as unknown as { output: InlineRenameCommitActorOutput }
      context.activeCommit?.resolve({
        kind: "applied",
        nodeId: output.nodeId,
        outcome: output.outcome,
      })
    },
    resolveNotAppliedCommit: ({ context, event }) => {
      const { output } = event as unknown as { output: InlineRenameCommitActorOutput }
      context.activeCommit?.resolve({
        kind: "notApplied",
        nodeId: output.nodeId,
        outcome: output.outcome,
        preservedDraft: output.draft,
      })
    },
    rejectActiveCommit: ({ context, event }) => {
      const { error } = event as unknown as { error: unknown }
      context.activeCommit?.reject(error)
    },
    notifyEmptyName: ({ context }) => {
      context.host.notify("Rename failed: name cannot be empty.")
    },
  },
}).createMachine({
  id: "sidepanelInlineRename",
  initial: "idle",
  context: ({ input }) => ({
    host: input.host,
    inlineRenameState: null,
    activeCommit: null,
  }),
  states: {
    idle: {
      on: {
        BEGIN_INLINE_RENAME: {
          target: "editing",
          actions: "setInlineRenameStateFromEvent",
        },
        CLEAR_INLINE_RENAME: {
          actions: "clearAll",
        },
      },
    },
    editing: {
      on: {
        BEGIN_INLINE_RENAME: [
          {
            guard: "isDuplicateBegin",
          },
          {
            actions: "setInlineRenameStateFromEvent",
          },
        ],
        UPDATE_INLINE_RENAME_DRAFT: {
          actions: "updateInlineRenameDraftFromEvent",
        },
        CANCEL_INLINE_RENAME: {
          target: "idle",
          actions: "clearInlineRenameState",
        },
        MARK_INLINE_RENAME_AUTOFOCUS_HANDLED: {
          actions: "markAutofocusHandledFromEvent",
        },
        CLEAR_INLINE_RENAME: {
          target: "idle",
          actions: "clearAll",
        },
        COMMIT_INLINE_RENAME: [
          {
            guard: "hasNonEmptyCommitDraft",
            target: "committing",
            actions: "storeActiveCommitFromEvent",
          },
          {
            guard: "isCommitForActiveNode",
            actions: ["notifyEmptyName", "resolveCommitAsEmptyName"],
          },
          {
            actions: "resolveCommitAsIgnored",
          },
        ],
      },
    },
    committing: {
      invoke: {
        src: "commitInlineRename",
        input: ({ context }) => {
          if (!context.activeCommit) {
            throw new Error("Missing active inline-rename commit.")
          }

          return {
            actions: context.activeCommit.actions,
            nodeId: context.activeCommit.nodeId,
            nextName: context.activeCommit.nextName,
            draft: context.activeCommit.draft,
          } satisfies InlineRenameCommitActorInput
        },
        onDone: [
          {
            guard: "didCommitApply",
            target: "idle",
            actions: ["clearInlineRenameState", "resolveAppliedCommit", "clearActiveCommit"],
          },
          {
            guard: "hasInlineRenameState",
            target: "editing",
            actions: ["resolveNotAppliedCommit", "clearActiveCommit"],
          },
          {
            target: "idle",
            actions: ["resolveNotAppliedCommit", "clearActiveCommit"],
          },
        ],
        onError: [
          {
            guard: "hasInlineRenameState",
            target: "editing",
            actions: ["rejectActiveCommit", "clearActiveCommit"],
          },
          {
            target: "idle",
            actions: ["rejectActiveCommit", "clearActiveCommit"],
          },
        ],
      },
      on: {
        CLEAR_INLINE_RENAME: {
          actions: "clearInlineRenameState",
        },
      },
    },
  },
})

export const createInlineRenameActor = (input: InlineRenameMachineInput) => {
  return createActor(inlineRenameMachine, {
    input,
  })
}

export class SidepanelInlineRenameController {
  readonly #host: SidepanelInlineRenameControllerHost
  readonly #actor: ReturnType<typeof createInlineRenameActor>

  constructor(host: SidepanelInlineRenameControllerHost) {
    this.#host = host
    this.#actor = createInlineRenameActor({
      host,
    })
    this.#actor.start()
  }

  get state(): InlineRenameState | null {
    return this.#actor.getSnapshot().context.inlineRenameState
  }

  get nodeId(): string | null {
    return this.state?.nodeId ?? null
  }

  dispose(): void {
    this.#actor.stop()
  }

  clear(): void {
    this.#actor.send({
      type: "CLEAR_INLINE_RENAME",
    })
  }

  beginInlineRename(nodeId: string, initialValue: string): void {
    const previousState = this.state

    this.#actor.send({
      type: "BEGIN_INLINE_RENAME",
      nodeId,
      initialValue,
    })

    const nextState = this.state
    if (haveSameInlineRenameState(previousState, nextState)) {
      return
    }

    this.#host.debugInteraction?.("inline rename begin", {
      nodeId,
      initialValue,
      focusedNodeId: this.#host.getFocusedNodeId(),
    })

    this.#host.requestRenderFromLatestModel()
  }

  updateInlineRenameDraft(nextDraft: string): void {
    this.#actor.send({
      type: "UPDATE_INLINE_RENAME_DRAFT",
      nextDraft,
    })
  }

  cancelInlineRename(): void {
    if (!this.state || this.#actor.getSnapshot().matches("committing")) {
      return
    }

    this.#actor.send({
      type: "CANCEL_INLINE_RENAME",
    })

    this.#host.setShouldAutofocusContentRoot(true)
    this.#host.focusContentRoot()
    this.#host.requestRenderFromLatestModel()
  }

  async commitInlineRename(actions: LayerManagerUiActions, nodeId: string): Promise<void> {
    const current = this.state
    if (!current || current.nodeId !== nodeId || this.#actor.getSnapshot().matches("committing")) {
      return
    }

    const nextName = current.draft.trim()
    if (nextName.length > 0) {
      this.#host.debugInteraction?.("inline rename commit requested", {
        nodeId,
        nextName,
        focusedNodeId: this.#host.getFocusedNodeId(),
        keyboardCaptureActive: this.#host.getKeyboardCaptureActive(),
      })
    }

    const resolution = await new Promise<InlineRenameCommitResolution>((resolve, reject) => {
      this.#actor.send({
        type: "COMMIT_INLINE_RENAME",
        actions,
        nodeId,
        resolve,
        reject,
      })
    })

    if (resolution.kind === "emptyName" || resolution.kind === "ignored") {
      return
    }

    if (resolution.kind === "notApplied") {
      this.#host.debugInteraction?.("inline rename commit finished", {
        nodeId: resolution.nodeId,
        outcomeStatus: resolution.outcome.status,
        preservedDraft: resolution.preservedDraft,
        focusedNodeId: this.#host.getFocusedNodeId(),
        keyboardCaptureActive: this.#host.getKeyboardCaptureActive(),
      })
      return
    }

    this.#host.requestRenderFromLatestModel()
    this.#host.suppressNextContentFocusOut()
    this.#host.setShouldAutofocusContentRoot(true)
    this.#host.focusContentRoot()
    Promise.resolve().then(() => {
      if (!this.state) {
        this.#host.requestRenderFromLatestModel()
      }
    })

    this.#host.debugInteraction?.("inline rename commit finished", {
      nodeId: resolution.nodeId,
      outcomeStatus: resolution.outcome.status,
      focusedNodeId: this.#host.getFocusedNodeId(),
      keyboardCaptureActive: this.#host.getKeyboardCaptureActive(),
    })
  }

  markAutofocusHandled(nodeId: string): void {
    this.#actor.send({
      type: "MARK_INLINE_RENAME_AUTOFOCUS_HANDLED",
      nodeId,
    })
  }
}
