import { assign, createActor, setup } from "xstate"

import { SidepanelFocusOutGuard } from "./focusOutGuard.js"

const focusElementWithoutScroll = (element: HTMLElement): void => {
  try {
    element.focus({
      preventScroll: true,
    })
    return
  } catch {
    // Older host runtimes may not support FocusOptions; fall through to plain focus.
  }

  try {
    element.focus()
  } catch {
    // no-op; best-effort focus restoration
  }
}

interface SidepanelFocusOwnershipCoordinatorOptions {
  readonly nowMs?: () => number
  readonly focusOutSuppressionWindowMs: number
  readonly keyboardStickyCaptureMs: number
}

interface HandleContentFocusOutInput {
  readonly contentRoot: HTMLElement | null
  readonly relatedTarget: EventTarget | null
  readonly isContentRootCurrent?: (contentRoot: HTMLElement) => boolean
  readonly onConfirmedFocusOut: () => void
}

interface FocusContentRootBestEffortInput {
  readonly contentRoot: HTMLElement | null
  readonly isContentRootCurrent?: (contentRoot: HTMLElement) => boolean
}

interface FocusOwnershipMachineInput {
  readonly nowMs: () => number
  readonly focusOutSuppressionWindowMs: number
  readonly keyboardStickyCaptureMs: number
}

interface FocusOwnershipMachineContext {
  readonly nowMs: () => number
  readonly focusOutSuppressionWindowMs: number
  readonly keyboardStickyCaptureMs: number
  readonly focusOutGuard: SidepanelFocusOutGuard
  readonly shouldAutofocusContentRoot: boolean
  readonly keyboardCaptureActive: boolean
  readonly keyboardCaptureStickyUntilMs: number
  readonly deferredFocusEpoch: number
}

type FocusOwnershipMachineEvent =
  | {
      readonly type: "SET_SHOULD_AUTOFOCUS_CONTENT_ROOT"
      readonly value: boolean
    }
  | {
      readonly type: "ACTIVATE_KEYBOARD_CAPTURE"
    }
  | {
      readonly type: "RELEASE_KEYBOARD_CAPTURE"
    }
  | {
      readonly type: "SUPPRESS_TRANSIENT_FOCUS_OUT"
    }
  | {
      readonly type: "CANCEL_PENDING_FOCUS_OUT"
    }
  | {
      readonly type: "CANCEL_DEFERRED_FOCUS_RESTORE"
    }
  | {
      readonly type: "SCHEDULE_DEFERRED_FOCUS_RESTORE"
    }
  | {
      readonly type: "CLAIM_AUTOFOCUS_CONTENT_ROOT"
    }
  | {
      readonly type: "RESET"
    }

const focusOwnershipMachine = setup({
  types: {
    context: {} as FocusOwnershipMachineContext,
    input: {} as FocusOwnershipMachineInput,
    events: {} as FocusOwnershipMachineEvent,
  },
  actions: {
    setShouldAutofocusContentRootFromEvent: assign({
      shouldAutofocusContentRoot: ({ context, event }) => {
        if (event.type !== "SET_SHOULD_AUTOFOCUS_CONTENT_ROOT") {
          return context.shouldAutofocusContentRoot
        }

        return event.value
      },
    }),
    activateKeyboardCapture: assign({
      keyboardCaptureActive: true,
      keyboardCaptureStickyUntilMs: ({ context }) =>
        context.nowMs() + context.keyboardStickyCaptureMs,
    }),
    releaseKeyboardCapture: assign({
      keyboardCaptureActive: false,
    }),
    suppressTransientFocusOut: ({ context }) => {
      context.focusOutGuard.suppressFor(context.focusOutSuppressionWindowMs)
    },
    cancelPendingFocusOut: ({ context }) => {
      context.focusOutGuard.cancelPending()
    },
    cancelDeferredFocusRestore: assign({
      deferredFocusEpoch: ({ context }) => context.deferredFocusEpoch + 1,
    }),
    scheduleDeferredFocusRestore: assign({
      deferredFocusEpoch: ({ context }) => context.deferredFocusEpoch + 1,
    }),
    claimAutofocusContentRoot: assign({
      shouldAutofocusContentRoot: false,
      keyboardCaptureActive: true,
      keyboardCaptureStickyUntilMs: ({ context }) =>
        context.nowMs() + context.keyboardStickyCaptureMs,
    }),
    resetFocusOutGuard: ({ context }) => {
      context.focusOutGuard.reset()
    },
    resetFocusOwnership: assign({
      shouldAutofocusContentRoot: true,
      keyboardCaptureActive: false,
      keyboardCaptureStickyUntilMs: 0,
      deferredFocusEpoch: 0,
    }),
  },
}).createMachine({
  id: "sidepanelFocusOwnership",
  initial: "active",
  context: ({ input }) => ({
    nowMs: input.nowMs,
    focusOutSuppressionWindowMs: input.focusOutSuppressionWindowMs,
    keyboardStickyCaptureMs: input.keyboardStickyCaptureMs,
    focusOutGuard: new SidepanelFocusOutGuard({
      nowMs: input.nowMs,
    }),
    shouldAutofocusContentRoot: true,
    keyboardCaptureActive: false,
    keyboardCaptureStickyUntilMs: 0,
    deferredFocusEpoch: 0,
  }),
  states: {
    active: {
      on: {
        SET_SHOULD_AUTOFOCUS_CONTENT_ROOT: {
          actions: "setShouldAutofocusContentRootFromEvent",
        },
        ACTIVATE_KEYBOARD_CAPTURE: {
          actions: "activateKeyboardCapture",
        },
        RELEASE_KEYBOARD_CAPTURE: {
          actions: "releaseKeyboardCapture",
        },
        SUPPRESS_TRANSIENT_FOCUS_OUT: {
          actions: "suppressTransientFocusOut",
        },
        CANCEL_PENDING_FOCUS_OUT: {
          actions: "cancelPendingFocusOut",
        },
        CANCEL_DEFERRED_FOCUS_RESTORE: {
          actions: "cancelDeferredFocusRestore",
        },
        SCHEDULE_DEFERRED_FOCUS_RESTORE: {
          actions: "scheduleDeferredFocusRestore",
        },
        CLAIM_AUTOFOCUS_CONTENT_ROOT: {
          actions: "claimAutofocusContentRoot",
        },
        RESET: {
          actions: ["resetFocusOutGuard", "resetFocusOwnership"],
        },
      },
    },
  },
})

