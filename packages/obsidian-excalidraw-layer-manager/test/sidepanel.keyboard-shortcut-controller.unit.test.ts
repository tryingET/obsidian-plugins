import { describe, expect, it, vi } from "vitest"

import type { LayerNode } from "../src/model/tree.js"
import type { LayerManagerUiActions } from "../src/ui/renderer.js"
import {
  type KeyboardShortcutContext,
  SidepanelKeyboardShortcutController,
} from "../src/ui/sidepanel/keyboard/keyboardShortcutController.js"

const makeFrameResolution = (frameId: string | null) => ({
  ok: true as const,
  frameId,
})

const makeNode = (id: string, label = id): LayerNode => ({
  id,
  type: "element",
  elementIds: [id],
  primaryElementId: id,
  children: [],
  canExpand: false,
  isExpanded: false,
  groupId: null,
  frameId: null,
  label,
})

const makeGroupNode = (groupId: string, frameId: string | null = null): LayerNode => ({
  id: `group:${groupId}`,
  type: "group",
  elementIds: ["A", "B"],
  primaryElementId: "A",
  children: [],
  canExpand: true,
  isExpanded: true,
  groupId,
  frameId,
  label: groupId,
})

const makeKeyboardEvent = (
  key: string,
  options?: {
    readonly shiftKey?: boolean
  },
): KeyboardEvent => {
  return {
    key,
    shiftKey: options?.shiftKey ?? false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    target: null,
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent
}

describe("sidepanel keyboard shortcut controller", () => {
  it("releases keyboard capture when confirmed focusout leaves content root", () => {
    const releaseKeyboardCapture = vi.fn<() => void>()

    const controller = new SidepanelKeyboardShortcutController({
      getKeyboardContext: () => null,
      resolveKeyboardContext: (context) => context,
      getFocusedNodeId: () => null,
      setFocusedNodeIdSilently: () => {},
      setFocusedNode: () => {},
      getInlineRenameNodeId: () => null,
      beginInlineRename: () => {},
      commitInlineRename: vi.fn(async () => {}),
      setSelectionOverride: () => {},
      ensureHostViewContext: () => true,
      moveSelectionToRoot: vi.fn(async () => {}),
      setLastQuickMoveDestinationToRoot: () => {},
      isTextInputTarget: () => false,
      isKeyboardSuppressed: () => false,
      releaseKeyboardCapture,
      suppressTransientFocusOut: () => {},
      notify: () => {},
      runUiAction: () => {},
      requestRenderFromLatestModel: () => {},
    })

    const outsideTarget = { nodeType: 1 } as unknown as EventTarget
    const contentRoot = {
      contains: () => false,
    } as unknown as HTMLElement

    controller.handleContentFocusOut(
      {
        relatedTarget: outsideTarget,
      } as FocusEvent,
      contentRoot,
    )

    expect(releaseKeyboardCapture).toHaveBeenCalledTimes(1)
  })

  it("keeps keyboard capture when focusout stays within content root", () => {
    const releaseKeyboardCapture = vi.fn<() => void>()
    const insideTarget = { nodeType: 1 } as unknown as EventTarget

    const controller = new SidepanelKeyboardShortcutController({
      getKeyboardContext: () => null,
      resolveKeyboardContext: (context) => context,
      getFocusedNodeId: () => null,
      setFocusedNodeIdSilently: () => {},
      setFocusedNode: () => {},
      getInlineRenameNodeId: () => null,
      beginInlineRename: () => {},
      commitInlineRename: vi.fn(async () => {}),
      setSelectionOverride: () => {},
      ensureHostViewContext: () => true,
      moveSelectionToRoot: vi.fn(async () => {}),
      setLastQuickMoveDestinationToRoot: () => {},
      isTextInputTarget: () => false,
      isKeyboardSuppressed: () => false,
      releaseKeyboardCapture,
      suppressTransientFocusOut: () => {},
      notify: () => {},
      runUiAction: () => {},
      requestRenderFromLatestModel: () => {},
    })

    const contentRoot = {
      contains: (target: EventTarget | null) => target === insideTarget,
    } as unknown as HTMLElement

    controller.handleContentFocusOut(
      {
        relatedTarget: insideTarget,
      } as FocusEvent,
      contentRoot,
    )

    expect(releaseKeyboardCapture).not.toHaveBeenCalled()
  })

  it("fails closed for keyboard ungroup-like on focused frame rows", async () => {
    const reparentFromNodeIds = vi.fn(async () => ({ status: "applied", attempts: 1 as const }))
    const setLastQuickMoveDestinationToRoot = vi.fn<(targetFrameId: string | null) => void>()
    const notify = vi.fn<(message: string) => void>()
    const runUiAction = vi.fn<(action: () => Promise<unknown>, fallbackMessage: string) => void>(
      (action) => {
        void action()
      },
    )

    const frameNode: LayerNode = {
      id: "frame:F1",
      type: "frame",
      elementIds: ["F1", "A"],
      primaryElementId: "F1",
      children: [],
      canExpand: false,
      isExpanded: false,
      groupId: null,
      frameId: null,
      label: "Frame 1",
    }

    const context: KeyboardShortcutContext = {
      actions: {
        reparentFromNodeIds,
      } as unknown as LayerManagerUiActions,
      selection: {
        elementIds: [],
        nodes: [],
        frameResolution: makeFrameResolution(null),
      },
      visibleNodes: [frameNode],
      nodeById: new Map([[frameNode.id, frameNode]]),
      parentById: new Map([[frameNode.id, null]]),
    }

    const controller = new SidepanelKeyboardShortcutController({
      getKeyboardContext: () => context,
      resolveKeyboardContext: (resolvedContext) => resolvedContext,
      getFocusedNodeId: () => frameNode.id,
      setFocusedNodeIdSilently: () => {},
      setFocusedNode: () => {},
      getInlineRenameNodeId: () => null,
      beginInlineRename: () => {},
      commitInlineRename: vi.fn(async () => {}),
      setSelectionOverride: () => {},
      ensureHostViewContext: () => true,
      moveSelectionToRoot: vi.fn(async () => {}),
      setLastQuickMoveDestinationToRoot,
      isTextInputTarget: () => false,
      isKeyboardSuppressed: () => false,
      releaseKeyboardCapture: () => {},
      suppressTransientFocusOut: () => {},
      notify,
      runUiAction,
      requestRenderFromLatestModel: () => {},
    })

    const event = makeKeyboardEvent("u")
    controller.handleContentKeydown(event)
    await Promise.resolve()
    await Promise.resolve()

    expect(reparentFromNodeIds).not.toHaveBeenCalled()
    expect(setLastQuickMoveDestinationToRoot).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith(
      "Keyboard ungroup-like failed: frame rows cannot be structurally moved.",
    )
  })

  it("preserves group structural intent for keyboard ungroup-like on focused group rows", async () => {
    const reparentFromNodeIds = vi.fn(async () => ({ status: "applied", attempts: 1 as const }))
    const setLastQuickMoveDestinationToRoot = vi.fn<(targetFrameId: string | null) => void>()
    const runUiAction = vi.fn<(action: () => Promise<unknown>, fallbackMessage: string) => void>(
      (action) => {
        void action()
      },
    )

    const groupNode = makeGroupNode("G", "Frame-A")
    const context: KeyboardShortcutContext = {
      actions: {
        reparentFromNodeIds,
      } as unknown as LayerManagerUiActions,
      selection: {
        elementIds: [],
        nodes: [],
        frameResolution: makeFrameResolution("Frame-A"),
      },
      visibleNodes: [groupNode],
      nodeById: new Map([[groupNode.id, groupNode]]),
      parentById: new Map([[groupNode.id, null]]),
    }

    const controller = new SidepanelKeyboardShortcutController({
      getKeyboardContext: () => context,
      resolveKeyboardContext: (resolvedContext) => resolvedContext,
      getFocusedNodeId: () => groupNode.id,
      setFocusedNodeIdSilently: () => {},
      setFocusedNode: () => {},
      getInlineRenameNodeId: () => null,
      beginInlineRename: () => {},
      commitInlineRename: vi.fn(async () => {}),
      setSelectionOverride: () => {},
      ensureHostViewContext: () => true,
      moveSelectionToRoot: vi.fn(async () => {}),
      setLastQuickMoveDestinationToRoot,
      isTextInputTarget: () => false,
      isKeyboardSuppressed: () => false,
      releaseKeyboardCapture: () => {},
      suppressTransientFocusOut: () => {},
      notify: () => {},
      runUiAction,
      requestRenderFromLatestModel: () => {},
    })

    controller.handleContentKeydown(makeKeyboardEvent("u"))
    await Promise.resolve()
    await Promise.resolve()

    expect(reparentFromNodeIds).toHaveBeenCalledWith({
      nodeIds: ["group:G"],
      sourceGroupId: "G",
      targetParentPath: [],
      targetFrameId: "Frame-A",
    })
    expect(setLastQuickMoveDestinationToRoot).toHaveBeenCalledWith("Frame-A")
  })

  it("preserves explicit row node refs when Shift+Arrow extends keyboard selection", () => {
    const setSelectionOverrideWithNodes =
      vi.fn<(elementIds: readonly string[], nodes: readonly LayerNode[]) => void>()
    const selectElementsInView = vi.fn<(ids: string[]) => void>()
    const groupNode = makeGroupNode("G", "Frame-A")
    const leafNode = makeNode("el:C", "Gamma")

    const context: KeyboardShortcutContext = {
      actions: {} as LayerManagerUiActions,
      selection: {
        elementIds: ["A", "B"],
        nodes: [groupNode],
        frameResolution: makeFrameResolution("Frame-A"),
        structuralMove: {
          nodeIds: [groupNode.id],
          sourceGroupId: "G",
        },
      },
      explicitSelectedNodes: [groupNode],
      visibleNodes: [groupNode, leafNode],
      nodeById: new Map([
        [groupNode.id, groupNode],
        [leafNode.id, leafNode],
      ]),
      parentById: new Map([
        [groupNode.id, null],
        [leafNode.id, null],
      ]),
    }

    const controller = new SidepanelKeyboardShortcutController({
      getKeyboardContext: () => context,
      resolveKeyboardContext: (resolvedContext) => resolvedContext,
      getFocusedNodeId: () => groupNode.id,
      setFocusedNodeIdSilently: () => {},
      setFocusedNode: () => {},
      getInlineRenameNodeId: () => null,
      beginInlineRename: () => {},
      commitInlineRename: vi.fn(async () => {}),
      setSelectionOverride: () => {},
      setSelectionOverrideWithNodes,
      ensureHostViewContext: () => true,
      selectElementsInView,
      moveSelectionToRoot: vi.fn(async () => {}),
      setLastQuickMoveDestinationToRoot: () => {},
      isTextInputTarget: () => false,
      isKeyboardSuppressed: () => false,
      releaseKeyboardCapture: () => {},
      suppressTransientFocusOut: () => {},
      notify: () => {},
      runUiAction: () => {},
      requestRenderFromLatestModel: () => {},
    })

    controller.handleContentKeydown(makeKeyboardEvent("ArrowDown", { shiftKey: true }))

    expect(setSelectionOverrideWithNodes).toHaveBeenCalledWith(
      ["A", "B", "el:C"],
      [groupNode, leafNode],
    )
    expect(selectElementsInView).toHaveBeenCalledWith(["A", "B", "el:C"])
  })

  it("suppresses transient blur before handling Enter rename shortcut", () => {
    const suppressTransientFocusOut = vi.fn<() => void>()
    const beginInlineRename = vi.fn<(nodeId: string, initialValue: string) => void>()
    const runUiAction = vi.fn<(action: () => Promise<unknown>, fallbackMessage: string) => void>(
      (action) => {
        void action()
      },
    )

    const focusedNode = makeNode("el:A", "Alpha")
    const context: KeyboardShortcutContext = {
      actions: {} as LayerManagerUiActions,
      selection: {
        elementIds: [],
        nodes: [],
        frameResolution: makeFrameResolution(null),
      },
      visibleNodes: [focusedNode],
      nodeById: new Map([[focusedNode.id, focusedNode]]),
      parentById: new Map([[focusedNode.id, null]]),
    }

    const controller = new SidepanelKeyboardShortcutController({
      getKeyboardContext: () => context,
      resolveKeyboardContext: (resolvedContext) => resolvedContext,
      getFocusedNodeId: () => focusedNode.id,
      setFocusedNodeIdSilently: () => {},
      setFocusedNode: () => {},
      getInlineRenameNodeId: () => null,
      beginInlineRename,
      commitInlineRename: vi.fn(async () => {}),
      setSelectionOverride: () => {},
      ensureHostViewContext: () => true,
      moveSelectionToRoot: vi.fn(async () => {}),
      setLastQuickMoveDestinationToRoot: () => {},
      isTextInputTarget: () => false,
      isKeyboardSuppressed: () => false,
      releaseKeyboardCapture: () => {},
      suppressTransientFocusOut,
      notify: () => {},
      runUiAction,
      requestRenderFromLatestModel: () => {},
    })

    const event = makeKeyboardEvent("Enter")
    controller.handleContentKeydown(event)

    expect(suppressTransientFocusOut).toHaveBeenCalledTimes(1)
    expect(event.preventDefault as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1)
    expect(runUiAction).toHaveBeenCalledTimes(1)
    expect(beginInlineRename).toHaveBeenCalledWith("el:A", "Alpha")
  })
})
