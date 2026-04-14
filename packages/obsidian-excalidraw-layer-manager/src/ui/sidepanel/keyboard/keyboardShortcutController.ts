import type { ReorderMode } from "../../../commands/reorderNode.js"
import type { LayerNode } from "../../../model/tree.js"
import { didInteractionApply } from "../../interactionOutcome.js"
import type { LayerManagerUiActions } from "../../renderer.js"
import { resolveRowClickSelection } from "../selection/rowClickSelection.js"
import { appendUniqueIds } from "../selection/selectionIds.js"
import type { ResolvedSelection } from "../selection/selectionResolution.js"
import { resolveFocusedNodeStructuralMove } from "../selection/structuralMoveSelection.js"

export interface KeyboardShortcutContext {
  readonly actions: LayerManagerUiActions
  readonly selection: ResolvedSelection
  readonly explicitSelectedNodes?: readonly LayerNode[] | null
  readonly anchorNodeId?: string | null
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
  setSelectionOverrideWithNodes?: (
    elementIds: readonly string[],
    nodes: readonly LayerNode[],
  ) => void
  setSelectionAnchorNodeId?: (nodeId: string | null) => void
  mirrorSelectionToHost?: (elementIds: readonly string[]) => void
  ensureHostViewContext: () => boolean
  selectElementsInView?: (ids: string[]) => void

  moveSelectionToRoot: (
    actions: LayerManagerUiActions,
    selection: ResolvedSelection,
    targetFrameId?: string | null,
  ) => Promise<void>
  setLastQuickMoveDestinationToRoot: (targetFrameId: string | null) => void

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

