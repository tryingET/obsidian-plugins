import { type SidepanelHostViewContextHost, ensureHostViewContext } from "./hostViewContext.js"

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

  constructor(input: SidepanelHostSelectionBridgeInput) {
    this.#host = input.host
    this.#suppressContentFocusOut = input.suppressContentFocusOut
  }

  mirrorSelectionToHost(elementIds: readonly string[]): void {
    const nextElementIds = [...elementIds]

    const runSelectAttempt = (): boolean => {
      const selectElementsInView = this.#host.selectElementsInView
      if (!selectElementsInView) {
        return false
      }

      this.#suppressContentFocusOut()

      try {
        this.#host.setView?.("active", false)
      } catch {
        // no-op: force-rebind is best-effort only
      }

      ensureHostViewContext(this.#host)

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
    if (!getViewSelectedElements || nextElementIds.length === 0) {
      return
    }

    Promise.resolve().then(() => {
      const hasAllExpectedSelections = (): boolean => {
        try {
          ensureHostViewContext(this.#host)

          const liveSelectedIds = new Set(
            (getViewSelectedElements() ?? []).map((entry) => entry.id),
          )
          return nextElementIds.every((elementId) => liveSelectedIds.has(elementId))
        } catch {
          return false
        }
      }

      if (hasAllExpectedSelections()) {
        return
      }

      const retryApplied = runSelectAttempt()
      if (retryApplied && hasAllExpectedSelections()) {
        return
      }

      runAppStateFallback()
    })
  }
}