export const createFocusOwnershipActor = (input: FocusOwnershipMachineInput) => {
  return createActor(focusOwnershipMachine, {
    input,
  })
}

export class SidepanelFocusOwnershipCoordinator {
  readonly #actor: ReturnType<typeof createFocusOwnershipActor>

  constructor(options: SidepanelFocusOwnershipCoordinatorOptions) {
    this.#actor = createFocusOwnershipActor({
      nowMs: options.nowMs ?? Date.now,
      focusOutSuppressionWindowMs: options.focusOutSuppressionWindowMs,
      keyboardStickyCaptureMs: options.keyboardStickyCaptureMs,
    })
    this.#actor.start()
  }

  get #context(): FocusOwnershipMachineContext {
    return this.#actor.getSnapshot().context
  }

  get shouldAutofocusContentRoot(): boolean {
    return this.#context.shouldAutofocusContentRoot
  }

  setShouldAutofocusContentRoot(value: boolean): void {
    this.#actor.send({
      type: "SET_SHOULD_AUTOFOCUS_CONTENT_ROOT",
      value,
    })
  }

  isKeyboardCaptureActive(): boolean {
    return this.#context.keyboardCaptureActive
  }

  activateKeyboardCapture(): void {
    this.#actor.send({
      type: "ACTIVATE_KEYBOARD_CAPTURE",
    })
  }

  releaseKeyboardCapture(): void {
    this.#actor.send({
      type: "RELEASE_KEYBOARD_CAPTURE",
    })
  }

  isKeyboardRoutingActive(): boolean {
    const context = this.#context
    return context.keyboardCaptureActive || context.nowMs() < context.keyboardCaptureStickyUntilMs
  }

  suppressTransientFocusOut(): void {
    this.#actor.send({
      type: "SUPPRESS_TRANSIENT_FOCUS_OUT",
    })
  }

  isFocusOutSuppressed(): boolean {
    return this.#context.focusOutGuard.isSuppressed()
  }

  cancelPendingFocusOut(): void {
    this.#actor.send({
      type: "CANCEL_PENDING_FOCUS_OUT",
    })
  }

  handleContentFocusOut(input: HandleContentFocusOutInput): void {
    if (this.isFocusOutSuppressed()) {
      return
    }

    this.#context.focusOutGuard.handleFocusOut(input)
  }

  focusContentRootImmediate(contentRoot: HTMLElement | null): void {
    if (!contentRoot) {
      return
    }

    focusElementWithoutScroll(contentRoot)
  }

  cancelDeferredFocusRestore(): void {
    this.#actor.send({
      type: "CANCEL_DEFERRED_FOCUS_RESTORE",
    })
  }

  focusContentRootBestEffort(input: FocusContentRootBestEffortInput): void {
    const contentRoot = input.contentRoot
    if (!contentRoot) {
      return
    }

    this.focusContentRootImmediate(contentRoot)

    this.#actor.send({
      type: "SCHEDULE_DEFERRED_FOCUS_RESTORE",
    })
    const focusEpoch = this.#context.deferredFocusEpoch

    Promise.resolve().then(() => {
      if (this.#context.deferredFocusEpoch !== focusEpoch) {
        return
      }

      if (input.isContentRootCurrent && !input.isContentRootCurrent(contentRoot)) {
        return
      }

      this.focusContentRootImmediate(contentRoot)
    })
  }

  autofocusContentRootIfNeeded(
    contentRoot: HTMLElement,
    isTextInputTarget: (target: EventTarget | null) => boolean,
  ): void {
    if (!this.shouldAutofocusContentRoot) {
      return
    }

    const ownerDocument = contentRoot.ownerDocument
    const activeElement = ownerDocument.activeElement

    if (activeElement && contentRoot.contains(activeElement)) {
      this.#actor.send({
        type: "CLAIM_AUTOFOCUS_CONTENT_ROOT",
      })
      return
    }

    if (isTextInputTarget(activeElement)) {
      return
    }

    this.focusContentRootImmediate(contentRoot)

    const focusedElement = ownerDocument.activeElement
    if (focusedElement && contentRoot.contains(focusedElement)) {
      this.#actor.send({
        type: "CLAIM_AUTOFOCUS_CONTENT_ROOT",
      })
    }
  }

  reset(): void {
    this.#actor.send({
      type: "RESET",
    })
  }

  dispose(): void {
    this.reset()
    this.#actor.stop()
  }
}
