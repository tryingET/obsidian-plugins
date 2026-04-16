import { assign, createActor, setup } from "xstate"

export interface SidepanelMountTabLike {
  contentEl?: HTMLElement
  setContent?: (content: HTMLElement | string) => void
  setTitle?: (title: string) => void
  open?: () => void
  close?: () => void
  getHostEA?: () => unknown
  onExcalidrawViewClosed?: () => void
}

export interface SidepanelMountHostLike {
  sidepanelTab?: SidepanelMountTabLike | null
  createSidepanelTab?: (
    title: string,
    persist?: boolean,
    reveal?: boolean,
  ) => SidepanelMountTabLike | Promise<SidepanelMountTabLike | null> | undefined
  checkForActiveSidepanelTabForScript?: (scriptName?: string) => SidepanelMountTabLike | null
  activeScript?: string
  closeSidepanelTab?: () => void
}

type SidepanelMountState = "idle" | "resolvingTab" | "mounting" | "mounted" | "failed" | "closed"

type SidepanelMountFailureReason =
  | "tabUnavailable"
  | "tabUnrenderable"
  | "ownerDocumentUnavailable"
  | "attachTargetMissing"
  | "setContentFailed"

interface SidepanelMountCapabilities {
  readonly canUseContentEl: boolean
  readonly canUseSetContent: boolean
  readonly canClose: boolean
}

interface MountLifecycleTelemetry {
  attachCount: number
  attachFailureCount: number
  attachRetryCount: number
}

type SidepanelMountStrategyKind = "contentEl" | "setContent"

interface SidepanelMountStrategy {
  readonly kind: SidepanelMountStrategyKind
  resolveOwnerDocument: () => Document | null
  attach: (contentRoot: HTMLElement) => AttachContentRootOutcome
}

type AttachContentRootOutcome =
  | {
      readonly ok: true
    }
  | {
      readonly ok: false
      readonly reason: SidepanelMountFailureReason
    }

const isPromiseLike = <T>(value: unknown): value is PromiseLike<T> => {
  return !!value && typeof value === "object" && "then" in value
}

const isTabRenderable = (
  tab: SidepanelMountTabLike | null | undefined,
): tab is SidepanelMountTabLike => {
  return !!tab && (!!tab.contentEl || typeof tab.setContent === "function")
}

const toMountCapabilities = (
  host: SidepanelMountHostLike,
  tab: SidepanelMountTabLike,
): SidepanelMountCapabilities => {
  return {
    canUseContentEl: !!tab.contentEl,
    canUseSetContent: typeof tab.setContent === "function",
    canClose: typeof tab.close === "function" || !!host.closeSidepanelTab,
  }
}

const isLikelyPersistedTab = (
  host: SidepanelMountHostLike,
  tab: SidepanelMountTabLike,
): boolean => {
  const getHostEA = tab.getHostEA
  if (!getHostEA) {
    return false
  }

  try {
    const hostEA = getHostEA()
    return !!hostEA && hostEA !== host
  } catch {
    return false
  }
}

const createSidepanelMountStrategy = (input: {
  readonly tab: SidepanelMountTabLike
  readonly existingContentRoot: HTMLElement | null
  readonly onSetContentFailure: () => void
}): SidepanelMountStrategy | null => {
  if (input.tab.contentEl) {
    const contentEl = input.tab.contentEl

    return {
      kind: "contentEl",
      resolveOwnerDocument: () => contentEl.ownerDocument,
      attach: (contentRoot) => {
        if (!contentEl.contains(contentRoot)) {
          contentEl.innerHTML = ""
          contentEl.appendChild(contentRoot)
        }

        return {
          ok: true,
        }
      },
    }
  }

  if (input.tab.setContent) {
    const setContent = input.tab.setContent

    return {
      kind: "setContent",
      resolveOwnerDocument: () => {
        if (input.existingContentRoot) {
          return input.existingContentRoot.ownerDocument
        }

        if (typeof document !== "undefined") {
          return document
        }

        return null
      },
      attach: (contentRoot) => {
        try {
          setContent(contentRoot)
          return {
            ok: true,
          }
        } catch {
          input.onSetContentFailure()
          return {
            ok: false,
            reason: "setContentFailed",
          }
        }
      },
    }
  }

  return null
}

export interface SidepanelMountManagerInput {
  readonly host: SidepanelMountHostLike
  readonly title: string
  readonly notify: (message: string) => void
  readonly debugLifecycle: (message: string) => void
  readonly onTabSwitched: () => void
  readonly onAsyncTabResolved: () => void
  readonly onPersistedTabDetected: () => void
}

