import type { LayerNode } from "../../../model/tree.js"
import type { LayerManagerUiActions } from "../../renderer.js"
import { appendUniqueIds } from "../selection/selectionIds.js"

export interface ResolvedSelection {
  readonly elementIds: readonly string[]
  readonly nodes: readonly LayerNode[]
}

export interface KeyboardShortcutContext {
  readonly actions: LayerManagerUiActions
  readonly selection: ResolvedSelection
  readonly visibleNodes: readonly LayerNode[]
  readonly nodeById: ReadonlyMap<string, LayerNode>
  readonly parentById: ReadonlyMap<string, string | null>
}

interface KeyboardInteractionLogPayload {
  readonly [key: string]: unknown
}

interface SidepanelKeyboardShortcutControllerHost {
  getKeyboardContext: () => KeyboardShortcutContext | null
  resolveKeyboardContext: (context: KeyboardShortcutContext) => KeyboardShortcutContext

  getFocusedNodeId: () => string | null
  setFocusedNodeIdSilently: (nodeId: string | null) => void
  setFocusedNode: (nodeId: string | null) => void

  getInlineRenameNodeId: () => string | null
  beginInlineRename: (nodeId: string, initialValue: string) => void
  commitInlineRename: (actions: LayerManagerUiActions, nodeId: string) => Promise<void>

  setSelectionOverride: (elementIds: readonly string[] | null) => void
  ensureHostViewContext: () => boolean
  selectElementsInView?: (ids: string[]) => void

  moveSelectionToRoot: (
    actions: LayerManagerUiActions,
    selection: ResolvedSelection,
  ) => Promise<void>
  setLastQuickMoveDestinationToRoot: () => void

  isTextInputTarget: (target: EventTarget | null) => boolean
  isKeyboardSuppressed: () => boolean
  releaseKeyboardCapture: () => void
  suppressTransientFocusOut: () => void

  notify: (message: string) => void
  runUiAction: (action: () => Promise<unknown>, fallbackMessage: string) => void
  requestRenderFromLatestModel: () => void

  debugInteraction?: (message: string, payload?: KeyboardInteractionLogPayload) => void
}

export class SidepanelKeyboardShortcutController {
  readonly #host: SidepanelKeyboardShortcutControllerHost

  constructor(host: SidepanelKeyboardShortcutControllerHost) {
    this.#host = host
  }

