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
    readonly groupIds?: readonly string[]
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
  },
): LayerNode => ({
  id: `group:${groupId}`,
  type: "group",
  elementIds: [`el:${groupId}`],
  primaryElementId: `el:${groupId}`,
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

const makeActions = () => {
  const reparentFromNodeIds = vi.fn(async () => ({ status: "applied", attempts: 1 as const }))

  return {
    actions: {
      reparentFromNodeIds,
    } as unknown as LayerManagerUiActions,
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

    const branch: DragDropBranchContext = {
      frameId: "frame:A",
      groupPath: ["Outer"],
    }

    const group = makeGroupNode("G")
    const frame = makeFrameNode("frame:B")
    const element = makeElementNode("el:A")

    expect(controller.resolveNodeFrameId(group, branch)).toBe("frame:A")
    expect(controller.resolveNodeFrameId(frame, branch)).toBe("frame:B")

    expect(controller.resolveDropTargetForNode(group, branch)).toEqual({
      targetParentPath: ["Outer", "G"],
      targetFrameId: "frame:A",
    })
    expect(controller.resolveDropTargetForNode(frame, branch)).toEqual({
      targetParentPath: [],
      targetFrameId: "frame:B",
    })
    expect(controller.resolveDropTargetForNode(element, branch)).toEqual({
      targetParentPath: ["Outer"],
      targetFrameId: "frame:A",
    })
  })

  it("enforces drag-drop compatibility rules", () => {
    const notify = vi.fn<(message: string) => void>()
    const requestRenderFromLatestModel = vi.fn<() => void>()
    const controller = new SidepanelDragDropController({
      notify,
      requestRenderFromLatestModel,
    })

    const drag = makeDragEvent()
    controller.startRowDrag({
      node: makeGroupNode("G", { frameId: "frame:A" }),
      nodeFrameId: "frame:A",
      branchGroupPath: [],
      dragEvent: drag.event,
    })

    expect(
      controller.canDropDraggedNode("group:G", {
        targetParentPath: [],
        targetFrameId: "frame:A",
      }),
    ).toBe(false)

    expect(
      controller.canDropDraggedNode("el:target", {
        targetParentPath: [],
        targetFrameId: "frame:B",
      }),
    ).toBe(false)

    expect(
      controller.canDropDraggedNode("el:target", {
        targetParentPath: ["Root", "G"],
        targetFrameId: "frame:A",
      }),
    ).toBe(false)

    expect(
      controller.canDropDraggedNode("el:target", {
        targetParentPath: ["Root"],
        targetFrameId: "frame:A",
      }),
    ).toBe(true)
  })

  it("tracks drop hints across drag lifecycle events", () => {
    const notify = vi.fn<(message: string) => void>()
    const requestRenderFromLatestModel = vi.fn<() => void>()
    const controller = new SidepanelDragDropController({
      notify,
      requestRenderFromLatestModel,
    })

    const drag = makeDragEvent()
    const targetDrop: NodeDropTarget = {
      targetParentPath: ["Root"],
      targetFrameId: "frame:A",
    }

    controller.startRowDrag({
      node: makeElementNode("el:A", { frameId: "frame:A" }),
      nodeFrameId: "frame:A",
      branchGroupPath: [],
      dragEvent: drag.event,
    })

    expect(controller.dropHintNodeId).toBe("el:A")

    const dragEnter = makeDragEvent()
    controller.handleDragEnter("el:target", targetDrop, dragEnter.event)
    expect(controller.dropHintNodeId).toBe("el:target")
    expect(dragEnter.preventDefault).toHaveBeenCalledTimes(1)

    controller.handleDragLeave("el:target", false)
    expect(controller.dropHintNodeId).toBeNull()

    controller.endRowDrag()
    expect(controller.dropHintNodeId).toBeNull()
    expect(requestRenderFromLatestModel).toHaveBeenCalled()
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
      dragEvent: makeDragEvent().event,
    })

    const outcome = await controller.runDragDropReparent(actions, "el:target", {
      targetParentPath: [],
      targetFrameId: "frame:A",
    })

    expect(reparentFromNodeIds).toHaveBeenCalledWith({
      nodeIds: ["el:A"],
      sourceGroupId: "Source",
      targetParentPath: [],
      targetFrameId: "frame:A",
    })
    expect(outcome).toEqual({
      status: "applied",
      destination: {
        kind: "root",
      },
    })
  })

  it("fails closed on incompatible drop and reports via notify", async () => {
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
      branchGroupPath: [],
      dragEvent: makeDragEvent().event,
    })

    const outcome = await controller.runDragDropReparent(actions, "el:target", {
      targetParentPath: [],
      targetFrameId: "frame:B",
    })

    expect(outcome).toEqual({
      status: "incompatible",
    })
    expect(reparentFromNodeIds).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith("Drop target is not compatible for this move.")
  })
})