type MountPreparationOutcome =
  | {
      readonly status: "pending"
    }
  | {
      readonly status: "unavailable"
    }
  | {
      readonly status: "ready"
      readonly mountStrategy: SidepanelMountStrategy
      readonly ownerDocument: Document
    }

interface SidepanelMountMachineInput extends SidepanelMountManagerInput {}

interface SidepanelMountMachineContext {
  readonly host: SidepanelMountHostLike
  readonly notify: (message: string) => void
  readonly debugLifecycle: (message: string) => void
  readonly onTabSwitched: () => void
  readonly onAsyncTabResolved: () => void
  readonly onPersistedTabDetected: () => void
  readonly activeTab: SidepanelMountTabLike | null
  readonly didOpenTab: boolean
  readonly pendingTabCreation: Promise<SidepanelMountTabLike | null> | null
  readonly lastMountFailureReason: SidepanelMountFailureReason | null
  readonly lastNotifiedMountFailureReason: SidepanelMountFailureReason | null
  readonly mountCapabilities: SidepanelMountCapabilities | null
  readonly mountTelemetry: MountLifecycleTelemetry
}

type SidepanelMountMachineEvent =
  | {
      readonly type: "START_PREPARE_MOUNT"
    }
  | {
      readonly type: "MARK_ATTACH_RETRY"
    }
  | {
      readonly type: "REGISTER_PENDING_TAB_CREATION"
      readonly pendingTabCreation: Promise<SidepanelMountTabLike | null>
    }
  | {
      readonly type: "CLEAR_PENDING_TAB_CREATION"
      readonly pendingTabCreation: Promise<SidepanelMountTabLike | null>
    }
  | {
      readonly type: "REGISTER_ASYNC_RESOLVED_TAB"
      readonly tab: SidepanelMountTabLike
      readonly persisted: boolean
    }
  | {
      readonly type: "REGISTER_ACTIVE_TAB"
      readonly tab: SidepanelMountTabLike
    }
  | {
      readonly type: "MARK_ACTIVE_TAB_OPENED"
    }
  | {
      readonly type: "MARK_ATTACH_ATTEMPT"
    }
  | {
      readonly type: "ATTACH_FAILED"
      readonly reason: SidepanelMountFailureReason
    }
  | {
      readonly type: "ATTACH_SUCCEEDED"
    }
  | {
      readonly type: "ADOPT_PERSISTED_TAB"
      readonly tab: SidepanelMountTabLike
    }
  | {
      readonly type: "RESET_AFTER_CLOSE"
    }

const toMountFailureMessage = (reason: SidepanelMountFailureReason): string | null => {
  switch (reason) {
    case "tabUnavailable":
      return "Layer Manager sidepanel unavailable in this host. Falling back to console renderer."
    case "tabUnrenderable":
      return "Layer Manager sidepanel tab is not renderable in this host. Falling back to console renderer."
    case "ownerDocumentUnavailable":
      return "Layer Manager sidepanel owner document is unavailable. Falling back to console renderer."
    case "attachTargetMissing":
      return "Layer Manager sidepanel has no valid attach target. Falling back to console renderer."
    case "setContentFailed":
      return null
  }
}

