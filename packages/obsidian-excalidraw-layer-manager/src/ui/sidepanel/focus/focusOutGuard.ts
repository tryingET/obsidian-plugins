interface SidepanelFocusOutGuardInput {
  readonly contentRoot: HTMLElement | null
  readonly relatedTarget: EventTarget | null
  readonly isContentRootCurrent?: (contentRoot: HTMLElement) => boolean
  readonly onConfirmedFocusOut: () => void
}

interface SidepanelFocusOutGuardOptions {
  readonly nowMs?: () => number
}

const isNodeTarget = (target: EventTarget | null): target is Node => {
  if (!target || typeof target !== "object") {
    return false
  }

  const nodeType = (target as { readonly nodeType?: unknown }).nodeType
  return typeof nodeType === "number"
}

const containsTarget = (contentRoot: HTMLElement, target: EventTarget | null): boolean => {
  if (!isNodeTarget(target)) {
    return false
  }

  try {
    return contentRoot.contains(target)
  } catch {
    return false
  }
}

export class SidepanelFocusOutGuard {
  readonly #nowMs: () => number

  #suppressUntilMs = 0
  #pendingResolutionToken = 0

  constructor(options: SidepanelFocusOutGuardOptions = {}) {
    this.#nowMs = options.nowMs ?? Date.now
  }

  reset(): void {
    this.#suppressUntilMs = 0
    this.cancelPending()
  }

  suppressFor(durationMs: number): void {
    if (durationMs <= 0) {
      return
    }

    this.#suppressUntilMs = this.#nowMs() + durationMs
  }

  isSuppressed(): boolean {
    return this.#nowMs() < this.#suppressUntilMs
  }

  cancelPending(): void {
    this.#pendingResolutionToken += 1
  }

  handleFocusOut(input: SidepanelFocusOutGuardInput): void {
    const contentRoot = input.contentRoot
    if (!contentRoot) {
      return
    }

    if (this.isSuppressed()) {
      return
    }

    if (containsTarget(contentRoot, input.relatedTarget)) {
      return
    }

    const resolutionToken = ++this.#pendingResolutionToken

    Promise.resolve().then(() => {
      if (this.#pendingResolutionToken !== resolutionToken) {
        return
      }

      if (this.isSuppressed()) {
        return
      }

      if (input.isContentRootCurrent && !input.isContentRootCurrent(contentRoot)) {
        return
      }

      const activeElement = contentRoot.ownerDocument.activeElement
      if (containsTarget(contentRoot, activeElement as EventTarget | null)) {
        return
      }

      input.onConfirmedFocusOut()
    })
  }
}
