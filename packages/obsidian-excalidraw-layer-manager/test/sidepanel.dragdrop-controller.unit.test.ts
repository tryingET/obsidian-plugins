import { describe, expect, it, vi } from "vitest"

import type { LayerNode } from "../src/model/tree.js"
import type { LayerManagerUiActions } from "../src/ui/renderer.js"
import {
  type DragDropBranchContext,
  type NodeDropTarget,
  SidepanelDragDropController,
} from "../src/ui/sidepanel/dragdrop/dragDropController.js"

const makeElementNode = (
  id: string,
  options?: {
    readonly frameId?: string | null
  },
): LayerNode => ({
  id,
  type: "element",
  elementIds: [id],
  primaryElementId: id,
  children: [],
  canExpand: false,
  isExpanded: false,
  groupId: null,
  frameId: options?.frameId ?? null,
  label: id,
})

const makeGroupNode = (
  groupId: string,
  options?: {
    readonly frameId?: string | null
    readonly elementIds?: readonly string[]
    readonly primaryElementId?: string
  },
): LayerNode => ({
  id: `group:${groupId}`,
  type: "group",
  elementIds: [...(options?.elementIds ?? [`el:${groupId}`])],
  primaryElementId: options?.primaryElementId ?? options?.elementIds?.[0] ?? `el:${groupId}`,
  children: [],
  canExpand: true,
  isExpanded: true,
  groupId,
  frameId: options?.frameId ?? null,
  label: groupId,
})

const makeFrameNode = (frameId: string): LayerNode => ({
  id: `frame:${frameId}`,
  type: "frame",
  elementIds: [frameId],
  primaryElementId: frameId,
  children: [],
  canExpand: false,
  isExpanded: false,
  groupId: null,
  frameId: null,
  label: frameId,
})

const makeExpandedFrameNode = (frameId: string, children: readonly LayerNode[]): LayerNode => ({
  ...makeFrameNode(frameId),
  children: [...children],
  canExpand: children.length > 0,
  isExpanded: true,
})

const makeDragEvent = () => {
  const setData = vi.fn<(type: string, data: string) => void>()

  const event = {
    dataTransfer: {
      effectAllowed: "none",
      dropEffect: "none",
      setData,
    },
    preventDefault: vi.fn(),
  }

  return {
    event: event as unknown as DragEvent,
    setData,
    preventDefault: event.preventDefault,
  }
}

const makeScope = (
  frameId: string | null,
  groupPath: readonly string[] = [],
): DragDropBranchContext => ({
  frameId,
  groupPath: [...groupPath],
})

const makeDropTarget = (overrides: Partial<NodeDropTarget> = {}): NodeDropTarget => ({
  targetParentPath: [],
  targetFrameId: null,
  rowScope: makeScope(null),
  siblingIndex: 0,
  rowReorderEligible: true,
  ...overrides,
})

const makeActions = (
  outcome:
    | { readonly status: "applied"; readonly attempts: 1 }
    | { readonly status: "plannerError"; readonly error: string; readonly attempts: 1 }
    | { readonly status: "preflightFailed"; readonly reason: string; readonly attempts: 1 } = {
    status: "applied",
    attempts: 1,
  },
) => {
  const reorderRelativeToNodeIds = vi.fn(async () => outcome)
  const reparentFromNodeIds = vi.fn(async () => outcome)

  return {
    actions: {
      reorderRelativeToNodeIds,
      reparentFromNodeIds,
    } as unknown as LayerManagerUiActions,
    reorderRelativeToNodeIds,
    reparentFromNodeIds,
  }
}

