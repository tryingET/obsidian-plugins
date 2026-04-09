import type { StructuralLayerNode, VisibleRowNode } from "../../../model/tree.js"

interface VisibleNodeContext {
  readonly visibleNodes: readonly VisibleRowNode[]
  readonly parentById: ReadonlyMap<string, string | null>
}

interface SelectedNodeCandidate {
  readonly node: StructuralLayerNode
  readonly depth: number
}

const isMoreSpecificCandidate = (
  candidate: StructuralLayerNode,
  candidateDepth: number,
  current: SelectedNodeCandidate,
): boolean => {
  if (candidate.elementIds.length !== current.node.elementIds.length) {
    return candidate.elementIds.length < current.node.elementIds.length
  }

  if (candidateDepth !== current.depth) {
    return candidateDepth > current.depth
  }

  return candidate.children.length < current.node.children.length
}

export const resolveSelectedNodes = (
  tree: readonly StructuralLayerNode[],
  selectedElementIds: readonly string[],
): readonly StructuralLayerNode[] => {
  const bestByElementId = new Map<string, SelectedNodeCandidate>()
  const stack = tree.map((node) => ({ node, depth: 0 }))

  while (stack.length > 0) {
    const next = stack.pop()
    if (!next) {
      continue
    }

    const { node, depth } = next

    for (const elementId of node.elementIds) {
      const currentBest = bestByElementId.get(elementId)
      if (!currentBest || isMoreSpecificCandidate(node, depth, currentBest)) {
        bestByElementId.set(elementId, { node, depth })
      }
    }

    // Selection command authority must resolve against the full tree, not only the
    // currently expanded/visible projection. Representative element ids are not row
    // identities; we resolve host element selection to the most specific structural row
    // that owns each selected element.
    if (node.children.length === 0) {
      continue
    }

    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      const child = node.children[index]
      if (child) {
        stack.push({ node: child, depth: depth + 1 })
      }
    }
  }

  const seenNodeIds = new Set<string>()
  const resolved: StructuralLayerNode[] = []

  for (const selectedElementId of selectedElementIds) {
    const node = bestByElementId.get(selectedElementId)?.node
    if (!node || seenNodeIds.has(node.id)) {
      continue
    }

    seenNodeIds.add(node.id)
    resolved.push(node)
  }

  return resolved
}

export const collectVisibleNodeContext = (nodes: readonly VisibleRowNode[]): VisibleNodeContext => {
  const visibleNodes: VisibleRowNode[] = []
  const parentById = new Map<string, string | null>()

  const walk = (nextNodes: readonly VisibleRowNode[], parentId: string | null): void => {
    for (const node of nextNodes) {
      visibleNodes.push(node)
      parentById.set(node.id, parentId)

      if (node.isExpanded && node.children.length > 0) {
        walk(node.children, node.id)
      }
    }
  }

  walk(nodes, null)

  return {
    visibleNodes,
    parentById,
  }
}
