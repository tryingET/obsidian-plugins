import type { ReorderPlacement } from "../../../commands/reorderNode.js"
import { type LayerNode, resolveFrameRowElementId } from "../../../model/tree.js"
import { didInteractionApply } from "../../interactionOutcome.js"
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
  readonly sourceRowScope: DragDropBranchContext
  readonly sourceSiblingIndex: number
}

export interface NodeDropTarget {
  readonly targetParentPath: readonly string[]
  readonly targetFrameId: string | null
  readonly rowScope: DragDropBranchContext
  readonly siblingIndex: number
  readonly rowReorderEligible: boolean
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

type QualifiedDropIntent =
  | {
      readonly kind: "reparent"
    }
  | {
      readonly kind: "reorder"
      readonly placement: ReorderPlacement
    }

type DragDropMoveOutcome =
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
      readonly effect:
        | {
            readonly kind: "reorder"
          }
        | {
            readonly kind: "reparent"
            readonly destination: DragDropDestination
          }
    }

interface SidepanelDragDropControllerHost {
  notify: (message: string) => void
  requestRenderFromLatestModel: () => void
}

interface StartRowDragInput {
  readonly node: LayerNode
  readonly nodeFrameId: string | null
  readonly branchGroupPath: readonly string[]
  readonly rowScope: DragDropBranchContext
  readonly siblingIndex: number
  readonly dragEvent: DragEvent
}

const haveSamePath = (left: readonly string[], right: readonly string[]): boolean => {
  if (left.length !== right.length) {
    return false
  }

  return left.every((segment, index) => segment === right[index])
}

const haveSameScope = (left: DragDropBranchContext, right: DragDropBranchContext): boolean => {
  return left.frameId === right.frameId && haveSamePath(left.groupPath, right.groupPath)
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

  resolveDropTargetForNode(
    node: LayerNode,
    branchContext: DragDropBranchContext,
    siblingIndex: number,
  ): NodeDropTarget {
    const nodeFrameId = this.resolveNodeFrameId(node, branchContext)

    if (node.type === "group" && node.groupId) {
      return {
        targetParentPath: [...branchContext.groupPath, node.groupId],
        targetFrameId: nodeFrameId,
        rowScope: {
          frameId: branchContext.frameId,
          groupPath: [...branchContext.groupPath],
        },
        siblingIndex,
        rowReorderEligible: true,
      }
    }

    if (node.type === "frame") {
      return {
        targetParentPath: [],
        targetFrameId: resolveFrameRowElementId(node),
        rowScope: {
          frameId: branchContext.frameId,
          groupPath: [...branchContext.groupPath],
        },
        siblingIndex,
        rowReorderEligible: false,
      }
    }

    return {
      targetParentPath: [...branchContext.groupPath],
      targetFrameId: nodeFrameId,
      rowScope: {
        frameId: branchContext.frameId,
        groupPath: [...branchContext.groupPath],
      },
      siblingIndex,
      rowReorderEligible: true,
    }
  }

  canDropDraggedNode(targetNodeId: string, dropTarget: NodeDropTarget): boolean {
    return this.previewDropIntent(targetNodeId, dropTarget) !== null
  }

  previewDropIntent(targetNodeId: string, dropTarget: NodeDropTarget): QualifiedDropIntent | null {
    const dragged = this.#draggedNodeState
    if (!dragged) {
      return null
    }

    if (dragged.nodeId === targetNodeId) {
      return null
    }

    if (
      dropTarget.rowReorderEligible &&
      haveSameScope(dragged.sourceRowScope, dropTarget.rowScope)
    ) {
      return {
        kind: "reorder",
        placement: dropTarget.siblingIndex < dragged.sourceSiblingIndex ? "before" : "after",
      }
    }

    if (dragged.sourceFrameId !== dropTarget.targetFrameId) {
      return null
    }

    if (dragged.sourceGroupId && dropTarget.targetParentPath.includes(dragged.sourceGroupId)) {
      return null
    }

    if (haveSamePath(dragged.sourceParentPath, dropTarget.targetParentPath)) {
      return null
    }

    return {
      kind: "reparent",
    }
  }

  startRowDrag(input: StartRowDragInput): void {
    this.#draggedNodeState = {
      nodeId: input.node.id,
      sourceGroupId: input.node.type === "group" ? input.node.groupId : null,
      sourceFrameId: input.nodeFrameId,
      sourceParentPath: [...input.branchGroupPath],
      sourceRowScope: {
        frameId: input.rowScope.frameId,
        groupPath: [...input.rowScope.groupPath],
      },
      sourceSiblingIndex: input.siblingIndex,
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

  async runDragDropMove(
    actions: LayerManagerUiActions,
    targetNodeId: string,
    dropTarget: NodeDropTarget,
  ): Promise<DragDropMoveOutcome> {
    const dragged = this.#draggedNodeState
    if (!dragged) {
      this.#host.notify("Drag and drop move is no longer active.")
      return {
        status: "notReady",
      }
    }

    const intent = this.previewDropIntent(targetNodeId, dropTarget)
    if (!intent) {
      this.#host.notify("Drop target is not compatible for this move.")
      return {
        status: "incompatible",
      }
    }

    if (intent.kind === "reorder") {
      const outcome = await actions.reorderRelativeToNodeIds({
        nodeIds: [dragged.nodeId],
        anchorNodeId: targetNodeId,
        placement: intent.placement,
      })

      if (outcome.status === "plannerError") {
        this.#host.notify(`Drag and drop reorder failed: ${outcome.error}`)
        return {
          status: "notApplied",
        }
      }

      if (!didInteractionApply(outcome)) {
        this.#host.notify(`Drag and drop reorder failed: ${outcome.reason}`)
        return {
          status: "notApplied",
        }
      }

      return {
        status: "applied",
        effect: {
          kind: "reorder",
        },
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

    if (!didInteractionApply(outcome)) {
      this.#host.notify(`Drag and drop reparent failed: ${outcome.reason}`)
      return {
        status: "notApplied",
      }
    }

    if (dropTarget.targetParentPath.length === 0) {
      return {
        status: "applied",
        effect: {
          kind: "reparent",
          destination: {
            kind: "root",
            targetFrameId: dropTarget.targetFrameId,
          },
        },
      }
    }

    return {
      status: "applied",
      effect: {
        kind: "reparent",
        destination: {
          kind: "preset",
          targetParentPath: [...dropTarget.targetParentPath],
          targetFrameId: dropTarget.targetFrameId,
        },
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