describe("sidepanel drag-drop controller", () => {
  it("resolves node frame IDs and drop targets deterministically", () => {
    const notify = vi.fn<(message: string) => void>()
    const requestRenderFromLatestModel = vi.fn<() => void>()
    const controller = new SidepanelDragDropController({
      notify,
      requestRenderFromLatestModel,
    })

    const branch = makeScope("frame:A", ["Outer"])

    const group = makeGroupNode("G")
    const frame = makeFrameNode("frame:B")
    const element = makeElementNode("el:A")

    expect(controller.resolveNodeFrameId(group, branch)).toBe("frame:A")
    expect(controller.resolveNodeFrameId(frame, branch)).toBe("frame:B")

    expect(controller.resolveDropTargetForNode(group, branch, 1)).toEqual({
      targetParentPath: ["Outer", "G"],
      targetFrameId: "frame:A",
      rowScope: makeScope("frame:A", ["Outer"]),
      siblingIndex: 1,
      rowReorderEligible: true,
    })
    expect(controller.resolveDropTargetForNode(frame, branch, 0)).toEqual({
      targetParentPath: [],
      targetFrameId: "frame:B",
      rowScope: makeScope("frame:A", ["Outer"]),
      siblingIndex: 0,
      rowReorderEligible: false,
    })
    expect(controller.resolveDropTargetForNode(element, branch, 2)).toEqual({
      targetParentPath: ["Outer"],
      targetFrameId: "frame:A",
      rowScope: makeScope("frame:A", ["Outer"]),
      siblingIndex: 2,
      rowReorderEligible: true,
    })
  })

  it("requalifies same-scope draggable rows as reorder and preserves frame-row reparent semantics", () => {
    const notify = vi.fn<(message: string) => void>()
    const requestRenderFromLatestModel = vi.fn<() => void>()
    const controller = new SidepanelDragDropController({
      notify,
      requestRenderFromLatestModel,
    })

    controller.startRowDrag({
      node: makeElementNode("el:A", { frameId: "frame:A" }),
      nodeFrameId: "frame:A",
      branchGroupPath: ["Inner"],
      rowScope: makeScope("frame:A", ["Inner"]),
      siblingIndex: 2,
      dragEvent: makeDragEvent().event,
    })

    expect(
      controller.previewDropIntent(
        "group:Dest",
        makeDropTarget({
          targetParentPath: ["Inner", "Dest"],
          targetFrameId: "frame:A",
          rowScope: makeScope("frame:A", ["Inner"]),
          siblingIndex: 0,
          rowReorderEligible: true,
        }),
      ),
    ).toEqual({
      kind: "reorder",
      placement: "before",
    })

    expect(
      controller.previewDropIntent(
        "el:Tail",
        makeDropTarget({
          targetParentPath: ["Inner"],
          targetFrameId: "frame:A",
          rowScope: makeScope("frame:A", ["Inner"]),
          siblingIndex: 4,
          rowReorderEligible: true,
        }),
      ),
    ).toEqual({
      kind: "reorder",
      placement: "after",
    })

    expect(
      controller.previewDropIntent(
        "frame:frame:A",
        makeDropTarget({
          targetParentPath: [],
          targetFrameId: "frame:A",
          rowScope: makeScope(null),
          siblingIndex: 0,
          rowReorderEligible: false,
        }),
      ),
    ).toEqual({
      kind: "reparent",
    })
  })

  it("enforces drag-drop compatibility rules", () => {
    const notify = vi.fn<(message: string) => void>()
    const requestRenderFromLatestModel = vi.fn<() => void>()
    const controller = new SidepanelDragDropController({
      notify,
      requestRenderFromLatestModel,
    })

    controller.startRowDrag({
      node: makeGroupNode("G", { frameId: "frame:A" }),
      nodeFrameId: "frame:A",
      branchGroupPath: [],
      rowScope: makeScope("frame:A"),
      siblingIndex: 1,
      dragEvent: makeDragEvent().event,
    })

    expect(
      controller.canDropDraggedNode(
        "group:G",
        makeDropTarget({
          targetParentPath: [],
          targetFrameId: "frame:A",
          rowScope: makeScope("frame:A"),
          siblingIndex: 0,
        }),
      ),
    ).toBe(false)

    expect(
      controller.canDropDraggedNode(
        "el:target",
        makeDropTarget({
          targetParentPath: [],
          targetFrameId: "frame:B",
          rowScope: makeScope("frame:B"),
          siblingIndex: 0,
        }),
      ),
    ).toBe(false)

    expect(
      controller.canDropDraggedNode(
        "el:target",
        makeDropTarget({
          targetParentPath: ["Root", "G"],
          targetFrameId: "frame:A",
          rowScope: makeScope("frame:A", ["Root"]),
          siblingIndex: 0,
          rowReorderEligible: false,
        }),
      ),
    ).toBe(false)

    expect(
      controller.canDropDraggedNode(
        "el:target",
        makeDropTarget({
          targetParentPath: ["Root"],
          targetFrameId: "frame:A",
          rowScope: makeScope("frame:A", ["Root"]),
          siblingIndex: 0,
        }),
      ),
    ).toBe(true)
  })

  it("re-resolves same-scope reorder placement from the latest structural tree", () => {
    const notify = vi.fn<(message: string) => void>()
    const requestRenderFromLatestModel = vi.fn<() => void>()
    let latestStructuralTree: readonly LayerNode[] | null = [
      makeElementNode("el:A"),
      makeElementNode("el:B"),
      makeElementNode("el:C"),
    ]
    const controller = new SidepanelDragDropController({
      notify,
      requestRenderFromLatestModel,
      getLatestStructuralTree: () => latestStructuralTree,
    })

    controller.startRowDrag({
      node: makeElementNode("el:A"),
      nodeFrameId: null,
      branchGroupPath: [],
      rowScope: makeScope(null),
      siblingIndex: 0,
      dragEvent: makeDragEvent().event,
    })

    latestStructuralTree = [
      makeElementNode("el:B"),
      makeElementNode("el:A"),
      makeElementNode("el:C"),
    ]

    expect(
      controller.previewDropIntent(
        "el:B",
        makeDropTarget({
          targetParentPath: [],
          targetFrameId: null,
          rowScope: makeScope(null),
          siblingIndex: 1,
          rowReorderEligible: true,
        }),
      ),
    ).toEqual({
      kind: "reorder",
      placement: "before",
    })
  })

  it("re-resolves same-frame child reorder placement from the latest structural tree", () => {
    const notify = vi.fn<(message: string) => void>()
    const requestRenderFromLatestModel = vi.fn<() => void>()
    let latestStructuralTree: readonly LayerNode[] | null = [
      makeExpandedFrameNode("frame:A", [
        makeElementNode("el:A", { frameId: "frame:A" }),
        makeElementNode("el:B", { frameId: "frame:A" }),
        makeElementNode("el:C", { frameId: "frame:A" }),
      ]),
    ]
    const controller = new SidepanelDragDropController({
      notify,
      requestRenderFromLatestModel,
      getLatestStructuralTree: () => latestStructuralTree,
    })

    controller.startRowDrag({
      node: makeElementNode("el:A", { frameId: "frame:A" }),
      nodeFrameId: "frame:A",
      branchGroupPath: [],
      rowScope: makeScope("frame:A"),
      siblingIndex: 0,
      dragEvent: makeDragEvent().event,
    })

    latestStructuralTree = [
      makeExpandedFrameNode("frame:A", [
        makeElementNode("el:B", { frameId: "frame:A" }),
        makeElementNode("el:A", { frameId: "frame:A" }),
        makeElementNode("el:C", { frameId: "frame:A" }),
      ]),
    ]

    expect(
      controller.previewDropIntent(
        "el:B",
        makeDropTarget({
          targetParentPath: [],
          targetFrameId: "frame:A",
          rowScope: makeScope("frame:A"),
          siblingIndex: 1,
          rowReorderEligible: true,
        }),
      ),
    ).toEqual({
      kind: "reorder",
      placement: "before",
    })
  })

  it("re-resolves same-frame group reorder placement from the latest structural tree", () => {
    const notify = vi.fn<(message: string) => void>()
    const requestRenderFromLatestModel = vi.fn<() => void>()
    let latestStructuralTree: readonly LayerNode[] | null = [
      makeExpandedFrameNode("frame:A", [
        makeGroupNode("Alpha", { frameId: "frame:A" }),
        makeGroupNode("Beta", { frameId: "frame:A" }),
        makeGroupNode("Gamma", { frameId: "frame:A" }),
      ]),
    ]
    const controller = new SidepanelDragDropController({
      notify,
      requestRenderFromLatestModel,
      getLatestStructuralTree: () => latestStructuralTree,
    })

    controller.startRowDrag({
      node: makeGroupNode("Alpha", { frameId: "frame:A" }),
      nodeFrameId: "frame:A",
      branchGroupPath: [],
      rowScope: makeScope("frame:A"),
      siblingIndex: 0,
      dragEvent: makeDragEvent().event,
    })

    latestStructuralTree = [
      makeExpandedFrameNode("frame:A", [
        makeGroupNode("Beta", { frameId: "frame:A" }),
        makeGroupNode("Alpha", { frameId: "frame:A" }),
        makeGroupNode("Gamma", { frameId: "frame:A" }),
      ]),
    ]

    expect(
      controller.previewDropIntent(
        "group:Beta",
        makeDropTarget({
          targetParentPath: ["Beta"],
          targetFrameId: "frame:A",
          rowScope: makeScope("frame:A"),
          siblingIndex: 1,
          rowReorderEligible: true,
        }),
      ),
    ).toEqual({
      kind: "reorder",
      placement: "before",
    })
  })

  it("tracks drop hints across drag lifecycle events", () => {
    const notify = vi.fn<(message: string) => void>()
    const requestRenderFromLatestModel = vi.fn<() => void>()
    const controller = new SidepanelDragDropController({
      notify,
      requestRenderFromLatestModel,
    })

    const drag = makeDragEvent()
    const targetDrop = makeDropTarget({
      targetParentPath: ["Root"],
      targetFrameId: "frame:A",
      rowScope: makeScope("frame:A", ["Root"]),
      siblingIndex: 0,
    })

    controller.startRowDrag({
      node: makeElementNode("el:A", { frameId: "frame:A" }),
      nodeFrameId: "frame:A",
      branchGroupPath: [],
      rowScope: makeScope("frame:A"),
      siblingIndex: 1,
      dragEvent: drag.event,
    })

    expect(controller.dropHintNodeId).toBeNull()

    const dragEnter = makeDragEvent()
    controller.handleDragEnter("el:target", targetDrop, dragEnter.event)
    expect(controller.dropHintNodeId).toBe("el:target")
    expect(controller.dropHint).toEqual({
      nodeId: "el:target",
      kind: "reparent",
    })
    expect(dragEnter.preventDefault).toHaveBeenCalledTimes(1)

    const reorderDragOver = makeDragEvent()
    controller.handleDragOver(
      "el:before-target",
      makeDropTarget({
        targetParentPath: [],
        targetFrameId: "frame:A",
        rowScope: makeScope("frame:A"),
        siblingIndex: 0,
      }),
      reorderDragOver.event,
    )
    expect(controller.dropHintNodeId).toBe("el:before-target")
    expect(controller.dropHint).toEqual({
      nodeId: "el:before-target",
      kind: "reorder",
      placement: "before",
    })
    expect(reorderDragOver.preventDefault).toHaveBeenCalledTimes(1)

    controller.handleDragLeave("el:before-target", false)
    expect(controller.dropHintNodeId).toBe("el:before-target")
    expect(controller.dropHint).toEqual({
      nodeId: "el:before-target",
      kind: "reorder",
      placement: "before",
    })

    controller.endRowDrag()
    expect(controller.dropHintNodeId).toBeNull()
    expect(requestRenderFromLatestModel).toHaveBeenCalled()
  })

  it("defers dragleave clearing so same-target dragover can retain the current hint", () => {
    vi.useFakeTimers()

    try {
      const notify = vi.fn<(message: string) => void>()
      const requestRenderFromLatestModel = vi.fn<() => void>()
      const controller = new SidepanelDragDropController({
        notify,
        requestRenderFromLatestModel,
      })
      const targetDrop = makeDropTarget({
        targetParentPath: ["Root"],
        targetFrameId: "frame:A",
        rowScope: makeScope("frame:A", ["Root"]),
        siblingIndex: 0,
      })

      controller.startRowDrag({
        node: makeElementNode("el:A", { frameId: "frame:A" }),
        nodeFrameId: "frame:A",
        branchGroupPath: [],
        rowScope: makeScope("frame:A"),
        siblingIndex: 1,
        dragEvent: makeDragEvent().event,
      })

      controller.handleDragOver("el:target", targetDrop, makeDragEvent().event)
      expect(controller.dropHint).toEqual({
        nodeId: "el:target",
        kind: "reparent",
      })
      expect(requestRenderFromLatestModel).toHaveBeenCalledTimes(1)

      controller.handleDragLeave("el:target", false)
      expect(controller.dropHint).toEqual({
        nodeId: "el:target",
        kind: "reparent",
      })
      expect(requestRenderFromLatestModel).toHaveBeenCalledTimes(1)

      controller.handleDragOver("el:target", targetDrop, makeDragEvent().event)
      vi.runAllTimers()

      expect(controller.dropHint).toEqual({
        nodeId: "el:target",
        kind: "reparent",
      })
      expect(requestRenderFromLatestModel).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it("clears the hint after deferred dragleave when hover is not re-established", () => {
    vi.useFakeTimers()

    try {
      const notify = vi.fn<(message: string) => void>()
      const requestRenderFromLatestModel = vi.fn<() => void>()
      const controller = new SidepanelDragDropController({
        notify,
        requestRenderFromLatestModel,
      })
      const targetDrop = makeDropTarget({
        targetParentPath: ["Root"],
        targetFrameId: "frame:A",
        rowScope: makeScope("frame:A", ["Root"]),
        siblingIndex: 0,
      })

      controller.startRowDrag({
        node: makeElementNode("el:A", { frameId: "frame:A" }),
        nodeFrameId: "frame:A",
        branchGroupPath: [],
        rowScope: makeScope("frame:A"),
        siblingIndex: 1,
        dragEvent: makeDragEvent().event,
      })

      controller.handleDragOver("el:target", targetDrop, makeDragEvent().event)
      expect(controller.dropHint).toEqual({
        nodeId: "el:target",
        kind: "reparent",
      })
      expect(requestRenderFromLatestModel).toHaveBeenCalledTimes(1)

      controller.handleDragLeave("el:target", false)
      expect(controller.dropHint).toEqual({
        nodeId: "el:target",
        kind: "reparent",
      })

      vi.runAllTimers()

      expect(controller.dropHintNodeId).toBeNull()
      expect(controller.dropHint).toBeNull()
      expect(requestRenderFromLatestModel).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it("applies same-scope drag-drop as reorder relative to the target row", async () => {
    const notify = vi.fn<(message: string) => void>()
    const requestRenderFromLatestModel = vi.fn<() => void>()
    const controller = new SidepanelDragDropController({
      notify,
      requestRenderFromLatestModel,
    })
    const { actions, reorderRelativeToNodeIds, reparentFromNodeIds } = makeActions()

    controller.startRowDrag({
      node: makeElementNode("el:A", { frameId: "frame:A" }),
      nodeFrameId: "frame:A",
      branchGroupPath: [],
      rowScope: makeScope("frame:A"),
      siblingIndex: 2,
      dragEvent: makeDragEvent().event,
    })

    const outcome = await controller.runDragDropMove(
      actions,
      "group:Dest",
      makeDropTarget({
        targetParentPath: ["Dest"],
        targetFrameId: "frame:A",
        rowScope: makeScope("frame:A"),
        siblingIndex: 0,
      }),
    )

    expect(reorderRelativeToNodeIds).toHaveBeenCalledWith({
      nodeIds: ["el:A"],
      anchorNodeId: "group:Dest",
      placement: "before",
      notifyOnFailure: false,
    })
    expect(reparentFromNodeIds).not.toHaveBeenCalled()
    expect(outcome).toEqual({
      status: "applied",
      effect: {
        kind: "reorder",
      },
    })
  })

  it("applies drag-drop reorder for the active structural row selection when the dragged row is included", async () => {
    const notify = vi.fn<(message: string) => void>()
    const requestRenderFromLatestModel = vi.fn<() => void>()
    const controller = new SidepanelDragDropController({
      notify,
      requestRenderFromLatestModel,
      getActiveStructuralMoveSelection: (draggedNodeId) => {
        return draggedNodeId === "el:A"
          ? {
              nodeIds: ["el:A", "el:B"],
              sourceGroupId: null,
            }
          : null
      },
    })
    const { actions, reorderRelativeToNodeIds, reparentFromNodeIds } = makeActions()

    controller.startRowDrag({
      node: makeElementNode("el:A", { frameId: "frame:A" }),
      nodeFrameId: "frame:A",
      branchGroupPath: [],
      rowScope: makeScope("frame:A"),
      siblingIndex: 0,
      dragEvent: makeDragEvent().event,
    })

    const outcome = await controller.runDragDropMove(
      actions,
      "el:C",
      makeDropTarget({
        targetParentPath: [],
        targetFrameId: "frame:A",
        rowScope: makeScope("frame:A"),
        siblingIndex: 2,
      }),
    )

    expect(reorderRelativeToNodeIds).toHaveBeenCalledWith({
      nodeIds: ["el:A", "el:B"],
      anchorNodeId: "el:C",
      placement: "after",
      notifyOnFailure: false,
    })
    expect(reparentFromNodeIds).not.toHaveBeenCalled()
    expect(outcome).toEqual({
      status: "applied",
      effect: {
        kind: "reorder",
      },
    })
  })

  it("applies drag-drop reparent and reports root destination", async () => {
    const notify = vi.fn<(message: string) => void>()
    const requestRenderFromLatestModel = vi.fn<() => void>()
    const controller = new SidepanelDragDropController({
      notify,
      requestRenderFromLatestModel,
    })
    const { actions, reparentFromNodeIds } = makeActions()

    controller.startRowDrag({
      node: makeElementNode("el:A", { frameId: "frame:A" }),
      nodeFrameId: "frame:A",
      branchGroupPath: ["Source"],
      rowScope: makeScope("frame:A", ["Source"]),
      siblingIndex: 1,
      dragEvent: makeDragEvent().event,
    })

    const outcome = await controller.runDragDropMove(
      actions,
      "frame:frame:A",
      makeDropTarget({
        targetParentPath: [],
        targetFrameId: "frame:A",
        rowScope: makeScope(null),
        siblingIndex: 0,
        rowReorderEligible: false,
      }),
    )

    expect(reparentFromNodeIds).toHaveBeenCalledWith({
      nodeIds: ["el:A"],
      sourceGroupId: null,
      targetParentPath: [],
      targetFrameId: "frame:A",
      notifyOnFailure: false,
    })
    expect(outcome).toEqual({
      status: "applied",
      effect: {
        kind: "reparent",
        destination: {
          kind: "root",
          targetFrameId: "frame:A",
        },
      },
    })
  })

  it("keeps drag identity on node.id when representative element ids differ", async () => {
    const notify = vi.fn<(message: string) => void>()
    const requestRenderFromLatestModel = vi.fn<() => void>()
    const controller = new SidepanelDragDropController({
      notify,
      requestRenderFromLatestModel,
    })
    const { actions, reparentFromNodeIds } = makeActions()
    const drag = makeDragEvent()
    const group = makeGroupNode("G", {
      frameId: "frame:A",
      elementIds: ["A", "B"],
      primaryElementId: "A",
    })

    controller.startRowDrag({
      node: group,
      nodeFrameId: "frame:A",
      branchGroupPath: [],
      rowScope: makeScope("frame:A"),
      siblingIndex: 1,
      dragEvent: drag.event,
    })

    const outcome = await controller.runDragDropMove(
      actions,
      "frame:frame:A",
      makeDropTarget({
        targetParentPath: ["Dest"],
        targetFrameId: "frame:A",
        rowScope: makeScope("frame:A", ["Other"]),
        siblingIndex: 0,
        rowReorderEligible: false,
      }),
    )

    expect(drag.setData).toHaveBeenCalledWith("text/plain", "group:G")
    expect(reparentFromNodeIds).toHaveBeenCalledWith({
      nodeIds: ["group:G"],
      sourceGroupId: "G",
      targetParentPath: ["Dest"],
      targetFrameId: "frame:A",
      notifyOnFailure: false,
    })
    expect(outcome).toEqual({
      status: "applied",
      effect: {
        kind: "reparent",
        destination: {
          kind: "preset",
          targetParentPath: ["Dest"],
          targetFrameId: "frame:A",
        },
      },
    })
  })

  it("fails closed on non-applied reorder outcomes and reports via notify", async () => {
    const notify = vi.fn<(message: string) => void>()
    const requestRenderFromLatestModel = vi.fn<() => void>()
    const controller = new SidepanelDragDropController({
      notify,
      requestRenderFromLatestModel,
    })
    const { actions, reorderRelativeToNodeIds } = makeActions({
      status: "preflightFailed",
      reason: "selection drift",
      attempts: 1,
    })

    controller.startRowDrag({
      node: makeElementNode("el:A", { frameId: "frame:A" }),
      nodeFrameId: "frame:A",
      branchGroupPath: [],
      rowScope: makeScope("frame:A"),
      siblingIndex: 2,
      dragEvent: makeDragEvent().event,
    })

    const outcome = await controller.runDragDropMove(
      actions,
      "el:target",
      makeDropTarget({
        targetParentPath: [],
        targetFrameId: "frame:A",
        rowScope: makeScope("frame:A"),
        siblingIndex: 0,
      }),
    )

    expect(outcome).toEqual({
      status: "notApplied",
    })
    expect(reorderRelativeToNodeIds).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith("Drag and drop reorder failed: selection drift")
  })

  it("fails closed on incompatible drop and reports via notify", async () => {
    const notify = vi.fn<(message: string) => void>()
    const requestRenderFromLatestModel = vi.fn<() => void>()
    const controller = new SidepanelDragDropController({
      notify,
      requestRenderFromLatestModel,
    })
    const { actions, reorderRelativeToNodeIds, reparentFromNodeIds } = makeActions()

    controller.startRowDrag({
      node: makeElementNode("el:A", { frameId: "frame:A" }),
      nodeFrameId: "frame:A",
      branchGroupPath: [],
      rowScope: makeScope("frame:A"),
      siblingIndex: 0,
      dragEvent: makeDragEvent().event,
    })

    const outcome = await controller.runDragDropMove(
      actions,
      "el:target",
      makeDropTarget({
        targetParentPath: [],
        targetFrameId: "frame:B",
        rowScope: makeScope("frame:B"),
        siblingIndex: 0,
      }),
    )

    expect(outcome).toEqual({
      status: "incompatible",
    })
    expect(reorderRelativeToNodeIds).not.toHaveBeenCalled()
    expect(reparentFromNodeIds).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith("Drop target is not compatible for this move.")
  })
})
