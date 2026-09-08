import { ensureHostViewContextState, type SidepanelHostViewContextHost } from "./hostViewContext.js"
import {
  canMirrorSelectionToSceneBinding,
  haveSameSceneBindingRefreshKey,
  resolveSceneBindingFromHost,
  type SidepanelSceneBinding,
} from "./sceneBinding.js"
import { collectUniqueSelectionIds, haveSameIds } from "./selectionIds.js"

interface SelectionElementLike {
  readonly id: string
}

interface SidepanelHostSelectionBridgeHost extends SidepanelHostViewContextHost {
  readonly selectElementsInView?: (ids: string[]) => void
  readonly getViewSelectedElements?: () => readonly SelectionElementLike[]
  readonly getExcalidrawAPI?: () => unknown
}

interface SidepanelHostSelectionBridgeInput {
  readonly host: SidepanelHostSelectionBridgeHost
  readonly suppressContentFocusOut: () => void
  readonly resolveCurrentSceneBinding?: () => SidepanelSceneBinding
}

type SelectionMirrorAttemptResult = "applied" | "failed" | "hostUnavailable"
type SelectionMirrorVerificationResult = "match" | "mismatch" | "hostUnavailable"

export class SidepanelHostSelectionBridge {
  readonly #host: SidepanelHostSelectionBridgeHost
  readonly #suppressContentFocusOut: () => void
  readonly #resolveCurrentSceneBinding: (() => SidepanelSceneBinding) | undefined
  #latestMirrorRequestId = 0
  #pendingMirrorRequestId: number | null = null

  constructor(input: SidepanelHostSelectionBridgeInput) {
    this.#host = input.host
    this.#suppressContentFocusOut = input.suppressContentFocusOut
    this.#resolveCurrentSceneBinding = input.resolveCurrentSceneBinding
  }

  invalidatePendingSelectionMirror(): void {
    this.#latestMirrorRequestId += 1
    this.#pendingMirrorRequestId = null
  }

  hasPendingSelectionMirror(): boolean {
    return this.#pendingMirrorRequestId !== null
  }

  private resolveCurrentSceneBinding(): SidepanelSceneBinding {
    return this.#resolveCurrentSceneBinding?.() ?? resolveSceneBindingFromHost(this.#host)
  }

  private matchesExpectedSceneBinding(
    expectedSceneBinding: SidepanelSceneBinding | null | undefined,
  ): boolean {
    if (!expectedSceneBinding) {
      return true
    }

    const currentSceneBinding = this.resolveCurrentSceneBinding()
    return (
      haveSameSceneBindingRefreshKey(expectedSceneBinding, currentSceneBinding) &&
      canMirrorSelectionToSceneBinding(currentSceneBinding)
    )
  }

  private resolveFallbackApi(
    expectedSceneBinding: SidepanelSceneBinding | null | undefined,
  ): unknown | null {
    if (expectedSceneBinding && !this.matchesExpectedSceneBinding(expectedSceneBinding)) {
      return null
    }

    try {
      return this.#host.getExcalidrawAPI?.() ?? null
    } catch {
      return null
    }
  }

