import { type SidepanelHostViewContextHost, ensureHostViewContextState } from "./hostViewContext.js"
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
}

type SelectionMirrorAttemptResult = "applied" | "failed" | "hostUnavailable"
type SelectionMirrorVerificationResult = "match" | "mismatch" | "hostUnavailable"

export class SidepanelHostSelectionBridge {
  readonly #host: SidepanelHostSelectionBridgeHost
  readonly #suppressContentFocusOut: () => void
  #latestMirrorRequestId = 0
  #pendingMirrorRequestId: number | null = null

  constructor(input: SidepanelHostSelectionBridgeInput) {
    this.#host = input.host
    this.#suppressContentFocusOut = input.suppressContentFocusOut
  }

  invalidatePendingSelectionMirror(): void {
    this.#latestMirrorRequestId += 1
    this.#pendingMirrorRequestId = null
  }

  hasPendingSelectionMirror(): boolean {
    return this.#pendingMirrorRequestId !== null
  }

  mirrorSelectionToHost(elementIds: readonly string[]): void {
    const nextElementIds = [...elementIds]
    const mirrorRequestId = this.#latestMirrorRequestId + 1
    this.#latestMirrorRequestId = mirrorRequestId
    this.#pendingMirrorRequestId = mirrorRequestId

    const runSelectAttempt = (): SelectionMirrorAttemptResult => {
      if (!this.#host.selectElementsInView) {
        return "failed"
      }

      this.#suppressContentFocusOut()
      const hostViewContext = ensureHostViewContextState(this.#host)
      if (!hostViewContext.ok) {
        return "hostUnavailable"
      }

      try {
        this.#host.selectElementsInView([...nextElementIds])
        return "applied"
      } catch {
        return "failed"
      }
    }

    const runAppStateFallback = (): boolean => {
      const hostViewContext = ensureHostViewContextState(this.#host)
      if (!hostViewContext.ok) {
        return false
      }

      const apiCandidate = this.#host.getExcalidrawAPI?.()
      if (!apiCandidate || typeof apiCandidate !== "object") {
        return false
      }

      const updateScene = (apiCandidate as { updateScene?: (scene: unknown) => void }).updateScene
      if (!updateScene) {
        return false
      }

      const selectedElementIds = Object.fromEntries(nextElementIds.map((id) => [id, true]))

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
        const hostViewContext = ensureHostViewContextState(this.#host)
        if (!hostViewContext.ok) {
          return "hostUnavailable"
        }

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
      if (mirrorRequestId !== this.#latestMirrorRequestId) {
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
        return
      }

      if (mirrorRequestId !== this.#latestMirrorRequestId) {
        return
      }

      const retryResult = runSelectAttempt()
      if (retryResult === "hostUnavailable") {
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

      runAppStateFallback()
      if (this.#pendingMirrorRequestId === mirrorRequestId) {
        this.#pendingMirrorRequestId = null
      }
    })
  }
}
