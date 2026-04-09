import { type LayerNode, resolveFrameRowElementId } from "../../../model/tree.js"
import type { LayerManagerUiActions } from "../../renderer.js"

export interface DragDropBranchContext {
  readonly frameId: string | null
  readonly groupPath: readonly string[]
}

interface DraggedNodeState {
  readonly nodeId: string
  readonly sourceGroupId: string | null
  readonly sourceFrameId: string | null
  readonly sourceParentPath: readonly string[]
}

export interface NodeDropTarget {
  readonly targetParentPath: readonly string[]
  readonly targetFrameId: string | null
}

export type DragDropDestination =
  | {
      readonly kind: "root"
      readonly targetFrameId: string | null
    }
  | {
      readonly kind: "preset"
      readonly targetParentPath: readonly string[]
      readonly targetFrameId: string | null
    }

type DragDropReparentOutcome =
  | {
      readonly status: "notReady"
    }
  | {
      readonly status: "incompatible"
    }
  | {
      readonly status: "notApplied"
    }
  | {
      readonly status: "applied"
      readonly destination: DragDropDestination
    }

interface SidepanelDragDropControllerHost {
  notify: (message: string) => void
  requestRenderFromLatestModel: () => void
}

interface StartRowDragInput {
  readonly node: LayerNode
  readonly nodeFrameId: string | null
  readonly branchGroupPath: readonly string[]
  readonly dragEvent: DragEvent
}

export class SidepanelDragDropController {
  readonly #host: SidepanelDragDropControllerHost
  #draggedNodeState: DraggedNodeState | null = null
  #dropHintNodeId: string | null = null

  constructor(host: SidepanelDragDropControllerHost) {
    this.#host = host
  }

  get dropHintNodeId(): string | null {
    return this.#dropHintNodeId
  }

  clear(): void {
    this.#draggedNodeState = null
    this.#dropHintNodeId = null
  }

  resolveNodeFrameId(node: LayerNode, branchContext: DragDropBranchContext): string | null {
    return resolveFrameRowElementId(node) ?? node.frameId ?? branchContext.frameId
  }

  resolveDropTargetForNode(node: LayerNode, branchContext: DragDropBranchContext): NodeDropTarget {
    const nodeFrameId = this.resolveNodeFrameId(node, branchContext)

    if (node.type === "group" && node.groupId) {
      return {
        targetParentPath: [...branchContext.groupPath, node.groupId],
        targetFrameId: nodeFrameId,
      }
    }

    if (node.type === "frame") {
      return {
        targetParentPath: [],
        targetFrameId: resolveFrameRowElementId(node),
      }
    }

    return {
      targetParentPath: [...branchContext.groupPath],
      targetFrameId: nodeFrameId,
    }
  }

  canDropDraggedNode(targetNodeId: string, dropTarget: NodeDropTarget): boolean {
    const dragged = this.#draggedNodeState
    if (!dragged) {
      return false
    }

    if (dragged.nodeId === targetNodeId) {
      return false
    }

    if (dragged.sourceFrameId !== dropTarget.targetFrameId) {
      return false
    }

    if (dragged.sourceGroupId && dropTarget.targetParentPath.includes(dragged.sourceGroupId)) {
      return false
    }

    if (
      dragged.sourceParentPath.length === dropTarget.targetParentPath.length &&
      dragged.sourceParentPath.every(
        (segment, index) => segment === dropTarget.targetParentPath[index],
      )
    ) {
      return false
    }

    return true
  }

  startRowDrag(input: StartRowDragInput): void {
    this.#draggedNodeState = {
      nodeId: input.node.id,
      sourceGroupId: input.node.type === "group" ? input.node.groupId : null,
      sourceFrameId: input.nodeFrameId,
      sourceParentPath: [...input.branchGroupPath],
    }

    if (input.dragEvent.dataTransfer) {
      input.dragEvent.dataTransfer.effectAllowed = "move"
      input.dragEvent.dataTransfer.setData("text/plain", input.node.id)
    }

    this.updateDropHint(null)
  }

  endRowDrag(): void {
    this.#draggedNodeState = null
    this.updateDropHint(null)
  }

  handleDragEnter(targetNodeId: string, dropTarget: NodeDropTarget, event: DragEvent): void {
    if (!this.canDropDraggedNode(targetNodeId, dropTarget)) {
      return
    }

    event.preventDefault()
    this.updateDropHint(targetNodeId)
  }

  handleDragOver(targetNodeId: string, dropTarget: NodeDropTarget, event: DragEvent): void {
    if (!this.canDropDraggedNode(targetNodeId, dropTarget)) {
      return
    }

    event.preventDefault()

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move"
    }

    this.updateDropHint(targetNodeId)
  }

  handleDragLeave(targetNodeId: string, relatedTargetInsideRow: boolean): void {
    if (relatedTargetInsideRow) {
      return
    }

    if (this.#dropHintNodeId === targetNodeId) {
      this.updateDropHint(null)
    }
  }

  resetDragState(): void {
    this.#draggedNodeState = null
    this.updateDropHint(null)
  }

  async runDragDropReparent(
    actions: LayerManagerUiActions,
    targetNodeId: string,
    dropTarget: NodeDropTarget,
  ): Promise<DragDropReparentOutcome> {
    const dragged = this.#draggedNodeState
    if (!dragged) {
      this.#host.notify("Drag and drop move is no longer active.")
      return {
        status: "notReady",
      }
    }

    if (!this.canDropDraggedNode(targetNodeId, dropTarget)) {
      this.#host.notify("Drop target is not compatible for this move.")
      return {
        status: "incompatible",
      }
    }

    const outcome = await actions.reparentFromNodeIds({
      nodeIds: [dragged.nodeId],
      sourceGroupId: dragged.sourceGroupId,
      targetParentPath: dropTarget.targetParentPath,
      targetFrameId: dropTarget.targetFrameId,
    })

    if (outcome.status === "plannerError") {
      this.#host.notify(`Drag and drop reparent failed: ${outcome.error}`)
      return {
        status: "notApplied",
      }
    }

    if (outcome.status !== "applied") {
      this.#host.notify(`Drag and drop reparent failed: ${outcome.reason}`)
      return {
        status: "notApplied",
      }
    }

    if (dropTarget.targetParentPath.length === 0) {
      return {
        status: "applied",
        destination: {
          kind: "root",
          targetFrameId: dropTarget.targetFrameId,
        },
      }
    }

    return {
      status: "applied",
      destination: {
        kind: "preset",
        targetParentPath: [...dropTarget.targetParentPath],
        targetFrameId: dropTarget.targetFrameId,
      },
    }
  }

  private updateDropHint(nodeId: string | null): void {
    if (this.#dropHintNodeId === nodeId) {
      return
    }

    this.#dropHintNodeId = nodeId
    this.#host.requestRenderFromLatestModel()
  }
}
