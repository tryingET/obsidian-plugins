import type { LayerNode } from "../../../model/tree.js"

export type SidepanelFilterMatchKind = "none" | "self" | "descendant"
export type SidepanelVisibilityState = "visible" | "hidden" | "mixed"
export type SidepanelLockState = "unlocked" | "locked" | "mixed"

export interface SidepanelRowVisualState {
  readonly visibility: SidepanelVisibilityState
  readonly lock: SidepanelLockState
}

export type SidepanelRowBadgeEmphasis =
  | "default"
  | "match"
  | "type"
  | "structure"
  | "visibility"
  | "lock"

export interface SidepanelRowBadgeDescriptor {
  readonly text: string
  readonly emphasis: SidepanelRowBadgeEmphasis
}

interface BuildSidepanelRowDescriptorsInput {
  readonly node: LayerNode
  readonly nodeVisualState?: SidepanelRowVisualState
  readonly filterMatchKind?: SidepanelFilterMatchKind
}

export interface SidepanelRowDescriptors {
  readonly typeBadge: SidepanelRowBadgeDescriptor
  readonly metaBadges: readonly SidepanelRowBadgeDescriptor[]
  readonly ariaLabel: string
  readonly searchText: string
  readonly expandButtonLabel: string | null
}

const DEFAULT_VISUAL_STATE: SidepanelRowVisualState = {
  visibility: "visible",
  lock: "unlocked",
}

const normalizeSearchFragment = (value: string): string => {
  return value
    .replace(/[\[\]·]/g, " ")
    .trim()
    .toLowerCase()
}

export const resolveSidepanelTypeBadgeLabel = (node: LayerNode): string => {
  if (node.type === "freedrawBucket") {
    return "[strokes]"
  }

  return `[${node.type}]`
}

const resolveStructureBadgeDescriptor = (node: LayerNode): SidepanelRowBadgeDescriptor | null => {
  if (node.type !== "group" && node.type !== "frame") {
    return null
  }

  if (node.canExpand && !node.isExpanded) {
    return {
      text: "collapsed",
      emphasis: "structure",
    }
  }

  if (node.children.length > 0) {
    return {
      text: node.children.length === 1 ? "1 child row" : `${node.children.length} child rows`,
      emphasis: "structure",
    }
  }

  return null
}

const resolveCountBadgeDescriptor = (node: LayerNode): SidepanelRowBadgeDescriptor | null => {
  if (node.type === "freedrawBucket") {
    return {
      text: `${node.elementIds.length} strokes`,
      emphasis: "default",
    }
  }

  if (node.type === "group" || node.type === "frame") {
    return {
      text: `${node.elementIds.length} items`,
      emphasis: "default",
    }
  }

  if (node.elementIds.length > 1) {
    return {
      text: `${node.elementIds.length} linked`,
      emphasis: "default",
    }
  }

  return null
}

const resolveFilterMatchBadgeDescriptor = (
  filterMatchKind: SidepanelFilterMatchKind,
): SidepanelRowBadgeDescriptor | null => {
  if (filterMatchKind === "self") {
    return {
      text: "match",
      emphasis: "match",
    }
  }

  if (filterMatchKind === "descendant") {
    return {
      text: "nested match",
      emphasis: "match",
    }
  }

  return null
}

const resolveVisibilityBadgeDescriptor = (
  state: SidepanelRowVisualState,
): SidepanelRowBadgeDescriptor | null => {
  if (state.visibility === "hidden") {
    return {
      text: "hidden",
      emphasis: "visibility",
    }
  }

  if (state.visibility === "mixed") {
    return {
      text: "some hidden",
      emphasis: "visibility",
    }
  }

  return null
}

const resolveLockBadgeDescriptor = (
  state: SidepanelRowVisualState,
): SidepanelRowBadgeDescriptor | null => {
  if (state.lock === "locked") {
    return {
      text: "locked",
      emphasis: "lock",
    }
  }

  if (state.lock === "mixed") {
    return {
      text: "some locked",
      emphasis: "lock",
    }
  }

  return null
}

const resolveExpandButtonLabel = (node: LayerNode): string | null => {
  if (!node.canExpand) {
    return null
  }

  return `${node.isExpanded ? "Collapse" : "Expand"} row ${node.label}`
}

const collectMetaBadges = (
  node: LayerNode,
  state: SidepanelRowVisualState,
  filterMatchKind: SidepanelFilterMatchKind,
): readonly SidepanelRowBadgeDescriptor[] => {
  return [
    resolveStructureBadgeDescriptor(node),
    resolveCountBadgeDescriptor(node),
    resolveFilterMatchBadgeDescriptor(filterMatchKind),
    resolveVisibilityBadgeDescriptor(state),
    resolveLockBadgeDescriptor(state),
  ].filter((badge): badge is SidepanelRowBadgeDescriptor => badge !== null)
}

export const buildSidepanelRowSearchText = (node: LayerNode): string => {
  return buildSidepanelRowDescriptors({ node }).searchText
}

export const buildSidepanelRowDescriptors = (
  input: BuildSidepanelRowDescriptorsInput,
): SidepanelRowDescriptors => {
  const state = input.nodeVisualState ?? DEFAULT_VISUAL_STATE
  const filterMatchKind = input.filterMatchKind ?? "none"
  const typeBadge: SidepanelRowBadgeDescriptor = {
    text: resolveSidepanelTypeBadgeLabel(input.node),
    emphasis: "type",
  }
  const metaBadges = collectMetaBadges(input.node, state, filterMatchKind)
  const ariaParts = [
    `${typeBadge.text} ${input.node.label}`,
    ...metaBadges.map((badge) => badge.text),
  ]
  const searchFragments = [
    input.node.label,
    input.node.type,
    typeBadge.text,
    ...metaBadges.map((badge) => badge.text),
  ].map(normalizeSearchFragment)

  return {
    typeBadge,
    metaBadges,
    ariaLabel: ariaParts.join(" · "),
    searchText: searchFragments.filter((fragment) => fragment.length > 0).join(" "),
    expandButtonLabel: resolveExpandButtonLabel(input.node),
  }
}
