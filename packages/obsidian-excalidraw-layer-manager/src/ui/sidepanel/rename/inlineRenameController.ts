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

export class SidepanelInlineRenameController {
  readonly #host: SidepanelInlineRenameControllerHost
  #state: InlineRenameState | null = null

  constructor(host: SidepanelInlineRenameControllerHost) {
    this.#host = host
  }

  get state(): InlineRenameState | null {
    return this.#state
  }

  get nodeId(): string | null {
    return this.#state?.nodeId ?? null
  }

  clear(): void {
    this.#state = null
  }

  beginInlineRename(nodeId: string, initialValue: string): void {
    const previous = this.#state
    if (previous && previous.nodeId === nodeId && previous.draft === initialValue) {
      return
    }

    this.#state = {
      nodeId,
      draft: initialValue,
      shouldAutofocusInput: true,
    }

    this.#host.debugInteraction?.("inline rename begin", {
      nodeId,
      initialValue,
      focusedNodeId: this.#host.getFocusedNodeId(),
    })

    this.#host.requestRenderFromLatestModel()
  }

  updateInlineRenameDraft(nextDraft: string): void {
    const current = this.#state
    if (!current) {
      return
    }

    this.#state = {
      ...current,
      draft: nextDraft,
      shouldAutofocusInput: false,
    }
  }

  cancelInlineRename(): void {
    if (!this.#state) {
      return
    }

    this.#state = null
    this.#host.setShouldAutofocusContentRoot(true)
    this.#host.focusContentRoot()
    this.#host.requestRenderFromLatestModel()
  }

  async commitInlineRename(actions: LayerManagerUiActions, nodeId: string): Promise<void> {
    const current = this.#state
    if (!current || current.nodeId !== nodeId) {
      return
    }

    const nextName = current.draft.trim()
    if (nextName.length === 0) {
      this.#host.notify("Rename failed: name cannot be empty.")
      return
    }

    this.#host.suppressNextContentFocusOut()
    this.#host.setShouldAutofocusContentRoot(true)

    this.#host.debugInteraction?.("inline rename commit requested", {
      nodeId,
      nextName,
      focusedNodeId: this.#host.getFocusedNodeId(),
      keyboardCaptureActive: this.#host.getKeyboardCaptureActive(),
    })

    this.#state = null
    this.#host.requestRenderFromLatestModel()

    await actions.renameNode(nodeId, nextName)

    this.#host.suppressNextContentFocusOut()
    this.#host.setShouldAutofocusContentRoot(true)
    this.#host.focusContentRoot()
    this.#host.requestRenderFromLatestModel()

    this.#host.debugInteraction?.("inline rename commit finished", {
      nodeId,
      focusedNodeId: this.#host.getFocusedNodeId(),
      keyboardCaptureActive: this.#host.getKeyboardCaptureActive(),
    })
  }

  markAutofocusHandled(nodeId: string): void {
    const current = this.#state
    if (!current || current.nodeId !== nodeId || !current.shouldAutofocusInput) {
      return
    }

    this.#state = {
      ...current,
      shouldAutofocusInput: false,
    }
  }
}
