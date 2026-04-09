import type { VisibleRowNode } from "../../../model/tree.js"

interface SidepanelRowTreeBranchContext {
  readonly frameId: string | null
  readonly groupPath: readonly string[]
}

interface SidepanelRowTreeVisitInput {
  readonly node: VisibleRowNode
  readonly depth: number
  readonly branchContext: SidepanelRowTreeBranchContext
  readonly siblingIndex: number
  readonly nodeFrameId: string | null
  readonly childBranchContext: SidepanelRowTreeBranchContext
}

interface SidepanelRowTreeRenderInput {
  readonly nodes: readonly VisibleRowNode[]
  readonly depth: number
  readonly branchContext: SidepanelRowTreeBranchContext
  readonly resolveNodeFrameId: (
    node: VisibleRowNode,
    branchContext: SidepanelRowTreeBranchContext,
  ) => string | null
  readonly visitNode: (input: SidepanelRowTreeVisitInput) => void
}

const hasVisibleChildren = (node: VisibleRowNode): boolean => {
  return node.isExpanded && node.children.length > 0
}

export const renderSidepanelRowTree = (input: SidepanelRowTreeRenderInput): void => {
  for (const [siblingIndex, node] of input.nodes.entries()) {
    const nodeFrameId = input.resolveNodeFrameId(node, input.branchContext)

    const childBranchContext: SidepanelRowTreeBranchContext = {
      frameId: nodeFrameId,
      groupPath:
        node.type === "group" && node.groupId
          ? [...input.branchContext.groupPath, node.groupId]
          : input.branchContext.groupPath,
    }

    input.visitNode({
      node,
      depth: input.depth,
      branchContext: input.branchContext,
      siblingIndex,
      nodeFrameId,
      childBranchContext,
    })

    if (!hasVisibleChildren(node)) {
      continue
    }

    renderSidepanelRowTree({
      ...input,
      nodes: node.children,
      depth: input.depth + 1,
      branchContext: childBranchContext,
    })
  }
}
