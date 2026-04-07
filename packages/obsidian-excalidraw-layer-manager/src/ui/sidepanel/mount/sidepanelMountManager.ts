export interface SidepanelMountTabLike {
  contentEl?: HTMLElement
  setContent?: (content: HTMLElement | string) => void
  setTitle?: (title: string) => void
  open?: () => void
  close?: () => void
  getHostEA?: () => unknown
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

const ALLOWED_SIDEPANEL_STATE_TRANSITIONS: Readonly<
  Record<SidepanelMountState, readonly SidepanelMountState[]>
> = {
  idle: ["resolvingTab", "closed"],
  resolvingTab: ["mounting", "failed", "closed"],
  mounting: ["mounted", "failed", "closed"],
  mounted: ["resolvingTab", "mounting", "closed"],
  failed: ["resolvingTab", "closed"],
  closed: ["resolvingTab"],
}

const isPromiseLike = <T>(value: unknown): value is PromiseLike<T> => {
  return !!value && typeof value === "object" && "then" in value
}

const isTabRenderable = (
  tab: SidepanelMountTabLike | null | undefined,
): tab is SidepanelMountTabLike => {
  return !!tab && (!!tab.contentEl || typeof tab.setContent === "function")
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

interface SidepanelMountManagerInput {
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

export class SidepanelMountManager {
  readonly #host: SidepanelMountHostLike
  readonly #title: string
  readonly #notify: (message: string) => void
  readonly #debugLifecycle: (message: string) => void
  readonly #onTabSwitched: () => void
  readonly #onAsyncTabResolved: () => void
  readonly #onPersistedTabDetected: () => void

  #activeTab: SidepanelMountTabLike | null = null
  #didOpenTab = false
  #pendingTabCreation: Promise<SidepanelMountTabLike | null> | null = null

  #mountState: SidepanelMountState = "idle"
  #lastMountFailureReason: SidepanelMountFailureReason | null = null
  #lastNotifiedMountFailureReason: SidepanelMountFailureReason | null = null
  #mountCapabilities: SidepanelMountCapabilities | null = null
  #mountTelemetry: MountLifecycleTelemetry = {
    attachCount: 0,
    attachFailureCount: 0,
    attachRetryCount: 0,
  }

  constructor(input: SidepanelMountManagerInput) {
    this.#host = input.host
    this.#title = input.title
    this.#notify = input.notify
    this.#debugLifecycle = input.debugLifecycle
    this.#onTabSwitched = input.onTabSwitched
    this.#onAsyncTabResolved = input.onAsyncTabResolved
    this.#onPersistedTabDetected = input.onPersistedTabDetected
  }

  get mountCapabilities(): SidepanelMountCapabilities | null {
    return this.#mountCapabilities
  }

  get mountTelemetry(): Readonly<MountLifecycleTelemetry> {
    return this.#mountTelemetry
  }

  adoptPersistedTab(tab: SidepanelMountTabLike): void {
    this.#host.sidepanelTab = tab
    this.#activeTab = tab
    this.#mountCapabilities = this.toMountCapabilities(tab)
  }

  resetAfterClose(): void {
    this.#didOpenTab = false
    this.#host.sidepanelTab = null
    this.#activeTab = null
    this.#mountCapabilities = null
    this.transitionMountState("closed")
  }

  prepareMount(input: {
    readonly resolveExistingContentRoot: () => HTMLElement | null
    readonly onSetContentFailure: () => void
  }): MountPreparationOutcome {
    if (this.#mountState === "failed") {
      this.#mountTelemetry.attachRetryCount += 1
    }

    this.transitionMountState("resolvingTab")
    const tab = this.ensureSidepanelTab()
    if (!tab) {
      if (this.#pendingTabCreation) {
        return {
          status: "pending",
        }
      }

      this.setMountFailure(
        this.#lastMountFailureReason === "tabUnrenderable" ? "tabUnrenderable" : "tabUnavailable",
      )
      return {
        status: "unavailable",
      }
    }

    this.#mountCapabilities = this.toMountCapabilities(tab)

    const mountStrategy = createSidepanelMountStrategy({
      tab,
      existingContentRoot: input.resolveExistingContentRoot(),
      onSetContentFailure: input.onSetContentFailure,
    })

    if (!mountStrategy) {
      this.setMountFailure("attachTargetMissing")
      return {
        status: "unavailable",
      }
    }

    const ownerDocument = mountStrategy.resolveOwnerDocument()
    if (!ownerDocument) {
      this.setMountFailure("ownerDocumentUnavailable")
      return {
        status: "unavailable",
      }
    }

    this.transitionMountState("mounting")
    this.#mountTelemetry.attachCount += 1

    return {
      status: "ready",
      mountStrategy,
      ownerDocument,
    }
  }

  finalizeMountAttach(outcome: AttachContentRootOutcome): boolean {
    if (!outcome.ok) {
      this.setMountFailure(outcome.reason)
      return false
    }

    this.clearMountFailure()
    return true
  }

  private transitionMountState(next: SidepanelMountState): void {
    const current = this.#mountState
    if (current === next) {
      return
    }

    const allowed = ALLOWED_SIDEPANEL_STATE_TRANSITIONS[current] ?? []
    if (!allowed.includes(next)) {
      this.#debugLifecycle(`invalid transition ${current} -> ${next}; forcing failed state`)
      this.#mountState = "failed"
      return
    }

    this.#mountState = next
  }

  private toMountFailureMessage(reason: SidepanelMountFailureReason): string | null {
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

  private setMountFailure(reason: SidepanelMountFailureReason): void {
    this.#lastMountFailureReason = reason
    this.#mountTelemetry.attachFailureCount += 1
    this.#debugLifecycle(`mount failed with reason=${reason}`)

    if (this.#lastNotifiedMountFailureReason !== reason) {
      const failureMessage = this.toMountFailureMessage(reason)
      if (failureMessage) {
        this.#notify(failureMessage)
      }

      this.#lastNotifiedMountFailureReason = reason
    }

    this.transitionMountState("failed")
  }

  private clearMountFailure(): void {
    this.#lastMountFailureReason = null
    this.#lastNotifiedMountFailureReason = null
    this.transitionMountState("mounted")
  }

  private toMountCapabilities(tab: SidepanelMountTabLike): SidepanelMountCapabilities {
    return {
      canUseContentEl: !!tab.contentEl,
      canUseSetContent: typeof tab.setContent === "function",
      canClose: typeof tab.close === "function" || !!this.#host.closeSidepanelTab,
    }
  }

  private isLikelyPersistedTab(tab: SidepanelMountTabLike): boolean {
    const getHostEA = tab.getHostEA
    if (!getHostEA) {
      return false
    }

    try {
      const hostEA = getHostEA()
      return !!hostEA && hostEA !== this.#host
    } catch {
      return false
    }
  }

  private ensureSidepanelTab(): SidepanelMountTabLike | null {
    let observedUnrenderableCandidate = false
    let tab = isTabRenderable(this.#host.sidepanelTab) ? this.#host.sidepanelTab : null

    if (!tab && this.#host.sidepanelTab && !isTabRenderable(this.#host.sidepanelTab)) {
      observedUnrenderableCandidate = true
      this.#lastMountFailureReason = "tabUnrenderable"
      this.#host.sidepanelTab = null
    }

    if (!tab && this.#host.checkForActiveSidepanelTabForScript) {
      const lookedUp = this.#host.checkForActiveSidepanelTabForScript(this.#host.activeScript)
      if (isTabRenderable(lookedUp)) {
        tab = lookedUp
      } else if (lookedUp) {
        observedUnrenderableCandidate = true
      }
    }

    if (!tab && this.#host.createSidepanelTab && !this.#pendingTabCreation) {
      const created = this.#host.createSidepanelTab(this.#title, false, true)

      if (isPromiseLike<SidepanelMountTabLike | null>(created)) {
        const pendingTabCreation = Promise.resolve(created)
        this.#pendingTabCreation = pendingTabCreation

        void pendingTabCreation
          .then((resolved) => {
            if (!isTabRenderable(resolved)) {
              return
            }

            this.#host.sidepanelTab = resolved
            if (this.isLikelyPersistedTab(resolved)) {
              this.#onPersistedTabDetected()
            }

            this.#onAsyncTabResolved()
          })
          .catch(() => {
            this.#notify("Failed to create Layer Manager sidepanel tab.")
          })
          .finally(() => {
            if (this.#pendingTabCreation === pendingTabCreation) {
              this.#pendingTabCreation = null
            }
          })
      }

      if (!isPromiseLike<SidepanelMountTabLike | null>(created) && isTabRenderable(created)) {
        tab = created
      } else if (!isPromiseLike<SidepanelMountTabLike | null>(created) && created) {
        observedUnrenderableCandidate = true
      } else if (isTabRenderable(this.#host.sidepanelTab)) {
        tab = this.#host.sidepanelTab
      }
    }

    if (!tab) {
      if (observedUnrenderableCandidate) {
        this.#lastMountFailureReason = "tabUnrenderable"
      }

      return null
    }

    if (tab !== this.#activeTab) {
      this.#onTabSwitched()
      this.#activeTab = tab
      this.#didOpenTab = false
    }

    if (this.isLikelyPersistedTab(tab)) {
      this.#onPersistedTabDetected()
    }

    tab.setTitle?.(this.#title)
    if (!this.#didOpenTab) {
      tab.open?.()
      this.#didOpenTab = true
    }
    this.#host.sidepanelTab = tab

    return tab
  }
}
