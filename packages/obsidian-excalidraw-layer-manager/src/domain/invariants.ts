import { err, ok } from "../model/result.js"
import type { Result } from "../model/result.js"
import { type StructuralLayerNode, resolveFrameRowElementId } from "../model/tree.js"

export interface ReparentValidationInput {
  readonly sourceFrameId: string | null
  readonly targetFrameId: string | null
  readonly sourceGroupId: string | null
  readonly targetParentPath: readonly string[]
  readonly canonicalTargetParentPathKeys?: ReadonlySet<string>
  readonly structuralTree?: readonly StructuralLayerNode[]
}

const makeCanonicalTargetParentPathKey = (
  targetFrameId: string | null,
  targetParentPath: readonly string[],
): string => {
  return `${targetFrameId ?? "null"}:${targetParentPath.join("/")}`
}

export const collectCanonicalTargetParentPathKeys = (
  tree: readonly StructuralLayerNode[],
): ReadonlySet<string> => {
  const keys = new Set<string>([makeCanonicalTargetParentPathKey(null, [])])

  const walk = (
    nodes: readonly StructuralLayerNode[],
    branchContext: {
      readonly frameId: string | null
      readonly groupPath: readonly string[]
    },
  ): void => {
    for (const node of nodes) {
      const nodeFrameId = resolveFrameRowElementId(node) ?? node.frameId ?? branchContext.frameId
      keys.add(makeCanonicalTargetParentPathKey(nodeFrameId, branchContext.groupPath))

      const childGroupPath =
        node.type === "group" && node.groupId
          ? [...branchContext.groupPath, node.groupId]
          : branchContext.groupPath

      if (node.type === "group" && node.groupId) {
        keys.add(makeCanonicalTargetParentPathKey(nodeFrameId, childGroupPath))
      }

      if (node.children.length > 0) {
        walk(node.children, {
          frameId: nodeFrameId,
          groupPath: childGroupPath,
        })
      }
    }
  }

  walk(tree, {
    frameId: null,
    groupPath: [],
  })

  return keys
}

export const validateTargetParentPathSegments = (
  targetParentPath: readonly string[],
): Result<void, string> => {
  const seen = new Set<string>()

  for (const groupId of targetParentPath) {
    if (groupId.trim().length === 0) {
      return err("targetParentPath cannot contain blank group ids.")
    }

    if (seen.has(groupId)) {
      return err("targetParentPath cannot contain duplicate group ids.")
    }

    seen.add(groupId)
  }

  return ok(undefined)
}

export const validateCanonicalTargetParentPath = (
  targetFrameId: string | null,
  targetParentPath: readonly string[],
  canonicalTargetParentPathKeys?: ReadonlySet<string>,
): Result<void, string> => {
  if (!canonicalTargetParentPathKeys) {
    return ok(undefined)
  }

  if (
    !canonicalTargetParentPathKeys.has(
      makeCanonicalTargetParentPathKey(targetFrameId, targetParentPath),
    )
  ) {
    return err("Target parent path is stale or no longer exists in the structural tree.")
  }

  return ok(undefined)
}

export const validateNoCrossFrameMove = (
  sourceFrameId: string | null,
  targetFrameId: string | null,
): Result<void, string> => {
  if (sourceFrameId !== targetFrameId) {
    return err("Cross-frame moves are not supported.")
  }
  return ok(undefined)
}

export const validateNoSelfNesting = (
  sourceGroupId: string | null,
  targetParentPath: readonly string[],
): Result<void, string> => {
  if (sourceGroupId && targetParentPath.includes(sourceGroupId)) {
    return err("Cannot move a group into itself.")
  }
  return ok(undefined)
}

const collectDescendantGroupIds = (
  nodes: readonly StructuralLayerNode[],
  targetGroupId: string,
): ReadonlySet<string> => {
  const descendants = new Set<string>()

  const walk = (children: readonly StructuralLayerNode[]): boolean => {
    for (const child of children) {
      if (child.type === "group" && child.groupId === targetGroupId) {
        collectAllGroupIds(child.children, descendants)
        return true
      }
      if (child.children.length > 0 && walk(child.children)) {
        return true
      }
    }
    return false
  }

  walk(nodes)
  return descendants
}

const collectAllGroupIds = (nodes: readonly StructuralLayerNode[], out: Set<string>): void => {
  for (const node of nodes) {
    if (node.type === "group" && node.groupId) {
      out.add(node.groupId)
    }
    if (node.children.length > 0) {
      collectAllGroupIds(node.children, out)
    }
  }
}

export const validateNoDescendantCycle = (
  sourceGroupId: string | null,
  targetParentPath: readonly string[],
  structuralTree: readonly StructuralLayerNode[] | undefined,
): Result<void, string> => {
  if (!sourceGroupId || targetParentPath.length === 0 || !structuralTree) {
    return ok(undefined)
  }

  const descendantGroupIds = collectDescendantGroupIds(structuralTree, sourceGroupId)

  for (const pathGroupId of targetParentPath) {
    if (descendantGroupIds.has(pathGroupId)) {
      return err("Cannot move a group into one of its own descendants (would create a cycle).")
    }
  }

  return ok(undefined)
}

export const validateReparentInvariants = (
  input: ReparentValidationInput,
): Result<void, string> => {
  const pathCheck = validateTargetParentPathSegments(input.targetParentPath)
  if (!pathCheck.ok) {
    return pathCheck
  }

  const frameCheck = validateNoCrossFrameMove(input.sourceFrameId, input.targetFrameId)
  if (!frameCheck.ok) {
    return frameCheck
  }

  const cycleCheck = validateNoSelfNesting(input.sourceGroupId, input.targetParentPath)
  if (!cycleCheck.ok) {
    return cycleCheck
  }

  const descendantCycleCheck = validateNoDescendantCycle(
    input.sourceGroupId,
    input.targetParentPath,
    input.structuralTree,
  )
  if (!descendantCycleCheck.ok) {
    return descendantCycleCheck
  }

  const canonicalPathCheck = validateCanonicalTargetParentPath(
    input.targetFrameId,
    input.targetParentPath,
    input.canonicalTargetParentPathKeys,
  )
  if (!canonicalPathCheck.ok) {
    return canonicalPathCheck
  }

  return ok(undefined)
}
