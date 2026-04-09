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
  getLatestStructuralTree?: () => readonly LayerNode[] | null
}

interface StartRowDragInput {
  readonly node: LayerNode
  readonly nodeFrameId: string | null
  readonly branchGroupPath: readonly string[]
  readonly rowScope: DragDropBranchContext
  readonly siblingIndex: number
  readonly dragEvent: DragEvent
}

interface StructuralNodePosition {
  readonly node: LayerNode
  readonly branchContext: DragDropBranchContext
  readonly siblingIndex: number
  readonly nodeFrameId: string | null
}

type QualifiedDropResolution =
  | {
      readonly status: "notReady"
    }
  | {
      readonly status: "incompatible"
    }
  | {
      readonly status: "qualified"
      readonly dragged: DraggedNodeState
      readonly dropTarget: NodeDropTarget
      readonly intent: QualifiedDropIntent
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

const resolveStructuralNodePosition = (
  nodes: readonly LayerNode[],
  targetNodeId: string,
  branchContext: DragDropBranchContext,
  resolveNodeFrameId: (node: LayerNode, branchContext: DragDropBranchContext) => string | null,
): StructuralNodePosition | null => {
  for (const [siblingIndex, node] of nodes.entries()) {
    const nodeFrameId = resolveNodeFrameId(node, branchContext)
    if (node.id === targetNodeId) {
      return {
        node,
        branchContext,
        siblingIndex,
        nodeFrameId,
      }
    }

    if (node.children.length === 0) {
      continue
    }

    const childBranchContext: DragDropBranchContext = {
      frameId: nodeFrameId,
      groupPath:
        node.type === "group" && node.groupId
          ? [...branchContext.groupPath, node.groupId]
          : branchContext.groupPath,
    }

    const nestedMatch = resolveStructuralNodePosition(
      node.children,
      targetNodeId,
      childBranchContext,
      resolveNodeFrameId,
    )
    if (nestedMatch) {
      return nestedMatch
    }
  }

  return null
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
    return this.qualifyDropIntent(targetNodeId, dropTarget).status === "qualified"
  }

  previewDropIntent(targetNodeId: string, dropTarget: NodeDropTarget): QualifiedDropIntent | null {
    const resolution = this.qualifyDropIntent(targetNodeId, dropTarget)
    if (resolution.status !== "qualified") {
      return null
    }

    return resolution.intent
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
    const resolution = this.qualifyDropIntent(targetNodeId, dropTarget)
    if (resolution.status !== "qualified") {
      this.#host.notify(
        resolution.status === "notReady"
          ? "Drag and drop move is no longer active."
          : "Drop target is not compatible for this move.",
      )
      return {
        status: resolution.status === "notReady" ? "notReady" : "incompatible",
      }
    }

    const { dragged, intent, dropTarget: resolvedDropTarget } = resolution

    if (intent.kind === "reorder") {
      const outcome = await actions.reorderRelativeToNodeIds({
        nodeIds: [dragged.nodeId],
        anchorNodeId: targetNodeId,
        placement: intent.placement,
        notifyOnFailure: false,
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
      targetParentPath: resolvedDropTarget.targetParentPath,
      targetFrameId: resolvedDropTarget.targetFrameId,
      notifyOnFailure: false,
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

    if (resolvedDropTarget.targetParentPath.length === 0) {
      return {
        status: "applied",
        effect: {
          kind: "reparent",
          destination: {
            kind: "root",
            targetFrameId: resolvedDropTarget.targetFrameId,
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
          targetParentPath: [...resolvedDropTarget.targetParentPath],
          targetFrameId: resolvedDropTarget.targetFrameId,
        },
      },
    }
  }

  private qualifyDropIntent(
    targetNodeId: string,
    dropTarget: NodeDropTarget,
  ): QualifiedDropResolution {
    const dragged = this.resolveCurrentDraggedNodeState()
    if (!dragged) {
      return {
        status: "notReady",
      }
    }

    const resolvedDropTarget = this.resolveCurrentDropTarget(targetNodeId, dropTarget)
    if (!resolvedDropTarget) {
      return {
        status: "incompatible",
      }
    }

    if (dragged.nodeId === targetNodeId) {
      return {
        status: "incompatible",
      }
    }

    if (
      resolvedDropTarget.rowReorderEligible &&
      haveSameScope(dragged.sourceRowScope, resolvedDropTarget.rowScope)
    ) {
      return {
        status: "qualified",
        dragged,
        dropTarget: resolvedDropTarget,
        intent: {
          kind: "reorder",
          placement:
            resolvedDropTarget.siblingIndex < dragged.sourceSiblingIndex ? "before" : "after",
        },
      }
    }

    if (dragged.sourceFrameId !== resolvedDropTarget.targetFrameId) {
      return {
        status: "incompatible",
      }
    }

    if (
      dragged.sourceGroupId &&
      resolvedDropTarget.targetParentPath.includes(dragged.sourceGroupId)
    ) {
      return {
        status: "incompatible",
      }
    }

    if (haveSamePath(dragged.sourceParentPath, resolvedDropTarget.targetParentPath)) {
      return {
        status: "incompatible",
      }
    }

    return {
      status: "qualified",
      dragged,
      dropTarget: resolvedDropTarget,
      intent: {
        kind: "reparent",
      },
    }
  }

  private resolveCurrentDraggedNodeState(): DraggedNodeState | null {
    const dragged = this.#draggedNodeState
    if (!dragged) {
      return null
    }

    const structuralTree = this.#host.getLatestStructuralTree?.() ?? null
    if (!structuralTree) {
      return dragged
    }

    const position = resolveStructuralNodePosition(
      structuralTree,
      dragged.nodeId,
      {
        frameId: null,
        groupPath: [],
      },
      (node, branchContext) => this.resolveNodeFrameId(node, branchContext),
    )
    if (!position) {
      return null
    }

    return {
      nodeId: position.node.id,
      sourceGroupId: position.node.type === "group" ? position.node.groupId : null,
      sourceFrameId: position.nodeFrameId,
      sourceParentPath: [...position.branchContext.groupPath],
      sourceRowScope: {
        frameId: position.branchContext.frameId,
        groupPath: [...position.branchContext.groupPath],
      },
      sourceSiblingIndex: position.siblingIndex,
    }
  }

  private resolveCurrentDropTarget(
    targetNodeId: string,
    fallbackDropTarget: NodeDropTarget,
  ): NodeDropTarget | null {
    const structuralTree = this.#host.getLatestStructuralTree?.() ?? null
    if (!structuralTree) {
      return fallbackDropTarget
    }

    const position = resolveStructuralNodePosition(
      structuralTree,
      targetNodeId,
      {
        frameId: null,
        groupPath: [],
      },
      (node, branchContext) => this.resolveNodeFrameId(node, branchContext),
    )
    if (!position) {
      return null
    }

    return this.resolveDropTargetForNode(
      position.node,
      position.branchContext,
      position.siblingIndex,
    )
  }

  private updateDropHint(nodeId: string | null): void {
    if (this.#dropHintNodeId === nodeId) {
      return
    }

    this.#dropHintNodeId = nodeId
    this.#host.requestRenderFromLatestModel()
  }
}