const sidepanelMountMachine = setup({
  types: {
    context: {} as SidepanelMountMachineContext,
    input: {} as SidepanelMountMachineInput,
    events: {} as SidepanelMountMachineEvent,
  },
  actions: {
    markAttachRetry: assign({
      mountTelemetry: ({ context }) => ({
        ...context.mountTelemetry,
        attachRetryCount: context.mountTelemetry.attachRetryCount + 1,
      }),
    }),
    registerPendingTabCreationFromEvent: assign({
      pendingTabCreation: ({ context, event }) => {
        if (event.type !== "REGISTER_PENDING_TAB_CREATION") {
          return context.pendingTabCreation
        }

        return event.pendingTabCreation
      },
    }),
    clearPendingTabCreationFromEvent: assign({
      pendingTabCreation: ({ context, event }) => {
        if (event.type !== "CLEAR_PENDING_TAB_CREATION") {
          return context.pendingTabCreation
        }

        return context.pendingTabCreation === event.pendingTabCreation
          ? null
          : context.pendingTabCreation
      },
    }),
    registerAsyncResolvedTabFromEvent: ({ context, event }) => {
      if (event.type !== "REGISTER_ASYNC_RESOLVED_TAB") {
        return
      }

      context.host.sidepanelTab = event.tab
      if (event.persisted) {
        context.onPersistedTabDetected()
      }

      context.onAsyncTabResolved()
    },
    registerActiveTabFromEvent: assign(({ context, event }) => {
      if (event.type !== "REGISTER_ACTIVE_TAB") {
        return {}
      }

      context.host.sidepanelTab = event.tab

      const didSwitch = event.tab !== context.activeTab
      if (didSwitch) {
        context.onTabSwitched()
      }

      return {
        activeTab: event.tab,
        didOpenTab: didSwitch ? false : context.didOpenTab,
        mountCapabilities: toMountCapabilities(context.host, event.tab),
      }
    }),
    markActiveTabOpened: assign(({ context }) => {
      context.activeTab?.open?.()
      return {
        didOpenTab: true,
      }
    }),
    markAttachAttempt: assign({
      mountTelemetry: ({ context }) => ({
        ...context.mountTelemetry,
        attachCount: context.mountTelemetry.attachCount + 1,
      }),
    }),
    recordAttachFailureFromEvent: assign(({ context, event }) => {
      if (event.type !== "ATTACH_FAILED") {
        return {}
      }

      context.debugLifecycle(`mount failed with reason=${event.reason}`)

      if (context.lastNotifiedMountFailureReason !== event.reason) {
        const failureMessage = toMountFailureMessage(event.reason)
        if (failureMessage) {
          context.notify(failureMessage)
        }
      }

      return {
        lastMountFailureReason: event.reason,
        lastNotifiedMountFailureReason: event.reason,
        mountTelemetry: {
          ...context.mountTelemetry,
          attachFailureCount: context.mountTelemetry.attachFailureCount + 1,
        },
      }
    }),
    clearAttachFailure: assign({
      lastMountFailureReason: null,
      lastNotifiedMountFailureReason: null,
    }),
    adoptPersistedTabFromEvent: assign(({ context, event }) => {
      if (event.type !== "ADOPT_PERSISTED_TAB") {
        return {}
      }

      context.host.sidepanelTab = event.tab

      const didSwitch = event.tab !== context.activeTab
      if (didSwitch) {
        context.onTabSwitched()
      }

      return {
        activeTab: event.tab,
        didOpenTab: didSwitch ? false : context.didOpenTab,
        mountCapabilities: toMountCapabilities(context.host, event.tab),
      }
    }),
    resetAfterClose: assign(({ context }) => {
      context.host.sidepanelTab = null

      return {
        activeTab: null,
        didOpenTab: false,
        pendingTabCreation: null,
        mountCapabilities: null,
      }
    }),
  },
}).createMachine({
  id: "sidepanelMount",
  initial: "idle",
  context: ({ input }) => ({
    host: input.host,
    notify: input.notify,
    debugLifecycle: input.debugLifecycle,
    onTabSwitched: input.onTabSwitched,
    onAsyncTabResolved: input.onAsyncTabResolved,
    onPersistedTabDetected: input.onPersistedTabDetected,
    activeTab: null,
    didOpenTab: false,
    pendingTabCreation: null,
    lastMountFailureReason: null,
    lastNotifiedMountFailureReason: null,
    mountCapabilities: null,
    mountTelemetry: {
      attachCount: 0,
      attachFailureCount: 0,
      attachRetryCount: 0,
    },
  }),
  on: {
    MARK_ATTACH_RETRY: {
      actions: "markAttachRetry",
    },
    REGISTER_PENDING_TAB_CREATION: {
      actions: "registerPendingTabCreationFromEvent",
    },
    CLEAR_PENDING_TAB_CREATION: {
      actions: "clearPendingTabCreationFromEvent",
    },
    REGISTER_ASYNC_RESOLVED_TAB: {
      actions: "registerAsyncResolvedTabFromEvent",
    },
    REGISTER_ACTIVE_TAB: {
      actions: "registerActiveTabFromEvent",
    },
    MARK_ACTIVE_TAB_OPENED: {
      actions: "markActiveTabOpened",
    },
  },
  states: {
    idle: {
      on: {
        START_PREPARE_MOUNT: {
          target: "resolvingTab",
        },
        ADOPT_PERSISTED_TAB: {
          target: "mounted",
          actions: "adoptPersistedTabFromEvent",
        },
        RESET_AFTER_CLOSE: {
          target: "closed",
          actions: "resetAfterClose",
        },
      },
    },
    resolvingTab: {
      on: {
        START_PREPARE_MOUNT: {
          target: "resolvingTab",
        },
        MARK_ATTACH_ATTEMPT: {
          target: "mounting",
          actions: "markAttachAttempt",
        },
        ATTACH_FAILED: {
          target: "failed",
          actions: "recordAttachFailureFromEvent",
        },
        ADOPT_PERSISTED_TAB: {
          target: "mounted",
          actions: "adoptPersistedTabFromEvent",
        },
        RESET_AFTER_CLOSE: {
          target: "closed",
          actions: "resetAfterClose",
        },
      },
    },
    mounting: {
      on: {
        ATTACH_SUCCEEDED: {
          target: "mounted",
          actions: "clearAttachFailure",
        },
        ATTACH_FAILED: {
          target: "failed",
          actions: "recordAttachFailureFromEvent",
        },
        ADOPT_PERSISTED_TAB: {
          target: "mounted",
          actions: "adoptPersistedTabFromEvent",
        },
        RESET_AFTER_CLOSE: {
          target: "closed",
          actions: "resetAfterClose",
        },
      },
    },
    mounted: {
      on: {
        START_PREPARE_MOUNT: {
          target: "resolvingTab",
        },
        MARK_ATTACH_ATTEMPT: {
          target: "mounting",
          actions: "markAttachAttempt",
        },
        ATTACH_FAILED: {
          target: "failed",
          actions: "recordAttachFailureFromEvent",
        },
        ATTACH_SUCCEEDED: {
          actions: "clearAttachFailure",
        },
        ADOPT_PERSISTED_TAB: {
          target: "mounted",
          actions: "adoptPersistedTabFromEvent",
        },
        RESET_AFTER_CLOSE: {
          target: "closed",
          actions: "resetAfterClose",
        },
      },
    },
    failed: {
      on: {
        START_PREPARE_MOUNT: {
          target: "resolvingTab",
        },
        ADOPT_PERSISTED_TAB: {
          target: "mounted",
          actions: "adoptPersistedTabFromEvent",
        },
        RESET_AFTER_CLOSE: {
          target: "closed",
          actions: "resetAfterClose",
        },
      },
    },
    closed: {
      on: {
        START_PREPARE_MOUNT: {
          target: "resolvingTab",
        },
        ADOPT_PERSISTED_TAB: {
          target: "mounted",
          actions: "adoptPersistedTabFromEvent",
        },
        RESET_AFTER_CLOSE: {
          actions: "resetAfterClose",
        },
      },
    },
  },
})

