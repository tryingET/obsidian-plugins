import { describe, expect, it, vi } from "vitest"

import type { LayerNode } from "../src/model/tree.js"
import type { LayerManagerUiActions } from "../src/ui/renderer.js"
import {
  type KeyboardShortcutContext,
  SidepanelKeyboardShortcutController,
} from "../src/ui/sidepanel/keyboard/keyboardShortcutController.js"

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

const makeKeyboardEvent = (key: string): KeyboardEvent => {
  return {
    key,
    shiftKey: false,
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