  handleContentKeydown(event: KeyboardEvent): void {
    const targetTagName =
      event.target && typeof event.target === "object" && "tagName" in event.target
        ? `${(event.target as { readonly tagName?: unknown }).tagName ?? ""}`
        : null

    this.#host.debugInteraction?.("keydown received", {
      key: event.key,
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
      focusedNodeId: this.#host.getFocusedNodeId(),
      targetTagName,
    })

    const baseContext = this.#host.getKeyboardContext()
    if (!baseContext) {
      this.#host.debugInteraction?.("keydown ignored: keyboard context unavailable")
      return
    }

    if (this.#host.isTextInputTarget(event.target)) {
      return
    }

    if (this.#host.isKeyboardSuppressed()) {
      return
    }

    if (event.ctrlKey || event.metaKey || event.altKey) {
      return
    }

    const context = this.#host.resolveKeyboardContext(baseContext)

    if (event.key === "ArrowDown") {
      this.#host.suppressTransientFocusOut()
      event.preventDefault()
      if (event.shiftKey) {
        this.extendSelectionWithKeyboard(context, 1)
      } else {
        this.moveFocusedNode(context, 1)
      }
      return
    }

    if (event.key === "ArrowUp") {
      this.#host.suppressTransientFocusOut()
      event.preventDefault()
      if (event.shiftKey) {
        this.extendSelectionWithKeyboard(context, -1)
      } else {
        this.moveFocusedNode(context, -1)
      }
      return
    }

    if (event.key === "ArrowRight") {
      this.#host.suppressTransientFocusOut()
      event.preventDefault()
      this.handleArrowRight(context)
      return
    }

    if (event.key === "ArrowLeft") {
      this.#host.suppressTransientFocusOut()
      event.preventDefault()
      this.handleArrowLeft(context)
      return
    }

    if (event.key === "Enter") {
      this.#host.suppressTransientFocusOut()
      event.preventDefault()
      this.#host.runUiAction(() => this.runKeyboardRenameFocused(context), "Keyboard rename failed")
      return
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      this.#host.suppressTransientFocusOut()
      event.preventDefault()
      this.#host.runUiAction(
        () => this.runKeyboardDeleteSelectionOrFocused(context),
        "Keyboard delete failed",
      )
      return
    }

    const normalizedKey = event.key.length === 1 ? event.key.toLowerCase() : event.key

    if (normalizedKey === "f") {
      this.#host.suppressTransientFocusOut()
      event.preventDefault()
      this.#host.runUiAction(
        () => this.runKeyboardBringSelectionToFront(context),
        "Keyboard reorder failed",
      )
      return
    }

    if (normalizedKey === "g") {
      this.#host.suppressTransientFocusOut()
      event.preventDefault()
      this.#host.runUiAction(
        () => this.runKeyboardGroupSelection(context),
        "Keyboard grouping failed",
      )
      return
    }

    if (normalizedKey === "u") {
      this.#host.suppressTransientFocusOut()
      event.preventDefault()
      this.#host.runUiAction(
        () => this.runKeyboardUngroupLike(context),
        "Keyboard ungroup-like failed",
      )
    }
  }

  handleContentFocusOut(event: FocusEvent, contentRoot: HTMLElement | null): void {
    if (!contentRoot) {
      return
    }

    const nextTarget = event.relatedTarget as HTMLElement | null
    if (nextTarget && contentRoot.contains(nextTarget)) {
      return
    }

    this.#host.releaseKeyboardCapture()

    this.#host.debugInteraction?.("content focusout", {
      focusedNodeId: this.#host.getFocusedNodeId(),
      nextTargetTagName:
        nextTarget && typeof nextTarget === "object" && "tagName" in nextTarget
          ? `${(nextTarget as { readonly tagName?: unknown }).tagName ?? ""}`
          : null,
    })
  }

  private moveFocusedNode(context: KeyboardShortcutContext, delta: -1 | 1): void {
    if (context.visibleNodes.length === 0) {
      this.#host.setFocusedNodeIdSilently(null)
      return
    }

    const visibleNodeIds = context.visibleNodes.map((node) => node.id)
    const currentFocusedNodeId = this.#host.getFocusedNodeId()
    const currentIndex = currentFocusedNodeId ? visibleNodeIds.indexOf(currentFocusedNodeId) : -1

    const fallbackIndex = delta > 0 ? 0 : visibleNodeIds.length - 1
    const startIndex = currentIndex === -1 ? fallbackIndex : currentIndex
    const boundedNextIndex = Math.min(visibleNodeIds.length - 1, Math.max(0, startIndex + delta))

    const nextFocusedNodeId = visibleNodeIds[boundedNextIndex] ?? null
    this.#host.setFocusedNode(nextFocusedNodeId)
  }

  private extendSelectionWithKeyboard(context: KeyboardShortcutContext, delta: -1 | 1): void {
    if (context.visibleNodes.length === 0) {
      this.#host.setFocusedNodeIdSilently(null)
      return
    }

    const visibleNodeIds = context.visibleNodes.map((node) => node.id)
    const currentFocusedNodeId = this.#host.getFocusedNodeId()
    const currentIndex = currentFocusedNodeId ? visibleNodeIds.indexOf(currentFocusedNodeId) : -1

    const fallbackIndex = delta > 0 ? 0 : visibleNodeIds.length - 1
    const startIndex = currentIndex === -1 ? fallbackIndex : currentIndex
    const boundedNextIndex = Math.min(visibleNodeIds.length - 1, Math.max(0, startIndex + delta))

    const nextNode = context.visibleNodes[boundedNextIndex]
    if (!nextNode) {
      return
    }

    const nextSelectedElementIds: string[] = []
    const seenElementIds = new Set<string>()

    appendUniqueIds(nextSelectedElementIds, seenElementIds, context.selection.elementIds)

    if (currentIndex !== -1) {
      const currentNode = context.visibleNodes[currentIndex]
      if (currentNode) {
        appendUniqueIds(nextSelectedElementIds, seenElementIds, currentNode.elementIds)
      }
    }

    appendUniqueIds(nextSelectedElementIds, seenElementIds, nextNode.elementIds)
    this.#host.setSelectionOverride(nextSelectedElementIds)

    if (nextSelectedElementIds.length > 0 && this.#host.selectElementsInView) {
      this.#host.ensureHostViewContext()

      try {
        this.#host.selectElementsInView(nextSelectedElementIds)
      } catch {
        // no-op: keep keyboard selection extension fail-soft when host bridge throws
      }
    }

    this.#host.setFocusedNode(nextNode.id)
  }

  private handleArrowRight(context: KeyboardShortcutContext): void {
    const focusedNodeId = this.#host.getFocusedNodeId()
    if (!focusedNodeId) {
      return
    }

    const focusedNode = context.nodeById.get(focusedNodeId)
    if (!focusedNode) {
      this.#host.notify("Keyboard focus is stale. Refreshing row focus.")
      this.#host.setFocusedNode(context.visibleNodes[0]?.id ?? null)
      return
    }

    if (focusedNode.canExpand && !focusedNode.isExpanded) {
      context.actions.toggleExpanded(focusedNode.id)
      return
    }

    this.focusFirstVisibleChild(context, focusedNode.id)
  }

  private handleArrowLeft(context: KeyboardShortcutContext): void {
    const focusedNodeId = this.#host.getFocusedNodeId()
    if (!focusedNodeId) {
      return
    }

    const focusedNode = context.nodeById.get(focusedNodeId)
    if (!focusedNode) {
      this.#host.notify("Keyboard focus is stale. Refreshing row focus.")
      this.#host.setFocusedNode(context.visibleNodes[0]?.id ?? null)
      return
    }

    if (focusedNode.canExpand && focusedNode.isExpanded) {
      context.actions.toggleExpanded(focusedNode.id)
      return
    }

    this.focusParentNode(context, focusedNode.id)
  }

  private focusParentNode(context: KeyboardShortcutContext, nodeId: string): void {
    const parentNodeId = context.parentById.get(nodeId)
    if (!parentNodeId) {
      return
    }

    this.#host.setFocusedNode(parentNodeId)
  }

  private focusFirstVisibleChild(context: KeyboardShortcutContext, nodeId: string): void {
    const nodeIndex = context.visibleNodes.findIndex((node) => node.id === nodeId)
    if (nodeIndex === -1) {
      return
    }

    for (let index = nodeIndex + 1; index < context.visibleNodes.length; index += 1) {
      const candidate = context.visibleNodes[index]
      if (!candidate) {
        continue
      }

      if (context.parentById.get(candidate.id) === nodeId) {
        this.#host.setFocusedNode(candidate.id)
        return
      }
    }
  }

  private async runKeyboardRenameFocused(context: KeyboardShortcutContext): Promise<void> {
    let focusedNodeId = this.#host.getFocusedNodeId()

    if (!focusedNodeId) {
      focusedNodeId = context.visibleNodes[0]?.id ?? null
      if (!focusedNodeId) {
        this.#host.notify("Keyboard rename requires at least one visible row.")
        return
      }

      this.#host.setFocusedNodeIdSilently(focusedNodeId)
    }

    const focusedNode = context.nodeById.get(focusedNodeId)
    if (!focusedNode) {
      this.#host.notify("Keyboard rename failed: focused row is stale.")
      return
    }

    if (this.#host.getInlineRenameNodeId() === focusedNode.id) {
      await this.#host.commitInlineRename(context.actions, focusedNode.id)
      return
    }

    this.#host.beginInlineRename(focusedNode.id, focusedNode.label)
  }

  private async runKeyboardDeleteSelectionOrFocused(
    context: KeyboardShortcutContext,
  ): Promise<void> {
    if (context.selection.elementIds.length > 0) {
      await context.actions.commands.deleteNode({
        elementIds: context.selection.elementIds,
      })
      return
    }

    const focusedNodeId = this.#host.getFocusedNodeId()
    if (!focusedNodeId) {
      this.#host.notify("Keyboard delete requires selected elements or a focused row.")
      return
    }

    await context.actions.deleteNode(focusedNodeId)
  }

  private async runKeyboardGroupSelection(context: KeyboardShortcutContext): Promise<void> {
    if (context.selection.elementIds.length > 0) {
      await context.actions.commands.createGroup({
        elementIds: context.selection.elementIds,
      })
      return
    }

    let focusedNodeId = this.#host.getFocusedNodeId()
    if (!focusedNodeId) {
      focusedNodeId = context.visibleNodes[0]?.id ?? null
      this.#host.setFocusedNodeIdSilently(focusedNodeId)
    }

    if (!focusedNodeId) {
      this.#host.notify("Keyboard group requires selected elements or a focused row.")
      return
    }

    await context.actions.createGroupFromNodeIds({
      nodeIds: [focusedNodeId],
    })
  }

  private async runKeyboardBringSelectionToFront(context: KeyboardShortcutContext): Promise<void> {
    if (context.selection.elementIds.length > 0) {
      await context.actions.commands.reorder({
        orderedElementIds: context.selection.elementIds,
      })
      return
    }

    let focusedNodeId = this.#host.getFocusedNodeId()
    if (!focusedNodeId) {
      focusedNodeId = context.visibleNodes[0]?.id ?? null
      this.#host.setFocusedNodeIdSilently(focusedNodeId)
    }

    if (!focusedNodeId) {
      this.#host.notify("Keyboard reorder requires selected elements or a focused row.")
      return
    }

    await context.actions.reorderFromNodeIds([focusedNodeId])
  }

  private async runKeyboardUngroupLike(context: KeyboardShortcutContext): Promise<void> {
    if (context.selection.elementIds.length > 0) {
      await this.#host.moveSelectionToRoot(context.actions, context.selection)
      return
    }

    let focusedNodeId = this.#host.getFocusedNodeId()
    if (!focusedNodeId) {
      focusedNodeId = context.visibleNodes[0]?.id ?? null
      this.#host.setFocusedNodeIdSilently(focusedNodeId)
    }

    if (!focusedNodeId) {
      this.#host.notify("Keyboard ungroup-like requires selected elements or a focused row.")
      return
    }

    const focusedNode = context.nodeById.get(focusedNodeId)
    if (!focusedNode) {
      this.#host.notify("Keyboard ungroup-like failed: focused row is stale.")
      return
    }

    const outcome = await context.actions.reparentFromNodeIds({
      nodeIds: [focusedNode.id],
      sourceGroupId: null,
      targetParentPath: [],
      targetFrameId: focusedNode.frameId ?? null,
    })

    if (outcome.status === "applied") {
      this.#host.setLastQuickMoveDestinationToRoot()
    }
  }
}