export const createSidepanelMountActor = (input: SidepanelMountMachineInput) => {
  return createActor(sidepanelMountMachine, {
    input,
  })
}

export class SidepanelMountManager {
  readonly #host: SidepanelMountHostLike
  readonly #title: string
  readonly #notify: (message: string) => void
  readonly #actor: ReturnType<typeof createSidepanelMountActor>

  #disposed = false

  constructor(input: SidepanelMountManagerInput) {
    this.#host = input.host
    this.#title = input.title
    this.#notify = input.notify
    this.#actor = createSidepanelMountActor(input)
    this.#actor.start()
  }

  get #snapshot() {
    return this.#actor.getSnapshot()
  }

  get mountCapabilities(): SidepanelMountCapabilities | null {
    return this.#snapshot.context.mountCapabilities
  }

  get mountTelemetry(): Readonly<MountLifecycleTelemetry> {
    return this.#snapshot.context.mountTelemetry
  }

  adoptPersistedTab(tab: SidepanelMountTabLike): void {
    if (this.#disposed) {
      return
    }

    this.#actor.send({
      type: "ADOPT_PERSISTED_TAB",
      tab,
    })
  }

  resetAfterClose(): void {
    if (this.#disposed) {
      return
    }

    this.#actor.send({
      type: "RESET_AFTER_CLOSE",
    })
  }

  dispose(): void {
    if (this.#disposed) {
      return
    }

    this.#disposed = true
    this.#actor.stop()
  }

  prepareMount(input: {
    readonly resolveExistingContentRoot: () => HTMLElement | null
    readonly onSetContentFailure: () => void
  }): MountPreparationOutcome {
    if (this.#disposed) {
      return {
        status: "unavailable",
      }
    }

    if (this.#snapshot.matches("failed" satisfies SidepanelMountState)) {
      this.#actor.send({
        type: "MARK_ATTACH_RETRY",
      })
    }

    this.#actor.send({
      type: "START_PREPARE_MOUNT",
    })

    const tabResolution = this.ensureSidepanelTab()
    const tab = tabResolution.tab
    if (!tab) {
      if (this.#snapshot.context.pendingTabCreation) {
        return {
          status: "pending",
        }
      }

      this.#actor.send({
        type: "ATTACH_FAILED",
        reason: tabResolution.failureReason ?? "tabUnavailable",
      })
      return {
        status: "unavailable",
      }
    }

    const mountStrategy = createSidepanelMountStrategy({
      tab,
      existingContentRoot: input.resolveExistingContentRoot(),
      onSetContentFailure: input.onSetContentFailure,
    })

    if (!mountStrategy) {
      this.#actor.send({
        type: "ATTACH_FAILED",
        reason: "attachTargetMissing",
      })
      return {
        status: "unavailable",
      }
    }

    const ownerDocument = mountStrategy.resolveOwnerDocument()
    if (!ownerDocument) {
      this.#actor.send({
        type: "ATTACH_FAILED",
        reason: "ownerDocumentUnavailable",
      })
      return {
        status: "unavailable",
      }
    }

    this.#actor.send({
      type: "MARK_ATTACH_ATTEMPT",
    })

    return {
      status: "ready",
      mountStrategy,
      ownerDocument,
    }
  }

  finalizeMountAttach(outcome: AttachContentRootOutcome): boolean {
    if (this.#disposed) {
      return false
    }

    if (!outcome.ok) {
      this.#actor.send({
        type: "ATTACH_FAILED",
        reason: outcome.reason,
      })
      return false
    }

    this.#actor.send({
      type: "ATTACH_SUCCEEDED",
    })
    return true
  }

  private ensureSidepanelTab(): {
    readonly tab: SidepanelMountTabLike | null
    readonly failureReason: SidepanelMountFailureReason | null
  } {
    let failureReason: SidepanelMountFailureReason | null = null
    let tab = isTabRenderable(this.#host.sidepanelTab) ? this.#host.sidepanelTab : null

    if (!tab && this.#host.sidepanelTab && !isTabRenderable(this.#host.sidepanelTab)) {
      failureReason = "tabUnrenderable"
      this.#host.sidepanelTab = null
    }

    if (!tab && this.#host.checkForActiveSidepanelTabForScript) {
      const lookedUp = this.#host.checkForActiveSidepanelTabForScript(this.#host.activeScript)
      if (isTabRenderable(lookedUp)) {
        tab = lookedUp
      } else if (lookedUp) {
        failureReason = "tabUnrenderable"
      }
    }

    if (!tab && this.#host.createSidepanelTab && !this.#snapshot.context.pendingTabCreation) {
      const created = this.#host.createSidepanelTab(this.#title, false, true)

      if (isPromiseLike<SidepanelMountTabLike | null>(created)) {
        const pendingTabCreation = Promise.resolve(created)
        this.#actor.send({
          type: "REGISTER_PENDING_TAB_CREATION",
          pendingTabCreation,
        })

        void pendingTabCreation
          .then((resolved) => {
            if (
              this.#disposed ||
              this.#snapshot.context.pendingTabCreation !== pendingTabCreation
            ) {
              return
            }

            if (!isTabRenderable(resolved)) {
              return
            }

            this.#actor.send({
              type: "REGISTER_ASYNC_RESOLVED_TAB",
              tab: resolved,
              persisted: isLikelyPersistedTab(this.#host, resolved),
            })
          })
          .catch(() => {
            if (this.#disposed) {
              return
            }

            this.#notify("Failed to create Layer Manager sidepanel tab.")
          })
          .finally(() => {
            if (this.#disposed) {
              return
            }

            this.#actor.send({
              type: "CLEAR_PENDING_TAB_CREATION",
              pendingTabCreation,
            })
          })
      }

      if (!isPromiseLike<SidepanelMountTabLike | null>(created) && isTabRenderable(created)) {
        tab = created
      } else if (!isPromiseLike<SidepanelMountTabLike | null>(created) && created) {
        failureReason = "tabUnrenderable"
      } else if (isTabRenderable(this.#host.sidepanelTab)) {
        tab = this.#host.sidepanelTab
      }
    }

    if (!tab) {
      return {
        tab: null,
        failureReason,
      }
    }

    this.#actor.send({
      type: "REGISTER_ACTIVE_TAB",
      tab,
    })

    if (isLikelyPersistedTab(this.#host, tab)) {
      this.#snapshot.context.onPersistedTabDetected()
    }

    tab.setTitle?.(this.#title)
    if (!this.#snapshot.context.didOpenTab) {
      this.#actor.send({
        type: "MARK_ACTIVE_TAB_OPENED",
      })
    }

    return {
      tab,
      failureReason: null,
    }
  }
}
