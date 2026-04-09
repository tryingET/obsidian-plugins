import type { ElementDTO } from "../model/entities.js"
import type { SceneIndexes } from "../model/indexes.js"
import { readLmxElementLabel, readLmxGroupLabel } from "../model/lmxMetadata.js"
import {
  type LayerNode,
  type TreeBuildContext,
  resolveRepresentativeElementId,
} from "../model/tree.js"

const makeNodeId = (prefix: string, id: string): string => `${prefix}:${id}`

const normalizeLabelText = (value: string, maxLength = 24): string => {
  const normalized = value.replaceAll("\n", " ").trim()
  if (normalized.length <= maxLength) {
    return normalized
  }

  return `${normalized.slice(0, maxLength)}…`
}

const normalizeExplicitLabel = (value: string | undefined): string | null => {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

const getBoundTextContainerLabel = (element: ElementDTO, indexes: SceneIndexes): string | null => {
  if (element.type === "text") {
    return null
  }

  const boundTextEntries = indexes.boundTextByContainer.get(element.id) ?? []
  for (const entry of boundTextEntries) {
    if (entry.type !== "text" || !entry.text) {
      continue
    }

    const label = normalizeLabelText(entry.text)
    if (label.length > 0) {
      return label
    }
  }

  return null
}

const getElementLabel = (element: ElementDTO, indexes: SceneIndexes): string => {
  const metadataLabel = readLmxElementLabel(element.customData)
  if (metadataLabel) {
    return metadataLabel
  }

  const explicitName = normalizeExplicitLabel(element.name)
  if (explicitName) {
    return explicitName
  }

  const boundTextLabel = getBoundTextContainerLabel(element, indexes)
  if (boundTextLabel) {
    return boundTextLabel
  }

  if (element.type === "text" && element.text) {
    return normalizeLabelText(element.text)
  }

  return element.type
}

const isBoundTextWithExistingContainer = (element: ElementDTO, indexes: SceneIndexes): boolean => {
  return element.type === "text" && !!element.containerId && indexes.byId.has(element.containerId)
}

const getOuterGroupId = (element: ElementDTO): string | null => {
  if (element.groupIds.length === 0) {
    return null
  }
  return element.groupIds[element.groupIds.length - 1] ?? null
}

const getPathInsideOuter = (element: ElementDTO, outerGroupId: string): readonly string[] => {
  const index = element.groupIds.lastIndexOf(outerGroupId)
  if (index <= 0) {
    return []
  }

  return [...element.groupIds.slice(0, index)].reverse()
}

const appendUniqueElementIds = (
  target: string[],
  seen: Set<string>,
  values: readonly string[],
): void => {
  for (const value of values) {
    if (seen.has(value)) {
      continue
    }
    seen.add(value)
    target.push(value)
  }
}

const makeElementNode = (
  element: ElementDTO,
  indexes: SceneIndexes,
  expandedNodeIds: ReadonlySet<string>,
): LayerNode => {
  const extras = indexes.boundTextByContainer.get(element.id) ?? []
  const elementIds: string[] = []
  const seenElementIds = new Set<string>()

  appendUniqueElementIds(elementIds, seenElementIds, [element.id])
  for (const entry of extras) {
    appendUniqueElementIds(elementIds, seenElementIds, [entry.id])
  }

  const nodeId = makeNodeId("el", element.id)
  return {
    id: nodeId,
    type: "element",
    elementIds,
    primaryElementId: element.id,
    children: [],
    canExpand: false,
    isExpanded: expandedNodeIds.has(nodeId),
    groupId: null,
    frameId: element.frameId,
    label: getElementLabel(element, indexes),
  }
}

const isUngroupedFreedraw = (element: ElementDTO): boolean => {
  return element.type === "freedraw" && element.groupIds.length === 0
}

const makeFreedrawBucketNode = (elements: readonly ElementDTO[]): LayerNode => {
  const elementIds = elements.map((element) => element.id)
  const primaryElementId = elements[0]?.id ?? "freedraw"
  const frameId = elements[0]?.frameId ?? null
  const bucketId = makeNodeId("freedraw", elementIds.join("|"))

  return {
    id: bucketId,
    type: "freedrawBucket",
    elementIds,
    primaryElementId,
    children: [],
    canExpand: false,
    isExpanded: false,
    groupId: null,
    frameId,
    label: `freedraw (${elementIds.length})`,
  }
}

interface MutableGroupNode {
  readonly kind: "mutableGroup"
  readonly id: string
  readonly groupId: string
  readonly frameId: string | null
  readonly label: string
  readonly isExpanded: boolean
  readonly children: GroupChildNode[]
}

type GroupChildNode = MutableGroupNode | LayerNode

interface MutableGroupNodeInput {
  readonly id: string
  readonly groupId: string
  readonly frameId: string | null
  readonly expandedNodeIds: ReadonlySet<string>
}

const createMutableGroupNode = (input: MutableGroupNodeInput): MutableGroupNode => ({
  kind: "mutableGroup",
  id: input.id,
  groupId: input.groupId,
  frameId: input.frameId,
  label: input.groupId,
  isExpanded: input.expandedNodeIds.has(input.id),
  children: [],
})

const isMutableGroupNode = (node: GroupChildNode): node is MutableGroupNode => {
  return "kind" in node && node.kind === "mutableGroup"
}

const readGroupLabelFromMembers = (
  groupId: string,
  primaryElementId: string,
  elementIds: readonly string[],
  indexes: SceneIndexes,
): string | null => {
  const candidateIds = [primaryElementId, ...elementIds.filter((id) => id !== primaryElementId)]

  for (const elementId of candidateIds) {
    const candidate = indexes.byId.get(elementId)
    if (!candidate) {
      continue
    }

    const metadataLabel = readLmxGroupLabel(candidate.customData, groupId)
    if (metadataLabel) {
      return metadataLabel
    }
  }

  return null
}

const resolveGroupLabel = (
  defaultLabel: string,
  groupId: string,
  primaryElementId: string,
  elementIds: readonly string[],
  indexes: SceneIndexes,
): string => {
  const metadataLabel = readGroupLabelFromMembers(groupId, primaryElementId, elementIds, indexes)
  if (metadataLabel) {
    return metadataLabel
  }

  const representative = indexes.byId.get(primaryElementId)
  const fallbackName = normalizeExplicitLabel(representative?.name)
  if (fallbackName) {
    return fallbackName
  }

  return defaultLabel
}

const finalizeMutableGroupNode = (node: MutableGroupNode, indexes: SceneIndexes): LayerNode => {
  const finalizedChildren: LayerNode[] = []
  const elementIds: string[] = []
  const seenElementIds = new Set<string>()
  let primaryElementId = node.groupId

  for (const child of node.children) {
    const finalized = isMutableGroupNode(child) ? finalizeMutableGroupNode(child, indexes) : child
    finalizedChildren.push(finalized)

    if (primaryElementId === node.groupId) {
      primaryElementId = finalized.primaryElementId
    }

    appendUniqueElementIds(elementIds, seenElementIds, finalized.elementIds)
  }

  return {
    id: node.id,
    type: "group",
    elementIds,
    primaryElementId,
    children: finalizedChildren,
    canExpand: finalizedChildren.length > 0,
    isExpanded: node.isExpanded,
    groupId: node.groupId,
    frameId: node.frameId,
    label: resolveGroupLabel(node.label, node.groupId, primaryElementId, elementIds, indexes),
  }
}

const getContainerFrameId = (members: readonly ElementDTO[]): string | null => {
  let frameId: string | null | undefined

  for (const member of members) {
    if (frameId === undefined) {
      frameId = member.frameId
      continue
    }

    if (frameId !== member.frameId) {
      return null
    }
  }

  return frameId ?? null
}

const buildMaxGroupNode = (
  outerGroupId: string,
  members: readonly ElementDTO[],
  context: TreeBuildContext,
  indexes: SceneIndexes,
  zIndexById: ReadonlyMap<string, number>,
): LayerNode | null => {
  const containerFrameId = getContainerFrameId(members)
  const rootId = makeNodeId("group", outerGroupId)
  const root = createMutableGroupNode({
    id: rootId,
    groupId: outerGroupId,
    frameId: containerFrameId,
    expandedNodeIds: context.expandedNodeIds,
  })

  const groupsById = new Map<string, MutableGroupNode>()
  groupsById.set(rootId, root)

  const sortedMembers = [...members].sort((left, right) => {
    const leftZ = zIndexById.get(left.id) ?? left.zIndex
    const rightZ = zIndexById.get(right.id) ?? right.zIndex
    return rightZ - leftZ
  })

  for (const member of sortedMembers) {
    if (isBoundTextWithExistingContainer(member, indexes)) {
      continue
    }

    const pathInsideOuter = getPathInsideOuter(member, outerGroupId)
    let parent = root
    let pathPrefix = outerGroupId

    for (const groupId of pathInsideOuter) {
      pathPrefix = `${pathPrefix}/${groupId}`
      const childId = makeNodeId("group", pathPrefix)
      let child = groupsById.get(childId)

      if (!child) {
        child = createMutableGroupNode({
          id: childId,
          groupId,
          frameId: containerFrameId,
          expandedNodeIds: context.expandedNodeIds,
        })
        groupsById.set(childId, child)
        parent.children.push(child)
      }

      parent = child
    }

    parent.children.push(makeElementNode(member, indexes, context.expandedNodeIds))
  }

  const finalized = finalizeMutableGroupNode(root, indexes)
  if (finalized.elementIds.length === 0) {
    return null
  }

  return finalized
}

interface FrameBucket {
  readonly frame: ElementDTO
  readonly children: LayerNode[]
}

type TopLevelEntry =
  | {
      readonly kind: "frame"
      readonly frameId: string
    }
  | {
      readonly kind: "node"
      readonly node: LayerNode
    }

const makeFrameNode = (
  frame: ElementDTO,
  childNodes: readonly LayerNode[],
  expandedNodeIds: ReadonlySet<string>,
  indexes: SceneIndexes,
): LayerNode => {
  const nodeId = makeNodeId("frame", frame.id)
  const isExpanded = expandedNodeIds.has(nodeId)

  const elementIds = [frame.id]
  const seenElementIds = new Set<string>(elementIds)
  for (const child of childNodes) {
    appendUniqueElementIds(elementIds, seenElementIds, child.elementIds)
  }

  return {
    id: nodeId,
    type: "frame",
    elementIds,
    primaryElementId: frame.id,
    children: [...childNodes],
    canExpand: childNodes.length > 0,
    isExpanded,
    groupId: null,
    frameId: null,
    label: getElementLabel(frame, indexes),
  }
}

export const buildLayerTree = (
  context: TreeBuildContext,
  indexes: SceneIndexes,
): readonly LayerNode[] => {
  const ordered = context.elements
    .map((element, inputIndex) => ({ element, inputIndex }))
    .sort((left, right) => {
      if (left.element.zIndex === right.element.zIndex) {
        return left.inputIndex - right.inputIndex
      }
      return left.element.zIndex - right.element.zIndex
    })
    .map((entry) => entry.element)

  const zIndexById = new Map<string, number>()
  for (let index = 0; index < ordered.length; index += 1) {
    const element = ordered[index]
    if (!element) {
      continue
    }
    zIndexById.set(element.id, index)
  }

  const maxGroupByElementId = new Map<string, string>()
  const maxGroupMembers = new Map<string, ElementDTO[]>()

  for (const element of ordered) {
    if (element.type === "frame") {
      continue
    }

    const outerGroupId = getOuterGroupId(element)
    if (!outerGroupId) {
      continue
    }

    maxGroupByElementId.set(element.id, outerGroupId)

    const existingMembers = maxGroupMembers.get(outerGroupId)
    if (existingMembers) {
      existingMembers.push(element)
      continue
    }

    maxGroupMembers.set(outerGroupId, [element])
  }

  const frameBuckets = new Map<string, FrameBucket>()
  for (const element of ordered) {
    if (element.type !== "frame") {
      continue
    }

    frameBuckets.set(element.id, {
      frame: element,
      children: [],
    })
  }

  const processedIds = new Set<string>()
  const topLevelEntries: TopLevelEntry[] = []

  const placeNode = (node: LayerNode): void => {
    if (node.type === "group") {
      if (node.frameId && frameBuckets.has(node.frameId)) {
        frameBuckets.get(node.frameId)?.children.push(node)
        return
      }

      topLevelEntries.push({ kind: "node", node })
      return
    }

    const representative = indexes.byId.get(resolveRepresentativeElementId(node))
    const representativeFrameId = representative?.frameId ?? node.frameId

    if (representativeFrameId && frameBuckets.has(representativeFrameId)) {
      frameBuckets.get(representativeFrameId)?.children.push(node)
      return
    }

    topLevelEntries.push({ kind: "node", node })
  }

  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const element = ordered[index]
    if (!element || processedIds.has(element.id)) {
      continue
    }

    if (isBoundTextWithExistingContainer(element, indexes)) {
      processedIds.add(element.id)
      continue
    }

    if (element.type === "frame") {
      processedIds.add(element.id)
      if (frameBuckets.has(element.id)) {
        topLevelEntries.push({
          kind: "frame",
          frameId: element.id,
        })
      }
      continue
    }

    const outerGroupId = maxGroupByElementId.get(element.id)
    if (outerGroupId) {
      const members = maxGroupMembers.get(outerGroupId) ?? []
      for (const member of members) {
        processedIds.add(member.id)
      }

      const groupNode = buildMaxGroupNode(outerGroupId, members, context, indexes, zIndexById)
      if (groupNode) {
        placeNode(groupNode)
      }
      continue
    }

    if (context.groupFreedraw && isUngroupedFreedraw(element)) {
      const bucketMembers: ElementDTO[] = []

      for (let cursor = index; cursor >= 0; cursor -= 1) {
        const candidate = ordered[cursor]
        if (!candidate || processedIds.has(candidate.id)) {
          break
        }

        if (!isUngroupedFreedraw(candidate)) {
          break
        }

        if (candidate.frameId !== element.frameId) {
          break
        }

        bucketMembers.push(candidate)
      }

      for (const member of bucketMembers) {
        processedIds.add(member.id)
      }

      if (bucketMembers.length > 0) {
        placeNode(makeFreedrawBucketNode(bucketMembers))
      }
      continue
    }

    processedIds.add(element.id)
    placeNode(makeElementNode(element, indexes, context.expandedNodeIds))
  }

  const topLevelNodes: LayerNode[] = []
  for (const entry of topLevelEntries) {
    if (entry.kind === "frame") {
      const bucket = frameBuckets.get(entry.frameId)
      if (!bucket) {
        continue
      }

      topLevelNodes.push(
        makeFrameNode(bucket.frame, bucket.children, context.expandedNodeIds, indexes),
      )
      continue
    }

    topLevelNodes.push(entry.node)
  }

  return topLevelNodes
}
