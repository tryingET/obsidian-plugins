import type { ReorderPlacement } from "../../../commands/reorderNode.js"
import { type LayerNode, resolveFrameRowElementId } from "../../../model/tree.js"
import { didInteractionApply } from "../../interactionOutcome.js"
import type { LayerManagerUiActions } from "../../renderer.js"
import type { StructuralMoveSelection } from "../selection/structuralMoveSelection.js"

export interface DragDropBranchContext {
  readonly frameId: string | null
  readonly groupPath: readonly string[]
}

interface DraggedNodeState {
  readonly nodeId: string
  readonly nodeIds: readonly string[]
  readonly sourceGroupId: string | null
  readonly sourceFrameId: string | null
  readonly sourceParentPath: readonly string[]
  readonly sourceRowScope: DragDropBranchContext
  readonly sourceSiblingRange: {
    readonly min: number
    readonly max: number
  }
  readonly sharesSingleScope: boolean
}

export interface NodeDropTarget {
  readonly targetParentPath: readonly string[]
  readonly targetFrameId: string | null
  readonly rowScope: DragDropBranchContext
  readonly siblingIndex: number
  readonly rowReorderEligible: boolean
}

export type DragDropTargetZone = "before" | "inside" | "after"

export interface DragDropIntentOptions {
  readonly zone?: DragDropTargetZone | null
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
  getActiveStructuralMoveSelection?: (draggedNodeId: string) => StructuralMoveSelection | null
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

export type DragDropHint =
  | {
      readonly nodeId: string
      readonly kind: "reorder"
      readonly placement: ReorderPlacement
    }
  | {
      readonly nodeId: string
      readonly kind: "reparent"
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
  #dropHint: DragDropHint | null = null
  #hoverDepthByNodeId = new Map<string, number>()
  #pendingDropHintClear: {
    readonly targetNodeId: string
    readonly timeoutId: ReturnType<typeof setTimeout>
  } | null = null

  constructor(host: SidepanelDragDropControllerHost) {
    this.#host = host
  }

  get dropHint(): DragDropHint | null {
    return this.#dropHint
  }

  get dropHintNodeId(): string | null {
    return this.#dropHint?.nodeId ?? null
  }

  clear(): void {
    this.#draggedNodeState = null
    this.resetHoverTracking()
    this.#dropHint = null
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

  canDropDraggedNode(
    targetNodeId: string,
    dropTarget: NodeDropTarget,
    options?: DragDropIntentOptions,
  ): boolean {
    return this.qualifyDropIntent(targetNodeId, dropTarget, options).status === "qualified"
  }

  previewDropIntent(
    targetNodeId: string,
    dropTarget: NodeDropTarget,
    options?: DragDropIntentOptions,
  ): QualifiedDropIntent | null {
    const resolution = this.qualifyDropIntent(targetNodeId, dropTarget, options)
    if (resolution.status !== "qualified") {
      return null
    }

    return resolution.intent
  }

  startRowDrag(input: StartRowDragInput): void {
    this.resetHoverTracking()

    const structuralMove = this.#host.getActiveStructuralMoveSelection?.(input.node.id) ?? null
    const draggedNodeIds = structuralMove?.nodeIds.includes(input.node.id)
      ? structuralMove.nodeIds
      : [input.node.id]

    this.#draggedNodeState = {
      nodeId: input.node.id,
      nodeIds: [...draggedNodeIds],
      sourceGroupId:
        structuralMove?.sourceGroupId ?? (input.node.type === "group" ? input.node.groupId : null),
      sourceFrameId: input.nodeFrameId,
      sourceParentPath: [...input.branchGroupPath],
      sourceRowScope: {
        frameId: input.rowScope.frameId,
        groupPath: [...input.rowScope.groupPath],
      },
      sourceSiblingRange: {
        min: input.siblingIndex,
        max: input.siblingIndex,
      },
      sharesSingleScope: true,
    }

    if (input.dragEvent.dataTransfer) {
      input.dragEvent.dataTransfer.effectAllowed = "move"
      input.dragEvent.dataTransfer.setData("text/plain", input.node.id)
    }

    this.updateDropHint(null)
  }