  mirrorSelectionToHost(
    elementIds: readonly string[],
    expectedSceneBinding?: SidepanelSceneBinding,
  ): void {
    if (expectedSceneBinding && !this.matchesExpectedSceneBinding(expectedSceneBinding)) {
      this.invalidatePendingSelectionMirror()
      return
    }

    if (!expectedSceneBinding && !ensureHostViewContextState(this.#host).ok) {
      this.invalidatePendingSelectionMirror()
      return
    }
    // Synthetic file/leaf keys can survive replacement. Bind each request to
    // the actual view, API and leaf owner before its first effect.
    const targetView = this.#host.targetView
    const view = targetView as { leaf?: { view?: unknown } } | null | undefined
    const leafView = view?.leaf?.view
    const api = this.resolveFallbackApi(expectedSceneBinding)
    const hasAuthority = (): boolean =>
      mirrorRequestId === this.#latestMirrorRequestId &&
      targetView === this.#host.targetView &&
      leafView === view?.leaf?.view &&
      api === this.resolveFallbackApi(expectedSceneBinding)

    const nextElementIds = [...elementIds]
    const mirrorRequestId = this.#latestMirrorRequestId + 1
    this.#latestMirrorRequestId = mirrorRequestId
    this.#pendingMirrorRequestId = mirrorRequestId

    const runSelectAttempt = (): SelectionMirrorAttemptResult => {
      if (expectedSceneBinding) {
        if (!this.matchesExpectedSceneBinding(expectedSceneBinding)) {
          return "hostUnavailable"
        }
      } else {
        const hostViewContext = ensureHostViewContextState(this.#host)
        if (!hostViewContext.ok) {
          return "hostUnavailable"
        }
      }

      if (!this.#host.selectElementsInView) {
        return "failed"
      }

      if (!hasAuthority()) return "hostUnavailable"
      this.#suppressContentFocusOut()
      if (!hasAuthority()) return "hostUnavailable"

      try {
        this.#host.selectElementsInView([...nextElementIds])
        return "applied"
      } catch {
        return "failed"
      }
    }

    const runAppStateFallback = (): boolean => {
      if (expectedSceneBinding) {
        if (!this.matchesExpectedSceneBinding(expectedSceneBinding)) {
          return false
        }
      } else {
        const hostViewContext = ensureHostViewContextState(this.#host)
        if (!hostViewContext.ok) {
          return false
        }
      }

      const apiCandidate = this.resolveFallbackApi(expectedSceneBinding)
      if (!apiCandidate || typeof apiCandidate !== "object") {
        return false
      }

      const updateScene = (apiCandidate as { updateScene?: (scene: unknown) => void }).updateScene
      if (!updateScene) {
        return false
      }

      const selectedElementIds = Object.fromEntries(nextElementIds.map((id) => [id, true]))
      if (!hasAuthority() || apiCandidate !== api) return false

      try {
        updateScene({
          appState: {
            selectedElementIds,
          },
        })
        return true
      } catch {
        return false
      }
    }

    const resolveVerificationState = (): SelectionMirrorVerificationResult => {
      try {
        if (expectedSceneBinding) {
          if (!this.matchesExpectedSceneBinding(expectedSceneBinding)) {
            return "hostUnavailable"
          }
        } else {
          const hostViewContext = ensureHostViewContextState(this.#host)
          if (!hostViewContext.ok) {
            return "hostUnavailable"
          }
        }

        if (!hasAuthority()) return "hostUnavailable"
        const liveSelectedIds = collectUniqueSelectionIds(
          this.#host.getViewSelectedElements?.() ?? [],
        )
        return haveSameIds(liveSelectedIds, nextElementIds) ? "match" : "mismatch"
      } catch {
        return "mismatch"
      }
    }

    const firstAttemptResult = runSelectAttempt()
    if (firstAttemptResult === "hostUnavailable") {
      if (this.#pendingMirrorRequestId === mirrorRequestId) {
        this.#pendingMirrorRequestId = null
      }
      return
    }

    if (firstAttemptResult === "failed") {
      runAppStateFallback()
    }

    if (!this.#host.getViewSelectedElements) {
      if (this.#pendingMirrorRequestId === mirrorRequestId) {
        this.#pendingMirrorRequestId = null
      }
      return
    }

    Promise.resolve().then(() => {
      if (!hasAuthority()) {
        if (this.#pendingMirrorRequestId === mirrorRequestId) this.#pendingMirrorRequestId = null
        return
      }

      const firstVerification = resolveVerificationState()
      if (firstVerification === "match") {
        if (this.#pendingMirrorRequestId === mirrorRequestId) {
          this.#pendingMirrorRequestId = null
        }
        return
      }

      if (firstVerification === "hostUnavailable") {
        if (this.#pendingMirrorRequestId === mirrorRequestId) {
          this.#pendingMirrorRequestId = null
        }
        return
      }

      if (mirrorRequestId !== this.#latestMirrorRequestId) {
        return
      }

      const retryResult = runSelectAttempt()
      if (retryResult === "hostUnavailable") {
        if (this.#pendingMirrorRequestId === mirrorRequestId) {
          this.#pendingMirrorRequestId = null
        }
        return
      }

      if (retryResult === "applied" && resolveVerificationState() === "match") {
        if (this.#pendingMirrorRequestId === mirrorRequestId) {
          this.#pendingMirrorRequestId = null
        }
        return
      }

      if (mirrorRequestId !== this.#latestMirrorRequestId) {
        return
      }

      const fallbackApplied = runAppStateFallback()
      if (!fallbackApplied) {
        if (this.#pendingMirrorRequestId === mirrorRequestId) {
          this.#pendingMirrorRequestId = null
        }
        return
      }

      const fallbackVerification = resolveVerificationState()
      if (
        (fallbackVerification === "match" || fallbackVerification === "hostUnavailable") &&
        this.#pendingMirrorRequestId === mirrorRequestId
      ) {
        this.#pendingMirrorRequestId = null
      }
    })
  }
}
