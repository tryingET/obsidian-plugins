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

    const runSelectAttempt = (): boolean => {
      const selectElementsInView = this.#host.selectElementsInView
      if (!selectElementsInView) {
        return false
      }

      this.#suppressContentFocusOut()
      ensureHostViewContextState(this.#host)

      try {
        selectElementsInView([...nextElementIds])
        return true
      } catch {
        return false
      }
    }

    const runAppStateFallback = (): boolean => {
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

    const firstAttemptApplied = runSelectAttempt()
    if (!firstAttemptApplied) {
      runAppStateFallback()
    }

    const getViewSelectedElements = this.#host.getViewSelectedElements
    if (!getViewSelectedElements) {
      if (this.#pendingMirrorRequestId === mirrorRequestId) {
        this.#pendingMirrorRequestId = null
      }
      return
    }

    Promise.resolve().then(() => {
      if (mirrorRequestId !== this.#latestMirrorRequestId) {
        return
      }

      const hasAllExpectedSelections = (): boolean => {
        try {
          const hostViewContext = ensureHostViewContextState(this.#host)
          if (!hostViewContext.ok) {
            return false
          }

          const liveSelectedIds = collectUniqueSelectionIds(getViewSelectedElements() ?? [])
          return haveSameIds(liveSelectedIds, nextElementIds)
        } catch {
          return false
        }
      }

      if (hasAllExpectedSelections()) {
        if (this.#pendingMirrorRequestId === mirrorRequestId) {
          this.#pendingMirrorRequestId = null
        }
        return
      }

      if (mirrorRequestId !== this.#latestMirrorRequestId) {
        return
      }

      const retryApplied = runSelectAttempt()
      if (retryApplied && hasAllExpectedSelections()) {
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
