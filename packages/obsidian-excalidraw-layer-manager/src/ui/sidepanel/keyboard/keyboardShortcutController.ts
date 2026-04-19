import type { ReorderMode } from "../../../commands/reorderNode.js"
import type { LayerNode } from "../../../model/tree.js"
import { didInteractionApply } from "../../interactionOutcome.js"
import type { LayerManagerUiActions } from "../../renderer.js"
import { resolveRowClickSelection } from "../selection/rowClickSelection.js"
import type { ResolvedSelection } from "../selection/selectionResolution.js"
import {
  resolveExplicitSelectionNodeIds,
  resolveFocusedNodeStructuralMove,
} from "../selection/structuralMoveSelection.js"
import { traceKeyboardEventIfRelevant } from "./layerManagerKeyboardEventFlightRecorder.js"

export interface KeyboardShortcutContext {
  readonly actions: LayerManagerUiActions
  readonly selection: ResolvedSelection
  readonly explicitSelectedNodes?: readonly LayerNode[] | null
  readonly anchorNodeId?: string | null
  readonly visibleNodes: readonly LayerNode[]
  readonly nodeById: ReadonlyMap<string, LayerNode>
  readonly parentById: ReadonlyMap<string, string | null>
}

export type RowSelectionGestureSource =
  | "keyboardToggle"
  | "keyboardModifierToggle"
  | "keyboardRange"
  | "keyboardExtend"
  | "mouseClick"
  | "mouseToggle"
  | "mouseRange"

export interface RowSelectionGesture {
  readonly source: RowSelectionGestureSource
  readonly selectedNodes: readonly LayerNode[]
  readonly selectedElementIds: readonly string[]
  readonly anchorNodeId: string | null
}

interface KeyboardInteractionLogPayload {
  readonly [key: string]: unknown
}

const renderKeyboardSelectionRequirementMessage = (actionLabel: string): string => {
  return `Keyboard ${actionLabel} requires an active selection or a focused row.`
}