  endRowDrag(): void {
    this.#draggedNodeState = null
    this.resetHoverTracking()
    this.updateDropHint(null)
  }

  handleDragEnter(
    targetNodeId: string,
    dropTarget: NodeDropTarget,
    event: DragEvent,
    options?: DragDropIntentOptions,
  ): void {
    this.incrementHoverDepth(targetNodeId)
    const nextDropHint = this.resolveDropHint(targetNodeId, dropTarget, options)
    if (!nextDropHint) {
      if (this.#dropHint?.nodeId === targetNodeId) {
        this.updateDropHint(null)
      }
      return
    }

    event.preventDefault()
    this.updateDropHint(nextDropHint)
  }

  handleDragOver(
    targetNodeId: string,
    dropTarget: NodeDropTarget,
    event: DragEvent,
    options?: DragDropIntentOptions,
  ): void {
    this.ensureHoverDepth(targetNodeId)
    const nextDropHint = this.resolveDropHint(targetNodeId, dropTarget, options)
    if (!nextDropHint) {
      if (this.#dropHint?.nodeId === targetNodeId) {
        this.updateDropHint(null)
      }
      return
    }

    event.preventDefault()

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move"
    }

    this.updateDropHint(nextDropHint)
  }

  handleDragLeave(targetNodeId: string, relatedTargetInsideRow: boolean): void {
    if (relatedTargetInsideRow) {
      return
    }

    this.decrementHoverDepth(targetNodeId)

    if (this.#dropHint?.nodeId === targetNodeId) {
      this.scheduleDropHintClear(targetNodeId)
    }
  }

  resetDragState(): void {
    this.#draggedNodeState = null
    this.resetHoverTracking()
    this.updateDropHint(null)
  }

  async runDragDropMove(
    actions: LayerManagerUiActions,
    targetNodeId: string,
    dropTarget: NodeDropTarget,
    options?: DragDropIntentOptions,
  ): Promise<DragDropMoveOutcome> {
    const resolution = this.qualifyDropIntent(targetNodeId, dropTarget, options)
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
        nodeIds: dragged.nodeIds,
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
      nodeIds: dragged.nodeIds,
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
    options?: DragDropIntentOptions,
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

    if (dragged.nodeIds.includes(targetNodeId)) {
      return {
        status: "incompatible",
      }
    }

    const explicitReorderPlacement = this.resolveExplicitReorderPlacement(
      dragged,
      resolvedDropTarget,
      options,
    )
    if (explicitReorderPlacement) {
      return {
        status: "qualified",
        dragged,
        dropTarget: resolvedDropTarget,
        intent: {
          kind: "reorder",
          placement: explicitReorderPlacement,
        },
      }
    }

    if (
      options?.zone !== "inside" &&
      resolvedDropTarget.rowReorderEligible &&
      dragged.sharesSingleScope &&
      haveSameScope(dragged.sourceRowScope, resolvedDropTarget.rowScope)
    ) {
      return {
        status: "qualified",
        dragged,
        dropTarget: resolvedDropTarget,
        intent: {
          kind: "reorder",
          placement:
            resolvedDropTarget.siblingIndex < dragged.sourceSiblingRange.min ? "before" : "after",
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

  private resolveExplicitReorderPlacement(
    dragged: DraggedNodeState,
    dropTarget: NodeDropTarget,
    options?: DragDropIntentOptions,
  ): ReorderPlacement | null {
    if (options?.zone !== "before" && options?.zone !== "after") {
      return null
    }

    if (!dropTarget.rowReorderEligible || !dragged.sharesSingleScope) {
      return null
    }

    if (!haveSameScope(dragged.sourceRowScope, dropTarget.rowScope)) {
      return null
    }

    return options.zone === "before" ? "before" : "after"
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

    const positions: StructuralNodePosition[] = []
    for (const nodeId of dragged.nodeIds) {
      const position = resolveStructuralNodePosition(
        structuralTree,
        nodeId,
        {
          frameId: null,
          groupPath: [],
        },
        (node, branchContext) => this.resolveNodeFrameId(node, branchContext),
      )

      if (!position) {
        return null
      }

      positions.push(position)
    }

    const primaryPosition =
      positions.find((position) => position.node.id === dragged.nodeId) ?? positions[0] ?? null
    if (!primaryPosition) {
      return null
    }

    const sourceRowScope: DragDropBranchContext = {
      frameId: primaryPosition.branchContext.frameId,
      groupPath: [...primaryPosition.branchContext.groupPath],
    }
    const sharesSingleScope = positions.every(
      (position) =>
        position.nodeFrameId === primaryPosition.nodeFrameId &&
        haveSameScope(
          {
            frameId: position.branchContext.frameId,
            groupPath: position.branchContext.groupPath,
          },
          sourceRowScope,
        ),
    )

    const sourceSiblingRange = sharesSingleScope
      ? {
          min: Math.min(...positions.map((position) => position.siblingIndex)),
          max: Math.max(...positions.map((position) => position.siblingIndex)),
        }
      : {
          min: primaryPosition.siblingIndex,
          max: primaryPosition.siblingIndex,
        }

    return {
      nodeId: primaryPosition.node.id,
      nodeIds: [...dragged.nodeIds],
      sourceGroupId: dragged.sourceGroupId,
      sourceFrameId: primaryPosition.nodeFrameId,
      sourceParentPath: [...primaryPosition.branchContext.groupPath],
      sourceRowScope,
      sourceSiblingRange,
      sharesSingleScope,
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

  private resolveDropHint(
    targetNodeId: string,
    dropTarget: NodeDropTarget,
    options?: DragDropIntentOptions,
  ): DragDropHint | null {
    const preview = this.previewDropIntent(targetNodeId, dropTarget, options)
    if (!preview) {
      return null
    }

    if (preview.kind === "reorder") {
      return {
        nodeId: targetNodeId,
        kind: "reorder",
        placement: preview.placement,
      }
    }

    return {
      nodeId: targetNodeId,
      kind: "reparent",
    }
  }

  private incrementHoverDepth(targetNodeId: string): void {
    this.cancelPendingDropHintClear(targetNodeId)
    this.#hoverDepthByNodeId.set(targetNodeId, 1)
  }

  private ensureHoverDepth(targetNodeId: string): void {
    this.cancelPendingDropHintClear(targetNodeId)

    if ((this.#hoverDepthByNodeId.get(targetNodeId) ?? 0) === 0) {
      this.#hoverDepthByNodeId.set(targetNodeId, 1)
    }
  }

  private decrementHoverDepth(targetNodeId: string): void {
    this.#hoverDepthByNodeId.delete(targetNodeId)
  }

  private scheduleDropHintClear(targetNodeId: string): void {
    this.cancelPendingDropHintClear(targetNodeId)

    this.#pendingDropHintClear = {
      targetNodeId,
      timeoutId: setTimeout(() => {
        if (this.#pendingDropHintClear?.targetNodeId !== targetNodeId) {
          return
        }

        this.#pendingDropHintClear = null

        if ((this.#hoverDepthByNodeId.get(targetNodeId) ?? 0) > 0) {
          return
        }

        if (this.#dropHint?.nodeId !== targetNodeId) {
          return
        }

        this.updateDropHint(null)
      }, 0),
    }
  }

  private cancelPendingDropHintClear(targetNodeId?: string): void {
    if (!this.#pendingDropHintClear) {
      return
    }

    if (targetNodeId && this.#pendingDropHintClear.targetNodeId !== targetNodeId) {
      return
    }

    clearTimeout(this.#pendingDropHintClear.timeoutId)
    this.#pendingDropHintClear = null
  }

  private resetHoverTracking(): void {
    this.cancelPendingDropHintClear()
    this.#hoverDepthByNodeId.clear()
  }

  private updateDropHint(nextDropHint: DragDropHint | null): void {
    if (
      this.#dropHint?.nodeId === nextDropHint?.nodeId &&
      this.#dropHint?.kind === nextDropHint?.kind &&
      (this.#dropHint?.kind !== "reorder" ||
        nextDropHint?.kind !== "reorder" ||
        this.#dropHint.placement === nextDropHint.placement)
    ) {
      return
    }

    this.#dropHint = nextDropHint
    this.#host.requestRenderFromLatestModel()
  }
}
