import type { LayerNode } from "../../../model/tree.js"

interface RenameHost {
  readonly targetView?: unknown
  readonly getExcalidrawAPI?: () => unknown
}

interface RenameAuthority {
  readonly view: unknown
  readonly api: unknown
}

interface RenameSelection {
  readonly start: number | null
  readonly end: number | null
  readonly direction: "forward" | "backward" | "none" | null
}

const containsNode = (nodes: readonly LayerNode[], nodeId: string): boolean =>
  nodes.some((node) => node.id === nodeId || containsNode(node.children, nodeId))

/** DOM generations are disposable; an editing session belongs to live host identity. */
export class InlineRenameDomSession {
  #generation = 0
  #authority: RenameAuthority | null = null
  #input: HTMLInputElement | null = null
  #selection: RenameSelection | null = null

  get generation(): number {
    return this.#generation
  }

  get restoringFocus(): boolean {
    return this.#selection !== null
  }

  begin(host: RenameHost): void {
    this.clear()
    this.#authority = { view: host.targetView, api: host.getExcalidrawAPI?.() }
  }

  clear(): void {
    this.#generation += 1
    this.#authority = null
    this.#input = null
    this.#selection = null
  }

  owns(generation: number, host: RenameHost): boolean {
    return generation === this.#generation && this.hasAuthority(host)
  }

  private hasAuthority(host: RenameHost): boolean {
    return (
      !!this.#authority &&
      this.#authority.view === host.targetView &&
      this.#authority.api === host.getExcalidrawAPI?.()
    )
  }

  beforeRender(
    host: RenameHost,
    nodeId: string | null,
    tree: readonly LayerNode[],
    contentRoot: HTMLElement | null,
  ): { readonly discard: boolean; readonly focusedDraft: string | null } {
    // Invalidate old callbacks BEFORE innerHTML can dispatch any teardown events.
    this.#generation += 1
    const input = this.#input
    this.#input = null
    this.#selection = null
    if (!nodeId || !this.hasAuthority(host) || !containsNode(tree, nodeId)) {
      this.clear()
      return { discard: true, focusedDraft: null }
    }
    if (input && contentRoot?.contains(input) && input.ownerDocument.activeElement === input) {
      this.#selection = {
        start: input.selectionStart,
        end: input.selectionEnd,
        direction: input.selectionDirection,
      }
      return { discard: false, focusedDraft: input.value }
    }
    return { discard: false, focusedDraft: null }
  }

  setInput(input: HTMLInputElement): void {
    this.#input = input
  }

  restoreFocus(): void {
    const selection = this.#selection
    this.#selection = null
    if (!selection || !this.#input) return
    try {
      this.#input.focus({ preventScroll: true })
      if (selection.start !== null && selection.end !== null) {
        this.#input.setSelectionRange(selection.start, selection.end, selection.direction ?? "none")
      }
    } catch {
      // Best effort for partial hosts without browser selection/focus support.
    }
  }
}