    if (event.key === " " || event.key === "Space" || event.key === "Spacebar") {
      this.#host.suppressTransientFocusOut()
      event.preventDefault()
      if (event.shiftKey) {
        this.selectVisibleRangeToFocusedNode(context)
      } else {
        this.toggleFocusedNodeSelection(context)
      }
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
        () => this.runKeyboardReorder(context, event.shiftKey ? "front" : "forward"),
        "Keyboard reorder failed",
      )
      return
    }

    if (normalizedKey === "b") {
      this.#host.suppressTransientFocusOut()
      event.preventDefault()
      this.#host.runUiAction(
        () => this.runKeyboardReorder(context, event.shiftKey ? "back" : "backward"),
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

    if (currentIndex === -1) {
      const fallbackIndex = delta > 0 ? 0 : visibleNodeIds.length - 1
      const fallbackNodeId = visibleNodeIds[fallbackIndex] ?? null
      this.#host.setFocusedNode(fallbackNodeId)
      return
    }

    const boundedNextIndex = Math.min(visibleNodeIds.length - 1, Math.max(0, currentIndex + delta))

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

    const currentNode = currentIndex !== -1 ? (context.visibleNodes[currentIndex] ?? null) : null
    if (currentNode) {
      appendUniqueIds(nextSelectedElementIds, seenElementIds, currentNode.elementIds)
    }

    appendUniqueIds(nextSelectedElementIds, seenElementIds, nextNode.elementIds)

    const explicitSelectionNodes = this.collectExplicitSelectionNodes(
      context,
      currentNode,
      nextNode,
    )

    this.applyResolvedRowSelection({
      selectedNodes: explicitSelectionNodes,
      selectedElementIds: nextSelectedElementIds,
      anchorNodeId: context.anchorNodeId ?? currentNode?.id ?? nextNode.id,
    })

    this.#host.setFocusedNode(nextNode.id)
  }

  private resolveFocusedNodeForSelectionGesture(
    context: KeyboardShortcutContext,
  ): LayerNode | null {
    if (context.visibleNodes.length === 0) {
      this.#host.setFocusedNodeIdSilently(null)
      this.#host.notify("Keyboard selection requires at least one visible row.")
      return null
    }

    return this.resolveFocusedNodeForHorizontalNavigation(context)
  }

  private resolveCurrentSelectionNodes(context: KeyboardShortcutContext): readonly LayerNode[] {
    return context.explicitSelectedNodes ?? context.selection.nodes
  }

  private applyResolvedRowSelection(input: {
    readonly selectedNodes: readonly LayerNode[]
    readonly selectedElementIds: readonly string[]
    readonly anchorNodeId: string | null
  }): void {
    this.#host.setSelectionAnchorNodeId?.(input.anchorNodeId)

    if (input.selectedNodes.length > 0 && this.#host.setSelectionOverrideWithNodes) {
      this.#host.setSelectionOverrideWithNodes(input.selectedElementIds, input.selectedNodes)
    } else if (input.selectedElementIds.length > 0) {
      this.#host.setSelectionOverride(input.selectedElementIds)
    } else {
      this.#host.setSelectionOverride(null)
    }

    if (this.#host.mirrorSelectionToHost) {
      this.#host.mirrorSelectionToHost(input.selectedElementIds)
    } else if (this.#host.selectElementsInView) {
      this.#host.ensureHostViewContext()

      try {
        this.#host.selectElementsInView([...input.selectedElementIds])
      } catch {
        // no-op: keep keyboard selection mutation fail-soft when host bridge throws
      }
    }

    this.#host.requestRenderFromLatestModel()
  }

  private toggleFocusedNodeSelection(context: KeyboardShortcutContext): void {
    const focusedNode = this.resolveFocusedNodeForSelectionGesture(context)
    if (!focusedNode) {
      return
    }

    this.applyResolvedRowSelection(
      resolveRowClickSelection({
        clickedNode: focusedNode,
        visibleNodes: context.visibleNodes,
        currentSelectedNodes: this.resolveCurrentSelectionNodes(context),
        currentAnchorNodeId: context.anchorNodeId ?? null,
        fallbackAnchorNodeId: focusedNode.id,
        modifiers: {
          shiftKey: false,
          toggleKey: true,
        },
      }),
    )
  }

  private selectVisibleRangeToFocusedNode(context: KeyboardShortcutContext): void {
    const focusedNode = this.resolveFocusedNodeForSelectionGesture(context)
    if (!focusedNode) {
      return
    }

    this.applyResolvedRowSelection(
      resolveRowClickSelection({
        clickedNode: focusedNode,
        visibleNodes: context.visibleNodes,
        currentSelectedNodes: this.resolveCurrentSelectionNodes(context),
        currentAnchorNodeId: context.anchorNodeId ?? null,
        fallbackAnchorNodeId: focusedNode.id,
        modifiers: {
          shiftKey: true,
          toggleKey: false,
        },
      }),
    )
  }

  private collectExplicitSelectionNodes(
    context: KeyboardShortcutContext,
    currentNode: LayerNode | null,
    nextNode: LayerNode,
  ): readonly LayerNode[] {
    const explicitNodes: LayerNode[] = []
    const seenNodeIds = new Set<string>()

    const appendNode = (node: LayerNode | null | undefined): void => {
      if (!node || seenNodeIds.has(node.id)) {
        return
      }

      seenNodeIds.add(node.id)
      explicitNodes.push(node)
    }

    for (const node of context.explicitSelectedNodes ?? []) {
      appendNode(node)
    }

    appendNode(currentNode)
    appendNode(nextNode)

    return explicitNodes
  }

  private resolveFocusedNodeForHorizontalNavigation(
    context: KeyboardShortcutContext,
  ): LayerNode | null {
    const focusedNodeId = this.#host.getFocusedNodeId()
    if (focusedNodeId) {
      const focusedNode = context.nodeById.get(focusedNodeId)
      if (focusedNode) {
        return focusedNode
      }

      this.#host.notify("Keyboard focus is stale. Refreshing row focus.")
    }

    const fallbackNode = context.visibleNodes[0] ?? null
    if (!fallbackNode) {
      this.#host.setFocusedNodeIdSilently(null)
      return null
    }

    this.#host.setFocusedNode(fallbackNode.id)
    return fallbackNode
  }

  private handleArrowRight(context: KeyboardShortcutContext): void {
    const focusedNode = this.resolveFocusedNodeForHorizontalNavigation(context)
    if (!focusedNode) {
      return
    }

    if (focusedNode.canExpand && !focusedNode.isExpanded) {
      context.actions.toggleExpanded(focusedNode.id)
      return
    }

    this.focusFirstVisibleChild(context, focusedNode.id)
  }

  private handleArrowLeft(context: KeyboardShortcutContext): void {
    const focusedNode = this.resolveFocusedNodeForHorizontalNavigation(context)
    if (!focusedNode) {
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

  /**
   * Keyboard commands act on canonical selection first and only fall back to focused-row
   * targeting when selection is empty.
   */
  private resolveFocusedNodeIdOrNotify(
    context: KeyboardShortcutContext,
    emptyMessage: string,
  ): string | null {
    let focusedNodeId = this.#host.getFocusedNodeId()

    if (!focusedNodeId) {
      focusedNodeId = context.visibleNodes[0]?.id ?? null
      this.#host.setFocusedNodeIdSilently(focusedNodeId)
    }

    if (!focusedNodeId) {
      this.#host.notify(emptyMessage)
      return null
    }

    return focusedNodeId
  }

  private async runKeyboardRenameFocused(context: KeyboardShortcutContext): Promise<void> {
    const focusedNodeId = this.resolveFocusedNodeIdOrNotify(
      context,
      "Keyboard rename requires at least one visible row.",
    )
    if (!focusedNodeId) {
      return
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

    const focusedNodeId = this.resolveFocusedNodeIdOrNotify(
      context,
      "Keyboard group requires selected elements or a focused row.",
    )
    if (!focusedNodeId) {
      return
    }

    await context.actions.createGroupFromNodeIds({
      nodeIds: [focusedNodeId],
    })
  }

  private async runKeyboardReorder(
    context: KeyboardShortcutContext,
    mode: ReorderMode,
  ): Promise<void> {
    const selectedNodeIds = context.selection.nodes.map((node) => node.id)
    if (selectedNodeIds.length > 0) {
      await context.actions.reorderFromNodeIds(selectedNodeIds, mode)
      return
    }

    if (context.selection.elementIds.length > 0) {
      await context.actions.commands.reorder({
        orderedElementIds: context.selection.elementIds,
        mode,
      })
      return
    }

    const focusedNodeId = this.resolveFocusedNodeIdOrNotify(
      context,
      "Keyboard reorder requires selected elements or a focused row.",
    )
    if (!focusedNodeId) {
      return
    }

    await context.actions.reorderFromNodeIds([focusedNodeId], mode)
  }

  private async runKeyboardUngroupLike(context: KeyboardShortcutContext): Promise<void> {
    if (context.selection.elementIds.length > 0) {
      await this.#host.moveSelectionToRoot(context.actions, context.selection)
      return
    }

    const focusedNodeId = this.resolveFocusedNodeIdOrNotify(
      context,
      "Keyboard ungroup-like requires selected elements or a focused row.",
    )
    if (!focusedNodeId) {
      return
    }

    const focusedNode = context.nodeById.get(focusedNodeId)
    if (!focusedNode) {
      this.#host.notify("Keyboard ungroup-like failed: focused row is stale.")
      return
    }

    const structuralMove = resolveFocusedNodeStructuralMove(focusedNode)
    if (!structuralMove) {
      this.#host.notify("Keyboard ungroup-like failed: frame rows cannot be structurally moved.")
      return
    }

    const targetFrameId = focusedNode.frameId ?? null

    const outcome = await context.actions.reparentFromNodeIds({
      nodeIds: structuralMove.nodeIds,
      sourceGroupId: structuralMove.sourceGroupId,
      targetParentPath: [],
      targetFrameId,
    })

    if (didInteractionApply(outcome)) {
      this.#host.setLastQuickMoveDestinationToRoot(targetFrameId)
    }
  }
}
