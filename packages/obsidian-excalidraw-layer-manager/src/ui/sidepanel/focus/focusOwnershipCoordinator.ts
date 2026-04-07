import { SidepanelFocusOutGuard } from "./focusOutGuard.js"

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

export class SidepanelFocusOwnershipCoordinator {
  readonly #nowMs: () => number
  readonly #focusOutSuppressionWindowMs: number
  readonly #keyboardStickyCaptureMs: number
  readonly #focusOutGuard: SidepanelFocusOutGuard

  #shouldAutofocusContentRoot = true
  #keyboardCaptureActive = false
  #keyboardCaptureStickyUntilMs = 0
  #deferredFocusEpoch = 0

  constructor(options: SidepanelFocusOwnershipCoordinatorOptions) {
    this.#nowMs = options.nowMs ?? Date.now
    this.#focusOutSuppressionWindowMs = options.focusOutSuppressionWindowMs
    this.#keyboardStickyCaptureMs = options.keyboardStickyCaptureMs
    this.#focusOutGuard = new SidepanelFocusOutGuard({
      nowMs: this.#nowMs,
    })
  }

  get shouldAutofocusContentRoot(): boolean {
    return this.#shouldAutofocusContentRoot
  }

  setShouldAutofocusContentRoot(value: boolean): void {
    this.#shouldAutofocusContentRoot = value
  }

  isKeyboardCaptureActive(): boolean {
    return this.#keyboardCaptureActive
  }

  activateKeyboardCapture(): void {
    this.#keyboardCaptureActive = true
    this.#keyboardCaptureStickyUntilMs = this.#nowMs() + this.#keyboardStickyCaptureMs
  }

  releaseKeyboardCapture(): void {
    this.#keyboardCaptureActive = false
  }

  isKeyboardRoutingActive(): boolean {
    return this.#keyboardCaptureActive || this.#nowMs() < this.#keyboardCaptureStickyUntilMs
  }

  suppressTransientFocusOut(): void {
    this.#focusOutGuard.suppressFor(this.#focusOutSuppressionWindowMs)
  }

  isFocusOutSuppressed(): boolean {
    return this.#focusOutGuard.isSuppressed()
  }

  cancelPendingFocusOut(): void {
    this.#focusOutGuard.cancelPending()
  }

  handleContentFocusOut(input: HandleContentFocusOutInput): void {
    if (this.isFocusOutSuppressed()) {
      return
    }

    this.#focusOutGuard.handleFocusOut(input)
  }

  focusContentRootImmediate(contentRoot: HTMLElement | null): void {
    if (!contentRoot) {
      return
    }

    try {
      contentRoot.focus()
    } catch {
      // no-op; best-effort focus restoration
    }
  }

  cancelDeferredFocusRestore(): void {
    this.#deferredFocusEpoch += 1
  }

  focusContentRootBestEffort(input: FocusContentRootBestEffortInput): void {
    const contentRoot = input.contentRoot
    if (!contentRoot) {
      return
    }

    this.focusContentRootImmediate(contentRoot)

    const focusEpoch = ++this.#deferredFocusEpoch

    Promise.resolve().then(() => {
      if (this.#deferredFocusEpoch !== focusEpoch) {
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
    if (!this.#shouldAutofocusContentRoot) {
      return
    }

    const ownerDocument = contentRoot.ownerDocument
    const activeElement = ownerDocument.activeElement

    if (activeElement && contentRoot.contains(activeElement)) {
      this.#shouldAutofocusContentRoot = false
      this.activateKeyboardCapture()
      return
    }

    if (isTextInputTarget(activeElement)) {
      return
    }

    this.focusContentRootImmediate(contentRoot)

    const focusedElement = ownerDocument.activeElement
    if (focusedElement && contentRoot.contains(focusedElement)) {
      this.#shouldAutofocusContentRoot = false
      this.activateKeyboardCapture()
    }
  }

  reset(): void {
    this.#shouldAutofocusContentRoot = true
    this.#keyboardCaptureActive = false
    this.#keyboardCaptureStickyUntilMs = 0
    this.#deferredFocusEpoch = 0
    this.#focusOutGuard.reset()
  }
}
