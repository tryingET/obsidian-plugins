import type { LayerNode } from "../../../model/tree.js"

interface VisibleNodeContext {
  readonly visibleNodes: readonly LayerNode[]
  readonly parentById: ReadonlyMap<string, string | null>
}

export const resolveSelectedNodes = (
  tree: readonly LayerNode[],
  selectedElementIds: readonly string[],
): readonly LayerNode[] => {
  const byPrimaryElementId = new Map<string, LayerNode>()
  const bestByElementId = new Map<string, LayerNode>()
  const stack = [...tree]

  while (stack.length > 0) {
    const node = stack.pop()
    if (!node) {
      continue
    }

    if (!byPrimaryElementId.has(node.primaryElementId)) {
      byPrimaryElementId.set(node.primaryElementId, node)
    }

    for (const elementId of node.elementIds) {
      const currentBest = bestByElementId.get(elementId)
      if (!currentBest || node.elementIds.length < currentBest.elementIds.length) {
        bestByElementId.set(elementId, node)
      }
    }

    if (!node.isExpanded || node.children.length === 0) {
      continue
    }

    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      const child = node.children[index]
      if (child) {
        stack.push(child)
      }
    }
  }

  const seenNodeIds = new Set<string>()
  const resolved: LayerNode[] = []

  for (const selectedElementId of selectedElementIds) {
    const node = byPrimaryElementId.get(selectedElementId) ?? bestByElementId.get(selectedElementId)
    if (!node || seenNodeIds.has(node.id)) {
      continue
    }

    seenNodeIds.add(node.id)
    resolved.push(node)
  }

  return resolved
}

export const collectVisibleNodeContext = (nodes: readonly LayerNode[]): VisibleNodeContext => {
  const visibleNodes: LayerNode[] = []
  const parentById = new Map<string, string | null>()

  const walk = (nextNodes: readonly LayerNode[], parentId: string | null): void => {
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