const claimHandledKeyboardEvent = (event: KeyboardEvent): void => {
  event.preventDefault()
  event.stopPropagation?.()
  ;(event as KeyboardEvent & { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.()
}

const normalizeKeyboardKey = (key: string): string => {
  return key.length === 1 ? key.toLowerCase() : key
}

const isSpaceShortcutEvent = (event: KeyboardEvent): boolean => {
  return (
    event.code === "Space" || event.key === " " || event.key === "Space" || event.key === "Spacebar"
  )
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
  applyResolvedRowSelection?: (input: RowSelectionGesture) => void
  mirrorSelectionToHost?: (elementIds: readonly string[]) => void
  getPageNavigationStep?: () => number
  ensureHostViewContext: () => boolean
  selectElementsInView?: (ids: string[]) => void

  moveSelectionToRoot: (
    actions: LayerManagerUiActions,
    selection: ResolvedSelection,
    targetFrameId?: string | null,
  ) => Promise<void>
  setLastQuickMoveDestinationToRoot: (targetFrameId: string | null) => void
  runNumberedQuickMoveDestination?: (
    index: number,
    context: KeyboardShortcutContext,
  ) => Promise<void>
  runAltStructuralMove?: (
    direction: "in" | "out",
    context: KeyboardShortcutContext,
  ) => Promise<void>

  isTextInputTarget: (target: EventTarget | null) => boolean
  isKeyboardSuppressed: () => boolean
  releaseKeyboardCapture: () => void
  confirmOutsideFocusOut?: () => void
  suppressTransientFocusOut: () => void

  notify: (message: string) => void
  runUiAction: (action: () => Promise<unknown>, fallbackMessage: string) => void
  requestRenderFromLatestModel: () => void
  requestRowTreeAutofocus?: () => void

  debugInteraction?: (message: string, payload?: KeyboardInteractionLogPayload) => void
}

export class SidepanelKeyboardShortcutController {
  readonly #host: SidepanelKeyboardShortcutControllerHost

  constructor(host: SidepanelKeyboardShortcutControllerHost) {
    this.#host = host
  }

  handleContentKeydown(event: KeyboardEvent): void {
    const targetTagName = this.resolveTargetTagName(event.target)

    this.#host.debugInteraction?.("keydown received", {
      key: event.key,
      code: event.code ?? "",
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
      focusedNodeId: this.#host.getFocusedNodeId(),
      targetTagName,
    })
    traceKeyboardEventIfRelevant("controller:keydown-received", event, {
      focusedNodeId: this.#host.getFocusedNodeId(),
      targetTagName,
    })

    if (this.isAltModifierStateKey(event)) {
      return
    }

    const baseContext = this.#host.getKeyboardContext()
    if (!baseContext) {
      this.traceIgnoredKeydown(
        event,
        "keyboardContextUnavailable",
        "keydown ignored: keyboard context unavailable",
      )
      return
    }

    const normalizedKey = normalizeKeyboardKey(event.key)
    const hasToggleModifier = event.ctrlKey || event.metaKey
    if (this.shouldIgnoreKeydown(event, normalizedKey, hasToggleModifier)) {
      return
    }

    const context = this.#host.resolveKeyboardContext(baseContext)
    if (this.handleAltQuickMoveShortcut(event, context)) {
      return
    }

    if (this.handleAltStructuralMoveShortcut(event, context)) {
      return
    }

    if (this.handleAltReorderShortcut(event, context)) {
      return
    }

    if (this.handleNavigationShortcut(event, context)) {
      return
    }

    if (this.handleSelectionAliasShortcut(event, context, normalizedKey, hasToggleModifier)) {
      return
    }

    this.handleMutationShortcut(event, context, normalizedKey)
  }

  private resolveTargetTagName(target: EventTarget | null): string | null {
    return target && typeof target === "object" && "tagName" in target
      ? `${(target as { readonly tagName?: unknown }).tagName ?? ""}`
      : null
  }

  private traceIgnoredKeydown(event: KeyboardEvent, reason: string, debugMessage?: string): void {
    if (debugMessage) {
      this.#host.debugInteraction?.(debugMessage)
    }

    traceKeyboardEventIfRelevant("controller:keydown-ignored", event, {
      reason,
    })
  }

  private shouldIgnoreKeydown(
    event: KeyboardEvent,
    normalizedKey: string,
    hasToggleModifier: boolean,
  ): boolean {
    if (this.#host.isTextInputTarget(event.target)) {
      this.traceIgnoredKeydown(event, "textInputTarget")
      return true
    }

    if (this.#host.isKeyboardSuppressed()) {
      this.traceIgnoredKeydown(event, "keyboardSuppressed")
      return true
    }

    if (
      event.altKey &&
      !this.isAltReorderShortcut(event) &&
      !this.isAltQuickMoveShortcut(event) &&
      !this.isAltStructuralMoveShortcut(event)
    ) {
      this.traceIgnoredKeydown(event, "altShortcutNotAuthorized")
      return true
    }

    if (hasToggleModifier && !this.isSelectionAliasShortcut(event, normalizedKey)) {
      this.traceIgnoredKeydown(event, "modifierShortcutNotAuthorized")
      return true
    }

    return false
  }

  private isSelectionAliasShortcut(event: KeyboardEvent, normalizedKey: string): boolean {
    return isSpaceShortcutEvent(event) || normalizedKey === "n" || normalizedKey === "m"
  }

  private isAltModifierStateKey(event: KeyboardEvent): boolean {
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      return false
    }

    return event.key === "Alt" || event.code === "AltLeft" || event.code === "AltRight"
  }

  private resolveAltQuickMoveDigit(event: KeyboardEvent): number | null {
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return null
    }

    if (typeof event.code === "string") {
      const match = /^Digit([0-9])$/.exec(event.code)
      if (match) {
        return Number(match[1])
      }
    }

    return /^[0-9]$/.test(event.key) ? Number(event.key) : null
  }

  private isAltQuickMoveShortcut(event: KeyboardEvent): boolean {
    return this.resolveAltQuickMoveDigit(event) !== null
  }

  private resolveAltStructuralMoveDirection(event: KeyboardEvent): "in" | "out" | null {
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return null
    }

    if (event.code === "BracketLeft" || event.key === "[") {
      return "out"
    }

    if (event.code === "BracketRight" || event.key === "]") {
      return "in"
    }

    return null
  }

  private isAltStructuralMoveShortcut(event: KeyboardEvent): boolean {
    return this.resolveAltStructuralMoveDirection(event) !== null
  }

  private isAltReorderShortcut(event: KeyboardEvent): boolean {
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return false
    }

    return event.key === "ArrowUp" || event.key === "ArrowDown"
  }

  private claimKeyboardShortcut(event: KeyboardEvent): void {
    this.#host.suppressTransientFocusOut()
    claimHandledKeyboardEvent(event)
  }

  private handleAltQuickMoveShortcut(
    event: KeyboardEvent,
    context: KeyboardShortcutContext,
  ): boolean {
    const digit = this.resolveAltQuickMoveDigit(event)
    if (digit === null || !this.#host.runNumberedQuickMoveDestination) {
      return false
    }

    return this.runClaimedKeyboardUiAction(
      event,
      "Keyboard move failed",
      () => this.#host.runNumberedQuickMoveDestination?.(digit, context) ?? Promise.resolve(),
    )
  }

  private handleAltStructuralMoveShortcut(
    event: KeyboardEvent,
    context: KeyboardShortcutContext,
  ): boolean {
    const direction = this.resolveAltStructuralMoveDirection(event)
    if (!direction || !this.#host.runAltStructuralMove) {
      return false
    }

    traceKeyboardEventIfRelevant("controller:alt-structural-move", event, {
      direction,
      focusedNodeId: this.#host.getFocusedNodeId(),
    })
    return this.runClaimedKeyboardUiAction(
      event,
      direction === "in" ? "Keyboard move into group failed" : "Keyboard move out of group failed",
      () => this.#host.runAltStructuralMove?.(direction, context) ?? Promise.resolve(),
    )
  }

  private handleAltReorderShortcut(
    event: KeyboardEvent,
    context: KeyboardShortcutContext,
  ): boolean {
    if (!this.isAltReorderShortcut(event)) {
      return false
    }

    const mode: ReorderMode = event.key === "ArrowUp" ? "forward" : "backward"
    return this.runClaimedKeyboardUiAction(event, "Keyboard reorder failed", () =>
      this.runKeyboardReorder(context, mode),
    )
  }

  private handleNavigationShortcut(
    event: KeyboardEvent,
    context: KeyboardShortcutContext,
  ): boolean {
    switch (event.key) {
      case "ArrowDown":
        this.claimKeyboardShortcut(event)
        if (event.shiftKey) {
          this.extendSelectionWithKeyboard(context, 1)
        } else {
          this.moveFocusedNode(context, 1)
        }
        return true
      case "ArrowUp":
        this.claimKeyboardShortcut(event)
        if (event.shiftKey) {
          this.extendSelectionWithKeyboard(context, -1)
        } else {
          this.moveFocusedNode(context, -1)
        }
        return true
      case "Home":
        this.claimKeyboardShortcut(event)
        this.moveFocusedNodeToBoundary(context, "start")
        return true
      case "End":
        this.claimKeyboardShortcut(event)
        this.moveFocusedNodeToBoundary(context, "end")
        return true
      case "PageDown":
        this.claimKeyboardShortcut(event)
        if (event.shiftKey) {
          this.extendSelectionByPage(context, 1)
        } else {
          this.moveFocusedNodeByPage(context, 1)
        }
        return true
      case "PageUp":
        this.claimKeyboardShortcut(event)
        if (event.shiftKey) {
          this.extendSelectionByPage(context, -1)
        } else {
          this.moveFocusedNodeByPage(context, -1)
        }
        return true
      case "ArrowRight":
        this.claimKeyboardShortcut(event)
        this.handleArrowRight(context)
        return true
      case "ArrowLeft":
        this.claimKeyboardShortcut(event)
        this.handleArrowLeft(context)
        return true
      default:
        return false
    }
  }

  private handleSelectionAliasShortcut(
    event: KeyboardEvent,
    context: KeyboardShortcutContext,
    normalizedKey: string,
    hasToggleModifier: boolean,
  ): boolean {
    if (!this.isSelectionAliasShortcut(event, normalizedKey)) {
      return false
    }

    this.claimKeyboardShortcut(event)
    if (event.shiftKey) {
      traceKeyboardEventIfRelevant("controller:selection-alias", event, {
        action: "rangeAdd",
      })
      this.selectVisibleRangeToFocusedNode(context, hasToggleModifier)
      return true
    }

    if (hasToggleModifier) {
      traceKeyboardEventIfRelevant("controller:selection-alias", event, {
        action: "toggleFocusedNodeSelection",
      })
      this.toggleFocusedNodeSelection(context)
      return true
    }

    this.selectFocusedNodeLikePlainClick(context)
    return true
  }

  private runClaimedKeyboardUiAction(
    event: KeyboardEvent,
    fallbackMessage: string,
    action: () => Promise<void>,
  ): boolean {
    this.claimKeyboardShortcut(event)
    this.#host.runUiAction(action, fallbackMessage)
    return true
  }

  private handleMutationShortcut(
    event: KeyboardEvent,
    context: KeyboardShortcutContext,
    normalizedKey: string,
  ): boolean {
    if (event.key === "Enter") {
      return this.runClaimedKeyboardUiAction(event, "Keyboard rename failed", () =>
        this.runKeyboardRenameFocused(context),
      )
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      return this.runClaimedKeyboardUiAction(event, "Keyboard delete failed", () =>
        this.runKeyboardDeleteSelectionOrFocused(context),
      )
    }

    switch (normalizedKey) {
      case "f":
        return this.runClaimedKeyboardUiAction(event, "Keyboard reorder failed", () =>
          this.runKeyboardReorder(context, event.shiftKey ? "front" : "forward"),
        )
      case "b":
        return this.runClaimedKeyboardUiAction(event, "Keyboard reorder failed", () =>
          this.runKeyboardReorder(context, event.shiftKey ? "back" : "backward"),
        )
      case "g":
        return this.runClaimedKeyboardUiAction(event, "Keyboard grouping failed", () =>
          this.runKeyboardGroupSelection(context),
        )
      case "u":
        return this.runClaimedKeyboardUiAction(event, "Keyboard move out of group failed", () =>
          this.runKeyboardUngroupLike(context),
        )
      default:
        return false
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
    this.#host.confirmOutsideFocusOut?.()

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

  private moveFocusedNodeToBoundary(
    context: KeyboardShortcutContext,
    boundary: "start" | "end",
  ): void {
    if (context.visibleNodes.length === 0) {
      this.#host.setFocusedNodeIdSilently(null)
      return
    }

    const targetIndex = boundary === "start" ? 0 : context.visibleNodes.length - 1
    const targetNodeId = context.visibleNodes[targetIndex]?.id ?? null
    this.#host.setFocusedNode(targetNodeId)
  }

  private moveFocusedNodeByPage(context: KeyboardShortcutContext, direction: -1 | 1): void {
    if (context.visibleNodes.length === 0) {
      this.#host.setFocusedNodeIdSilently(null)
      return
    }

    const visibleNodeIds = context.visibleNodes.map((node) => node.id)
    const currentFocusedNodeId = this.#host.getFocusedNodeId()
    const currentIndex = currentFocusedNodeId ? visibleNodeIds.indexOf(currentFocusedNodeId) : -1

    if (currentIndex === -1) {
      const fallbackIndex = direction > 0 ? 0 : visibleNodeIds.length - 1
      const fallbackNodeId = visibleNodeIds[fallbackIndex] ?? null
      this.#host.setFocusedNode(fallbackNodeId)
      return
    }

    const step = this.resolvePageNavigationStep(context)
    const boundedNextIndex = Math.min(
      visibleNodeIds.length - 1,
      Math.max(0, currentIndex + step * direction),
    )

    const nextFocusedNodeId = visibleNodeIds[boundedNextIndex] ?? null
    this.#host.setFocusedNode(nextFocusedNodeId)
  }

  private extendSelectionWithKeyboard(context: KeyboardShortcutContext, delta: -1 | 1): void {
    this.extendSelectionToRelativeTarget(context, delta)
  }

  private extendSelectionByPage(context: KeyboardShortcutContext, direction: -1 | 1): void {
    this.extendSelectionToRelativeTarget(
      context,
      this.resolvePageNavigationStep(context) * direction,
    )
  }

  private extendSelectionToRelativeTarget(context: KeyboardShortcutContext, delta: number): void {
    const navigationTarget = this.resolveRelativeSelectionTarget(context, delta)
    if (!navigationTarget) {
      return
    }

    const nextSelection = resolveRowClickSelection({
      clickedNode: navigationTarget.nextNode,
      visibleNodes: context.visibleNodes,
      currentSelectedNodes: this.resolveCurrentSelectionNodes(context),
      currentAnchorNodeId: context.anchorNodeId ?? null,
      fallbackAnchorNodeId: navigationTarget.currentNode.id,
      modifiers: {
        shiftKey: true,
        toggleKey: false,
      },
    })

    this.applyResolvedRowSelection("keyboardExtend", nextSelection)
    this.#host.setFocusedNode(navigationTarget.nextNode.id)
  }

  private resolveRelativeSelectionTarget(
    context: KeyboardShortcutContext,
    delta: number,
  ): {
    readonly currentNode: LayerNode
    readonly nextNode: LayerNode
  } | null {
    if (context.visibleNodes.length === 0) {
      this.#host.setFocusedNodeIdSilently(null)
      return null
    }

    const visibleNodeIds = context.visibleNodes.map((node) => node.id)
    const currentFocusedNodeId = this.#host.getFocusedNodeId()
    const currentIndex = currentFocusedNodeId ? visibleNodeIds.indexOf(currentFocusedNodeId) : -1
    const fallbackIndex = delta >= 0 ? 0 : visibleNodeIds.length - 1
    const resolvedCurrentIndex = currentIndex === -1 ? fallbackIndex : currentIndex
    const boundedNextIndex = Math.min(
      visibleNodeIds.length - 1,
      Math.max(0, resolvedCurrentIndex + delta),
    )

    const currentNode = context.visibleNodes[resolvedCurrentIndex]
    const nextNode = context.visibleNodes[boundedNextIndex]
    if (!currentNode || !nextNode) {
      return null
    }

    return {
      currentNode,
      nextNode,
    }
  }

  private resolvePageNavigationStep(context: KeyboardShortcutContext): number {
    const hostStep = this.#host.getPageNavigationStep?.() ?? 0
    if (hostStep > 0) {
      return Math.max(1, Math.min(context.visibleNodes.length, Math.floor(hostStep)))
    }

    return Math.max(1, Math.floor(Math.max(1, context.visibleNodes.length) / 2))
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
    const currentSelectionNodes = context.explicitSelectedNodes ?? context.selection.nodes
    if (currentSelectionNodes.length > 0) {
      return currentSelectionNodes
    }

    if (!context.anchorNodeId) {
      return currentSelectionNodes
    }

    const anchorNode = context.nodeById.get(context.anchorNodeId)
    return anchorNode ? [anchorNode] : currentSelectionNodes
  }

  private applyResolvedRowSelection(
    source: RowSelectionGestureSource,
    input: {
      readonly selectedNodes: readonly LayerNode[]
      readonly selectedElementIds: readonly string[]
      readonly anchorNodeId: string | null
    },
  ): void {
    if (this.#host.applyResolvedRowSelection) {
      this.#host.applyResolvedRowSelection({
        source,
        ...input,
      })
    } else {
      this.#host.setSelectionAnchorNodeId?.(input.anchorNodeId)

      if (input.selectedNodes.length > 0 && this.#host.setSelectionOverrideWithNodes) {
        this.#host.setSelectionOverrideWithNodes(input.selectedElementIds, input.selectedNodes)
      } else if (input.selectedElementIds.length > 0) {
        this.#host.setSelectionOverride(input.selectedElementIds)
      } else {
        this.#host.setSelectionOverride([])
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
    }

    this.#host.requestRowTreeAutofocus?.()
    this.#host.requestRenderFromLatestModel()
  }

  private selectFocusedNodeLikePlainClick(context: KeyboardShortcutContext): void {
    const focusedNode = this.resolveFocusedNodeForSelectionGesture(context)
    if (!focusedNode) {
      return
    }

    const currentSelectedNodes = this.resolveCurrentSelectionNodes(context)
    const focusedNodeIsSelected = currentSelectedNodes.some((node) => node.id === focusedNode.id)

    this.applyResolvedRowSelection(
      focusedNodeIsSelected ? "keyboardModifierToggle" : "keyboardToggle",
      resolveRowClickSelection({
        clickedNode: focusedNode,
        visibleNodes: context.visibleNodes,
        currentSelectedNodes,
        currentAnchorNodeId: context.anchorNodeId ?? null,
        fallbackAnchorNodeId: focusedNode.id,
        modifiers: {
          shiftKey: false,
          toggleKey: focusedNodeIsSelected,
        },
      }),
    )
  }

  private toggleFocusedNodeSelection(context: KeyboardShortcutContext): void {
    const focusedNode = this.resolveFocusedNodeForSelectionGesture(context)
    if (!focusedNode) {
      return
    }

    this.applyResolvedRowSelection(
      "keyboardModifierToggle",
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

  private selectVisibleRangeToFocusedNode(
    context: KeyboardShortcutContext,
    toggleKey = false,
  ): void {
    const focusedNode = this.resolveFocusedNodeForSelectionGesture(context)
    if (!focusedNode) {
      return
    }

    this.applyResolvedRowSelection(
      "keyboardRange",
      resolveRowClickSelection({
        clickedNode: focusedNode,
        visibleNodes: context.visibleNodes,
        currentSelectedNodes: this.resolveCurrentSelectionNodes(context),
        currentAnchorNodeId: context.anchorNodeId ?? null,
        fallbackAnchorNodeId: focusedNode.id,
        modifiers: {
          shiftKey: true,
          toggleKey,
        },
      }),
    )
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
   * Keyboard-first tree selection command precedence:
   * explicit row selection -> canonical element selection -> focused-row fallback.
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
    const explicitSelectedNodeIds = resolveExplicitSelectionNodeIds({
      explicitSelectedNodes: context.explicitSelectedNodes,
    })
    const explicitSelectedNodeId =
      explicitSelectedNodeIds.length === 1 ? (explicitSelectedNodeIds[0] ?? null) : null
    if (explicitSelectedNodeId) {
      await context.actions.deleteNode(explicitSelectedNodeId)
      return
    }

    if (context.selection.elementIds.length > 0) {
      await context.actions.commands.deleteNode({
        elementIds: context.selection.elementIds,
      })
      return
    }

    const focusedNodeId = this.#host.getFocusedNodeId()
    if (!focusedNodeId) {
      this.#host.notify(renderKeyboardSelectionRequirementMessage("delete"))
      return
    }

    await context.actions.deleteNode(focusedNodeId)
  }

  private async runKeyboardGroupSelection(context: KeyboardShortcutContext): Promise<void> {
    const explicitSelectedNodeIds = resolveExplicitSelectionNodeIds({
      explicitSelectedNodes: context.explicitSelectedNodes,
    })
    if (explicitSelectedNodeIds.length > 0) {
      await context.actions.createGroupFromNodeIds({
        nodeIds: explicitSelectedNodeIds,
      })
      return
    }

    if (context.selection.elementIds.length > 0) {
      await context.actions.commands.createGroup({
        elementIds: context.selection.elementIds,
      })
      return
    }

    const focusedNodeId = this.resolveFocusedNodeIdOrNotify(
      context,
      renderKeyboardSelectionRequirementMessage("group"),
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
    const explicitSelectedNodeIds = resolveExplicitSelectionNodeIds({
      explicitSelectedNodes: context.explicitSelectedNodes,
    })
    if (explicitSelectedNodeIds.length > 0) {
      await context.actions.reorderFromNodeIds(explicitSelectedNodeIds, mode)
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
      renderKeyboardSelectionRequirementMessage("reorder"),
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
      renderKeyboardSelectionRequirementMessage("move out of group"),
    )
    if (!focusedNodeId) {
      return
    }

    const focusedNode = context.nodeById.get(focusedNodeId)
    if (!focusedNode) {
      this.#host.notify("Keyboard move out of group failed: focused row is stale.")
      return
    }

    const structuralMove = resolveFocusedNodeStructuralMove(focusedNode)
    if (!structuralMove) {
      this.#host.notify(
        "Keyboard move out of group failed: frame rows cannot be structurally moved.",
      )
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
