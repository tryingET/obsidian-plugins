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

  it("keeps explicit selected rows ahead of focused-row fallback for keyboard reorder", async () => {
    const selectedNode = makeGroupNode("G", "Frame-A")
    const focusedNode = makeNode("el:B", "Beta")
    const reorderFromNodeIds = vi.fn(async () => ({ status: "applied", attempts: 1 as const }))
    const reorder = vi.fn(async () => ({ status: "applied", attempts: 1 as const }))
    const runUiAction = vi.fn<(action: () => Promise<unknown>, fallbackMessage: string) => void>(
      (action) => {
        void action()
      },
    )

    const context: KeyboardShortcutContext = {
      actions: {
        reorderFromNodeIds,
        commands: {
          reorder,
        },
      } as unknown as LayerManagerUiActions,
      selection: {
        elementIds: ["A", "B"],
        nodes: [selectedNode],
        explicitSelectedNodes: [selectedNode],
        frameResolution: makeFrameResolution("Frame-A"),
        structuralMove: {
          nodeIds: [selectedNode.id],
          sourceGroupId: "G",
        },
      },
      explicitSelectedNodes: [selectedNode],
      visibleNodes: [selectedNode, focusedNode],
      nodeById: new Map([
        [selectedNode.id, selectedNode],
        [focusedNode.id, focusedNode],
      ]),
      parentById: new Map([
        [selectedNode.id, null],
        [focusedNode.id, null],
      ]),
    }

    const controller = new SidepanelKeyboardShortcutController({
      getKeyboardContext: () => context,
      resolveKeyboardContext: (resolvedContext) => resolvedContext,
      getFocusedNodeId: () => focusedNode.id,
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
      releaseKeyboardCapture: () => {},
      suppressTransientFocusOut: () => {},
      notify: () => {},
      runUiAction,
      requestRenderFromLatestModel: () => {},
    })

    controller.handleContentKeydown(makeKeyboardEvent("f"))
    await Promise.resolve()
    await Promise.resolve()

    expect(reorderFromNodeIds).toHaveBeenCalledWith([selectedNode.id], "forward")
    expect(reorderFromNodeIds).not.toHaveBeenCalledWith([focusedNode.id], "forward")
    expect(reorder).not.toHaveBeenCalled()
  })

  it("keeps canonical selected elements ahead of focused-row fallback for keyboard reorder while staying on the command seam", async () => {
    const selectedNode = makeNode("el:A", "Alpha")
    const focusedNode = makeNode("el:B", "Beta")
    const reorderFromNodeIds = vi.fn(async () => ({ status: "applied", attempts: 1 as const }))
    const reorder = vi.fn(async () => ({ status: "applied", attempts: 1 as const }))
    const runUiAction = vi.fn<(action: () => Promise<unknown>, fallbackMessage: string) => void>(
      (action) => {
        void action()
      },
    )

    const context: KeyboardShortcutContext = {
      actions: {
        reorderFromNodeIds,
        commands: {
          reorder,
        },
      } as unknown as LayerManagerUiActions,
      selection: {
        elementIds: ["A"],
        nodes: [selectedNode],
        explicitSelectedNodes: null,
        frameResolution: makeFrameResolution(null),
      },
      explicitSelectedNodes: null,
      visibleNodes: [selectedNode, focusedNode],
      nodeById: new Map([
        [selectedNode.id, selectedNode],
        [focusedNode.id, focusedNode],
      ]),
      parentById: new Map([
        [selectedNode.id, null],
        [focusedNode.id, null],
      ]),
    }

    const controller = new SidepanelKeyboardShortcutController({
      getKeyboardContext: () => context,
      resolveKeyboardContext: (resolvedContext) => resolvedContext,
      getFocusedNodeId: () => focusedNode.id,
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
      releaseKeyboardCapture: () => {},
      suppressTransientFocusOut: () => {},
      notify: () => {},
      runUiAction,
      requestRenderFromLatestModel: () => {},
    })

    controller.handleContentKeydown(makeKeyboardEvent("f"))
    await Promise.resolve()
    await Promise.resolve()

    expect(reorder).toHaveBeenCalledWith({
      orderedElementIds: ["A"],
      mode: "forward",
    })
    expect(reorderFromNodeIds).not.toHaveBeenCalled()
  })

  it("routes delete, group, and ungroup-like through explicit row selection before focused-row fallback", async () => {
    const selectedNode = makeGroupNode("G", "Frame-A")
    const focusedNode = makeNode("el:B", "Beta")
    const commandDeleteNode = vi.fn(async () => ({ status: "applied", attempts: 1 as const }))
    const commandCreateGroup = vi.fn(async () => ({ status: "applied", attempts: 1 as const }))
    const explicitDeleteAction = vi.fn(async () => ({ status: "applied", attempts: 1 as const }))
    const explicitGroupAction = vi.fn(async () => ({ status: "applied", attempts: 1 as const }))
    const focusedUngroupFallback = vi.fn(async () => ({ status: "applied", attempts: 1 as const }))
    const moveSelectionToRoot = vi.fn(async () => {})
    const runUiAction = vi.fn<(action: () => Promise<unknown>, fallbackMessage: string) => void>(
      (action) => {
        void action()
      },
    )

    const context: KeyboardShortcutContext = {
      actions: {
        deleteNode: explicitDeleteAction,
        createGroupFromNodeIds: explicitGroupAction,
        reparentFromNodeIds: focusedUngroupFallback,
        commands: {
          deleteNode: commandDeleteNode,
          createGroup: commandCreateGroup,
        },
      } as unknown as LayerManagerUiActions,
      selection: {
        elementIds: ["A", "B"],
        nodes: [selectedNode],
        explicitSelectedNodes: [selectedNode],
        frameResolution: makeFrameResolution("Frame-A"),
        structuralMove: {
          nodeIds: [selectedNode.id],
          sourceGroupId: "G",
        },
      },
      explicitSelectedNodes: [selectedNode],
      visibleNodes: [selectedNode, focusedNode],
      nodeById: new Map([
        [selectedNode.id, selectedNode],
        [focusedNode.id, focusedNode],
      ]),
      parentById: new Map([
        [selectedNode.id, null],
        [focusedNode.id, null],
      ]),
    }

    const controller = new SidepanelKeyboardShortcutController({
      getKeyboardContext: () => context,
      resolveKeyboardContext: (resolvedContext) => resolvedContext,
      getFocusedNodeId: () => focusedNode.id,
      setFocusedNodeIdSilently: () => {},
      setFocusedNode: () => {},
      getInlineRenameNodeId: () => null,
      beginInlineRename: () => {},
      commitInlineRename: vi.fn(async () => {}),
      setSelectionOverride: () => {},
      ensureHostViewContext: () => true,
      moveSelectionToRoot,
      setLastQuickMoveDestinationToRoot: () => {},
      isTextInputTarget: () => false,
      isKeyboardSuppressed: () => false,
      releaseKeyboardCapture: () => {},
      suppressTransientFocusOut: () => {},
      notify: () => {},
      runUiAction,
      requestRenderFromLatestModel: () => {},
    })

    controller.handleContentKeydown(makeKeyboardEvent("Delete"))
    controller.handleContentKeydown(makeKeyboardEvent("g"))
    controller.handleContentKeydown(makeKeyboardEvent("u"))
    await Promise.resolve()
    await Promise.resolve()

    expect(explicitDeleteAction).toHaveBeenCalledWith(selectedNode.id)
    expect(commandDeleteNode).not.toHaveBeenCalled()
    expect(explicitGroupAction).toHaveBeenCalledWith({
      nodeIds: [selectedNode.id],
    })
    expect(commandCreateGroup).not.toHaveBeenCalled()
    expect(moveSelectionToRoot).toHaveBeenCalledWith(context.actions, context.selection)
    expect(focusedUngroupFallback).not.toHaveBeenCalled()
  })

  it("routes delete, group, and ungroup-like through canonical selection before focused-row fallback", async () => {
    const selectedNode = makeNode("el:A", "Alpha")
    const focusedNode = makeNode("el:B", "Beta")
    const commandDeleteNode = vi.fn(async () => ({ status: "applied", attempts: 1 as const }))
    const commandCreateGroup = vi.fn(async () => ({ status: "applied", attempts: 1 as const }))
    const focusedDeleteFallback = vi.fn(async () => ({ status: "applied", attempts: 1 as const }))
    const focusedGroupFallback = vi.fn(async () => ({ status: "applied", attempts: 1 as const }))
    const focusedUngroupFallback = vi.fn(async () => ({ status: "applied", attempts: 1 as const }))
    const moveSelectionToRoot = vi.fn(async () => {})
    const runUiAction = vi.fn<(action: () => Promise<unknown>, fallbackMessage: string) => void>(
      (action) => {
        void action()
      },
    )

    const context: KeyboardShortcutContext = {
      actions: {
        deleteNode: focusedDeleteFallback,
        createGroupFromNodeIds: focusedGroupFallback,
        reparentFromNodeIds: focusedUngroupFallback,
        commands: {
          deleteNode: commandDeleteNode,
          createGroup: commandCreateGroup,
        },
      } as unknown as LayerManagerUiActions,
      selection: {
        elementIds: ["A"],
        nodes: [selectedNode],
        explicitSelectedNodes: null,
        frameResolution: makeFrameResolution(null),
      },
      explicitSelectedNodes: null,
      visibleNodes: [selectedNode, focusedNode],
      nodeById: new Map([
        [selectedNode.id, selectedNode],
        [focusedNode.id, focusedNode],
      ]),
      parentById: new Map([
        [selectedNode.id, null],
        [focusedNode.id, null],
      ]),
    }

    const controller = new SidepanelKeyboardShortcutController({
      getKeyboardContext: () => context,
      resolveKeyboardContext: (resolvedContext) => resolvedContext,
      getFocusedNodeId: () => focusedNode.id,
      setFocusedNodeIdSilently: () => {},
      setFocusedNode: () => {},
      getInlineRenameNodeId: () => null,
      beginInlineRename: () => {},
      commitInlineRename: vi.fn(async () => {}),
      setSelectionOverride: () => {},
      ensureHostViewContext: () => true,
      moveSelectionToRoot,
      setLastQuickMoveDestinationToRoot: () => {},
      isTextInputTarget: () => false,
      isKeyboardSuppressed: () => false,
      releaseKeyboardCapture: () => {},
      suppressTransientFocusOut: () => {},
      notify: () => {},
      runUiAction,
      requestRenderFromLatestModel: () => {},
    })

    controller.handleContentKeydown(makeKeyboardEvent("Delete"))
    controller.handleContentKeydown(makeKeyboardEvent("g"))
    controller.handleContentKeydown(makeKeyboardEvent("u"))
    await Promise.resolve()
    await Promise.resolve()

    expect(commandDeleteNode).toHaveBeenCalledWith({
      elementIds: ["A"],
    })
    expect(focusedDeleteFallback).not.toHaveBeenCalled()
    expect(commandCreateGroup).toHaveBeenCalledWith({
      elementIds: ["A"],
    })
    expect(focusedGroupFallback).not.toHaveBeenCalled()
    expect(moveSelectionToRoot).toHaveBeenCalledWith(context.actions, context.selection)
    expect(focusedUngroupFallback).not.toHaveBeenCalled()
  })

  it("toggles the focused row into explicit selection on Space", () => {
    const anchorNode = makeNode("el:A", "Alpha")
    const focusedNode = makeNode("el:B", "Beta")
    const setSelectionOverrideWithNodes =
      vi.fn<(elementIds: readonly string[], nodes: readonly LayerNode[]) => void>()
    const setSelectionAnchorNodeId = vi.fn<(nodeId: string | null) => void>()
    const mirrorSelectionToHost = vi.fn<(elementIds: readonly string[]) => void>()
    const requestRenderFromLatestModel = vi.fn<() => void>()
    const setFocusedNode = vi.fn<(nodeId: string | null) => void>()

    const context: KeyboardShortcutContext = {
      actions: {} as LayerManagerUiActions,
      selection: {
        elementIds: ["el:A"],
        nodes: [anchorNode],
        frameResolution: makeFrameResolution(null),
      },
      explicitSelectedNodes: [anchorNode],
      anchorNodeId: anchorNode.id,
      visibleNodes: [anchorNode, focusedNode],
      nodeById: new Map([
        [anchorNode.id, anchorNode],
        [focusedNode.id, focusedNode],
      ]),
      parentById: new Map([
        [anchorNode.id, null],
        [focusedNode.id, null],
      ]),
    }

    const controller = new SidepanelKeyboardShortcutController({
      getKeyboardContext: () => context,
      resolveKeyboardContext: (resolvedContext) => resolvedContext,
      getFocusedNodeId: () => focusedNode.id,
      setFocusedNodeIdSilently: () => {},
      setFocusedNode,
      getInlineRenameNodeId: () => null,
      beginInlineRename: () => {},
      commitInlineRename: vi.fn(async () => {}),
      setSelectionOverride: () => {},
      setSelectionOverrideWithNodes,
      setSelectionAnchorNodeId,
      mirrorSelectionToHost,
      ensureHostViewContext: () => true,
      moveSelectionToRoot: vi.fn(async () => {}),
      setLastQuickMoveDestinationToRoot: () => {},
      isTextInputTarget: () => false,
      isKeyboardSuppressed: () => false,
      releaseKeyboardCapture: () => {},
      suppressTransientFocusOut: () => {},
      notify: () => {},
      runUiAction: () => {},
      requestRenderFromLatestModel,
    })

    controller.handleContentKeydown(makeKeyboardEvent("Space"))

    expect(setSelectionAnchorNodeId).toHaveBeenCalledWith(focusedNode.id)
    expect(setSelectionOverrideWithNodes).toHaveBeenCalledWith(
      ["el:A", "el:B"],
      [anchorNode, focusedNode],
    )
    expect(mirrorSelectionToHost).toHaveBeenCalledWith(["el:A", "el:B"])
    expect(requestRenderFromLatestModel).toHaveBeenCalledTimes(1)
    expect(setFocusedNode).not.toHaveBeenCalled()
  })

  it("selects the visible range from the current anchor on Shift+Space", () => {
    const anchorNode = makeNode("el:A", "Alpha")
    const middleNode = makeNode("el:B", "Beta")
    const focusedNode = makeNode("el:C", "Gamma")
    const setSelectionOverrideWithNodes =
      vi.fn<(elementIds: readonly string[], nodes: readonly LayerNode[]) => void>()
    const setSelectionAnchorNodeId = vi.fn<(nodeId: string | null) => void>()
    const mirrorSelectionToHost = vi.fn<(elementIds: readonly string[]) => void>()
    const requestRenderFromLatestModel = vi.fn<() => void>()
    const setFocusedNode = vi.fn<(nodeId: string | null) => void>()

    const context: KeyboardShortcutContext = {
      actions: {} as LayerManagerUiActions,
      selection: {
        elementIds: ["el:A"],
        nodes: [anchorNode],
        frameResolution: makeFrameResolution(null),
      },
      explicitSelectedNodes: [anchorNode],
      anchorNodeId: anchorNode.id,
      visibleNodes: [anchorNode, middleNode, focusedNode],
      nodeById: new Map([
        [anchorNode.id, anchorNode],
        [middleNode.id, middleNode],
        [focusedNode.id, focusedNode],
      ]),
      parentById: new Map([
        [anchorNode.id, null],
        [middleNode.id, null],
        [focusedNode.id, null],
      ]),
    }

    const controller = new SidepanelKeyboardShortcutController({
      getKeyboardContext: () => context,
      resolveKeyboardContext: (resolvedContext) => resolvedContext,
      getFocusedNodeId: () => focusedNode.id,
      setFocusedNodeIdSilently: () => {},
      setFocusedNode,
      getInlineRenameNodeId: () => null,
      beginInlineRename: () => {},
      commitInlineRename: vi.fn(async () => {}),
      setSelectionOverride: () => {},
      setSelectionOverrideWithNodes,
      setSelectionAnchorNodeId,
      mirrorSelectionToHost,
      ensureHostViewContext: () => true,
      moveSelectionToRoot: vi.fn(async () => {}),
      setLastQuickMoveDestinationToRoot: () => {},
      isTextInputTarget: () => false,
      isKeyboardSuppressed: () => false,
      releaseKeyboardCapture: () => {},
      suppressTransientFocusOut: () => {},
      notify: () => {},
      runUiAction: () => {},
      requestRenderFromLatestModel,
    })

    controller.handleContentKeydown(makeKeyboardEvent("Space", { shiftKey: true }))

    expect(setSelectionAnchorNodeId).toHaveBeenCalledWith(anchorNode.id)
    expect(setSelectionOverrideWithNodes).toHaveBeenCalledWith(
      ["el:A", "el:B", "el:C"],
      [anchorNode, middleNode, focusedNode],
    )
    expect(mirrorSelectionToHost).toHaveBeenCalledWith(["el:A", "el:B", "el:C"])
    expect(requestRenderFromLatestModel).toHaveBeenCalledTimes(1)
    expect(setFocusedNode).not.toHaveBeenCalled()
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

  it("restores first-row focus when ArrowDown starts without a focused row", () => {
    const setFocusedNode = vi.fn<(nodeId: string | null) => void>()
    const firstNode = makeNode("el:A", "Alpha")
    const secondNode = makeNode("el:B", "Beta")

    const context: KeyboardShortcutContext = {
      actions: {} as LayerManagerUiActions,
      selection: {
        elementIds: [],
        nodes: [],
        frameResolution: makeFrameResolution(null),
      },
      visibleNodes: [firstNode, secondNode],
      nodeById: new Map([
        [firstNode.id, firstNode],
        [secondNode.id, secondNode],
      ]),
      parentById: new Map([
        [firstNode.id, null],
        [secondNode.id, null],
      ]),
    }

    const controller = new SidepanelKeyboardShortcutController({
      getKeyboardContext: () => context,
      resolveKeyboardContext: (resolvedContext) => resolvedContext,
      getFocusedNodeId: () => null,
      setFocusedNodeIdSilently: () => {},
      setFocusedNode,
      getInlineRenameNodeId: () => null,
      beginInlineRename: () => {},
      commitInlineRename: vi.fn(async () => {}),
      setSelectionOverride: () => {},
      ensureHostViewContext: () => true,
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

    controller.handleContentKeydown(makeKeyboardEvent("ArrowDown"))

    expect(setFocusedNode).toHaveBeenCalledWith(firstNode.id)
  })

  it("restores last-row focus when ArrowUp starts without a focused row", () => {
    const setFocusedNode = vi.fn<(nodeId: string | null) => void>()
    const firstNode = makeNode("el:A", "Alpha")
    const secondNode = makeNode("el:B", "Beta")

    const context: KeyboardShortcutContext = {
      actions: {} as LayerManagerUiActions,
      selection: {
        elementIds: [],
        nodes: [],
        frameResolution: makeFrameResolution(null),
      },
      visibleNodes: [firstNode, secondNode],
      nodeById: new Map([
        [firstNode.id, firstNode],
        [secondNode.id, secondNode],
      ]),
      parentById: new Map([
        [firstNode.id, null],
        [secondNode.id, null],
      ]),
    }

    const controller = new SidepanelKeyboardShortcutController({
      getKeyboardContext: () => context,
      resolveKeyboardContext: (resolvedContext) => resolvedContext,
      getFocusedNodeId: () => null,
      setFocusedNodeIdSilently: () => {},
      setFocusedNode,
      getInlineRenameNodeId: () => null,
      beginInlineRename: () => {},
      commitInlineRename: vi.fn(async () => {}),
      setSelectionOverride: () => {},
      ensureHostViewContext: () => true,
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

    controller.handleContentKeydown(makeKeyboardEvent("ArrowUp"))

    expect(setFocusedNode).toHaveBeenCalledWith(secondNode.id)
  })

  it("moves focus to the first and last visible row with Home and End", () => {
    const setFocusedNode = vi.fn<(nodeId: string | null) => void>()
    const firstNode = makeNode("el:A", "Alpha")
    const middleNode = makeNode("el:B", "Beta")
    const lastNode = makeNode("el:C", "Gamma")

    const context: KeyboardShortcutContext = {
      actions: {} as LayerManagerUiActions,
      selection: {
        elementIds: [],
        nodes: [],
        frameResolution: makeFrameResolution(null),
      },
      visibleNodes: [firstNode, middleNode, lastNode],
      nodeById: new Map([
        [firstNode.id, firstNode],
        [middleNode.id, middleNode],
        [lastNode.id, lastNode],
      ]),
      parentById: new Map([
        [firstNode.id, null],
        [middleNode.id, null],
        [lastNode.id, null],
      ]),
    }

    const controller = new SidepanelKeyboardShortcutController({
      getKeyboardContext: () => context,
      resolveKeyboardContext: (resolvedContext) => resolvedContext,
      getFocusedNodeId: () => middleNode.id,
      setFocusedNodeIdSilently: () => {},
      setFocusedNode,
      getInlineRenameNodeId: () => null,
      beginInlineRename: () => {},
      commitInlineRename: vi.fn(async () => {}),
      setSelectionOverride: () => {},
      ensureHostViewContext: () => true,
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

    controller.handleContentKeydown(makeKeyboardEvent("Home"))
    controller.handleContentKeydown(makeKeyboardEvent("End"))

    expect(setFocusedNode).toHaveBeenNthCalledWith(1, firstNode.id)
    expect(setFocusedNode).toHaveBeenNthCalledWith(2, lastNode.id)
  })

  it("moves focus by a page with PageDown and PageUp", () => {
    const setFocusedNode = vi.fn<(nodeId: string | null) => void>()
    const firstNode = makeNode("el:A", "Alpha")
    const secondNode = makeNode("el:B", "Beta")
    const thirdNode = makeNode("el:C", "Gamma")
    const fourthNode = makeNode("el:D", "Delta")
    const fifthNode = makeNode("el:E", "Epsilon")

    const context: KeyboardShortcutContext = {
      actions: {} as LayerManagerUiActions,
      selection: {
        elementIds: [],
        nodes: [],
        frameResolution: makeFrameResolution(null),
      },
      visibleNodes: [firstNode, secondNode, thirdNode, fourthNode, fifthNode],
      nodeById: new Map([
        [firstNode.id, firstNode],
        [secondNode.id, secondNode],
        [thirdNode.id, thirdNode],
        [fourthNode.id, fourthNode],
        [fifthNode.id, fifthNode],
      ]),
      parentById: new Map([
        [firstNode.id, null],
        [secondNode.id, null],
        [thirdNode.id, null],
        [fourthNode.id, null],
        [fifthNode.id, null],
      ]),
    }

    const focusedNodeIds = [secondNode.id, fourthNode.id]
    let focusedIndex = 0

    const controller = new SidepanelKeyboardShortcutController({
      getKeyboardContext: () => context,
      resolveKeyboardContext: (resolvedContext) => resolvedContext,
      getFocusedNodeId: () => focusedNodeIds[focusedIndex] ?? null,
      setFocusedNodeIdSilently: () => {},
      setFocusedNode: (nodeId) => {
        setFocusedNode(nodeId)
        focusedIndex += 1
      },
      getInlineRenameNodeId: () => null,
      beginInlineRename: () => {},
      commitInlineRename: vi.fn(async () => {}),
      setSelectionOverride: () => {},
      getPageNavigationStep: () => 2,
      ensureHostViewContext: () => true,
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

    controller.handleContentKeydown(makeKeyboardEvent("PageDown"))
    controller.handleContentKeydown(makeKeyboardEvent("PageUp"))

    expect(setFocusedNode).toHaveBeenNthCalledWith(1, fourthNode.id)
    expect(setFocusedNode).toHaveBeenNthCalledWith(2, secondNode.id)
  })

  it("extends explicit selection across a page range on Shift+PageDown", () => {
    const firstNode = makeNode("el:A", "Alpha")
    const secondNode = makeNode("el:B", "Beta")
    const thirdNode = makeNode("el:C", "Gamma")
    const fourthNode = makeNode("el:D", "Delta")
    const fifthNode = makeNode("el:E", "Epsilon")
    const setSelectionOverrideWithNodes =
      vi.fn<(elementIds: readonly string[], nodes: readonly LayerNode[]) => void>()
    const setSelectionAnchorNodeId = vi.fn<(nodeId: string | null) => void>()
    const mirrorSelectionToHost = vi.fn<(elementIds: readonly string[]) => void>()
    const requestRenderFromLatestModel = vi.fn<() => void>()
    const setFocusedNode = vi.fn<(nodeId: string | null) => void>()

    const context: KeyboardShortcutContext = {
      actions: {} as LayerManagerUiActions,
      selection: {
        elementIds: [firstNode.id],
        nodes: [firstNode],
        frameResolution: makeFrameResolution(null),
      },
      explicitSelectedNodes: [firstNode],
      anchorNodeId: firstNode.id,
      visibleNodes: [firstNode, secondNode, thirdNode, fourthNode, fifthNode],
      nodeById: new Map([
        [firstNode.id, firstNode],
        [secondNode.id, secondNode],
        [thirdNode.id, thirdNode],
        [fourthNode.id, fourthNode],
        [fifthNode.id, fifthNode],
      ]),
      parentById: new Map([
        [firstNode.id, null],
        [secondNode.id, null],
        [thirdNode.id, null],
        [fourthNode.id, null],
        [fifthNode.id, null],
      ]),
    }

    const controller = new SidepanelKeyboardShortcutController({
      getKeyboardContext: () => context,
      resolveKeyboardContext: (resolvedContext) => resolvedContext,
      getFocusedNodeId: () => secondNode.id,
      setFocusedNodeIdSilently: () => {},
      setFocusedNode,
      getInlineRenameNodeId: () => null,
      beginInlineRename: () => {},
      commitInlineRename: vi.fn(async () => {}),
      setSelectionOverride: () => {},
      setSelectionOverrideWithNodes,
      setSelectionAnchorNodeId,
      mirrorSelectionToHost,
      getPageNavigationStep: () => 2,
      ensureHostViewContext: () => true,
      moveSelectionToRoot: vi.fn(async () => {}),
      setLastQuickMoveDestinationToRoot: () => {},
      isTextInputTarget: () => false,
      isKeyboardSuppressed: () => false,
      releaseKeyboardCapture: () => {},
      suppressTransientFocusOut: () => {},
      notify: () => {},
      runUiAction: () => {},
      requestRenderFromLatestModel,
    })

    controller.handleContentKeydown(makeKeyboardEvent("PageDown", { shiftKey: true }))

    expect(setSelectionAnchorNodeId).toHaveBeenCalledWith(firstNode.id)
    expect(setSelectionOverrideWithNodes).toHaveBeenCalledWith(
      [firstNode.id, secondNode.id, thirdNode.id, fourthNode.id],
      [firstNode, secondNode, thirdNode, fourthNode],
    )
    expect(mirrorSelectionToHost).toHaveBeenCalledWith([
      firstNode.id,
      secondNode.id,
      thirdNode.id,
      fourthNode.id,
    ])
    expect(requestRenderFromLatestModel).toHaveBeenCalledTimes(1)
    expect(setFocusedNode).toHaveBeenCalledWith(fourthNode.id)
  })

  it("restores first-row focus and expands collapsed groups when ArrowRight starts without a focused row", () => {
    const toggleExpanded = vi.fn<(nodeId: string) => void>()
    const setFocusedNode = vi.fn<(nodeId: string | null) => void>()
    const groupNode = makeGroupNode("G")
    const collapsedGroupNode = {
      ...groupNode,
      isExpanded: false,
    }

    const context: KeyboardShortcutContext = {
      actions: {
        toggleExpanded,
      } as unknown as LayerManagerUiActions,
      selection: {
        elementIds: [],
        nodes: [],
        frameResolution: makeFrameResolution(null),
      },
      visibleNodes: [collapsedGroupNode],
      nodeById: new Map([[collapsedGroupNode.id, collapsedGroupNode]]),
      parentById: new Map([[collapsedGroupNode.id, null]]),
    }

    const controller = new SidepanelKeyboardShortcutController({
      getKeyboardContext: () => context,
      resolveKeyboardContext: (resolvedContext) => resolvedContext,
      getFocusedNodeId: () => null,
      setFocusedNodeIdSilently: () => {},
      setFocusedNode,
      getInlineRenameNodeId: () => null,
      beginInlineRename: () => {},
      commitInlineRename: vi.fn(async () => {}),
      setSelectionOverride: () => {},
      ensureHostViewContext: () => true,
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

    controller.handleContentKeydown(makeKeyboardEvent("ArrowRight"))

    expect(setFocusedNode).toHaveBeenCalledWith(collapsedGroupNode.id)
    expect(toggleExpanded).toHaveBeenCalledWith(collapsedGroupNode.id)
  })

  it("restores first-row focus and collapses expanded groups when ArrowLeft starts without a focused row", () => {
    const toggleExpanded = vi.fn<(nodeId: string) => void>()
    const setFocusedNode = vi.fn<(nodeId: string | null) => void>()
    const groupNode = makeGroupNode("G")

    const context: KeyboardShortcutContext = {
      actions: {
        toggleExpanded,
      } as unknown as LayerManagerUiActions,
      selection: {
        elementIds: [],
        nodes: [],
        frameResolution: makeFrameResolution(null),
      },
      visibleNodes: [groupNode],
      nodeById: new Map([[groupNode.id, groupNode]]),
      parentById: new Map([[groupNode.id, null]]),
    }

    const controller = new SidepanelKeyboardShortcutController({
      getKeyboardContext: () => context,
      resolveKeyboardContext: (resolvedContext) => resolvedContext,
      getFocusedNodeId: () => null,
      setFocusedNodeIdSilently: () => {},
      setFocusedNode,
      getInlineRenameNodeId: () => null,
      beginInlineRename: () => {},
      commitInlineRename: vi.fn(async () => {}),
      setSelectionOverride: () => {},
      ensureHostViewContext: () => true,
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

    controller.handleContentKeydown(makeKeyboardEvent("ArrowLeft"))

    expect(setFocusedNode).toHaveBeenCalledWith(groupNode.id)
    expect(toggleExpanded).toHaveBeenCalledWith(groupNode.id)
  })

  it("rebinds stale focus once and still expands collapsed groups on ArrowRight", () => {
    const toggleExpanded = vi.fn<(nodeId: string) => void>()
    const setFocusedNode = vi.fn<(nodeId: string | null) => void>()
    const notify = vi.fn<(message: string) => void>()
    const groupNode = makeGroupNode("G")
    const collapsedGroupNode = {
      ...groupNode,
      isExpanded: false,
    }

    const context: KeyboardShortcutContext = {
      actions: {
        toggleExpanded,
      } as unknown as LayerManagerUiActions,
      selection: {
        elementIds: [],
        nodes: [],
        frameResolution: makeFrameResolution(null),
      },
      visibleNodes: [collapsedGroupNode],
      nodeById: new Map([[collapsedGroupNode.id, collapsedGroupNode]]),
      parentById: new Map([[collapsedGroupNode.id, null]]),
    }

    const controller = new SidepanelKeyboardShortcutController({
      getKeyboardContext: () => context,
      resolveKeyboardContext: (resolvedContext) => resolvedContext,
      getFocusedNodeId: () => "stale",
      setFocusedNodeIdSilently: () => {},
      setFocusedNode,
      getInlineRenameNodeId: () => null,
      beginInlineRename: () => {},
      commitInlineRename: vi.fn(async () => {}),
      setSelectionOverride: () => {},
      ensureHostViewContext: () => true,
      moveSelectionToRoot: vi.fn(async () => {}),
      setLastQuickMoveDestinationToRoot: () => {},
      isTextInputTarget: () => false,
      isKeyboardSuppressed: () => false,
      releaseKeyboardCapture: () => {},
      suppressTransientFocusOut: () => {},
      notify,
      runUiAction: () => {},
      requestRenderFromLatestModel: () => {},
    })

    controller.handleContentKeydown(makeKeyboardEvent("ArrowRight"))

    expect(notify).toHaveBeenCalledWith("Keyboard focus is stale. Refreshing row focus.")
    expect(setFocusedNode).toHaveBeenCalledWith(collapsedGroupNode.id)
    expect(toggleExpanded).toHaveBeenCalledWith(collapsedGroupNode.id)
  })

  it("rebinds stale focus once and still collapses expanded groups on ArrowLeft", () => {
    const toggleExpanded = vi.fn<(nodeId: string) => void>()
    const setFocusedNode = vi.fn<(nodeId: string | null) => void>()
    const notify = vi.fn<(message: string) => void>()
    const groupNode = makeGroupNode("G")

    const context: KeyboardShortcutContext = {
      actions: {
        toggleExpanded,
      } as unknown as LayerManagerUiActions,
      selection: {
        elementIds: [],
        nodes: [],
        frameResolution: makeFrameResolution(null),
      },
      visibleNodes: [groupNode],
      nodeById: new Map([[groupNode.id, groupNode]]),
      parentById: new Map([[groupNode.id, null]]),
    }

    const controller = new SidepanelKeyboardShortcutController({
      getKeyboardContext: () => context,
      resolveKeyboardContext: (resolvedContext) => resolvedContext,
      getFocusedNodeId: () => "stale",
      setFocusedNodeIdSilently: () => {},
      setFocusedNode,
      getInlineRenameNodeId: () => null,
      beginInlineRename: () => {},
      commitInlineRename: vi.fn(async () => {}),
      setSelectionOverride: () => {},
      ensureHostViewContext: () => true,
      moveSelectionToRoot: vi.fn(async () => {}),
      setLastQuickMoveDestinationToRoot: () => {},
      isTextInputTarget: () => false,
      isKeyboardSuppressed: () => false,
      releaseKeyboardCapture: () => {},
      suppressTransientFocusOut: () => {},
      notify,
      runUiAction: () => {},
      requestRenderFromLatestModel: () => {},
    })

    controller.handleContentKeydown(makeKeyboardEvent("ArrowLeft"))

    expect(notify).toHaveBeenCalledWith("Keyboard focus is stale. Refreshing row focus.")
    expect(setFocusedNode).toHaveBeenCalledWith(groupNode.id)
    expect(toggleExpanded).toHaveBeenCalledWith(groupNode.id)
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
