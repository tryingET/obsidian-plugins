import { describe, expect, it } from "vitest"

import type { LayerNode } from "../src/model/tree.js"
import {
  collectVisibleNodeContext,
  resolveSelectedNodes,
} from "../src/ui/sidepanel/selection/nodeContext.js"
import {
  appendUniqueIds,
  collectUniqueSelectionIds,
  haveSameIdsInSameOrder,
} from "../src/ui/sidepanel/selection/selectionIds.js"

const makeElementNode = (elementId: string): LayerNode => ({
  id: `el:${elementId}`,
  type: "element",
  elementIds: [elementId],
  primaryElementId: elementId,
  children: [],
  canExpand: false,
  isExpanded: false,
  groupId: null,
  frameId: null,
  label: elementId,
})

const makeGroupNode = (
  groupId: string,
  children: readonly LayerNode[],
  options?: {
    readonly isExpanded?: boolean
    readonly primaryElementId?: string
    readonly frameId?: string | null
  },
): LayerNode => ({
  id: `group:${groupId}`,
  type: "group",
  elementIds: children.flatMap((child) => child.elementIds),
  primaryElementId:
    options?.primaryElementId ?? children[0]?.primaryElementId ?? `group:${groupId}`,
  children,
  canExpand: true,
  isExpanded: options?.isExpanded ?? true,
  groupId,
  frameId: options?.frameId ?? null,
  label: groupId,
})

describe("sidepanel selection helpers", () => {
  it("dedupes selection IDs with stable first-seen order", () => {
    const result = collectUniqueSelectionIds([
      { id: "A" },
      { id: "B" },
      { id: "A" },
      { id: "C" },
      { id: "B" },
    ])

    expect(result).toEqual(["A", "B", "C"])
  })

  it("compares ID arrays by exact order", () => {
    expect(haveSameIdsInSameOrder(["A", "B"], ["A", "B"])).toBe(true)
    expect(haveSameIdsInSameOrder(["A", "B"], ["B", "A"])).toBe(false)
    expect(haveSameIdsInSameOrder(["A"], ["A", "B"])).toBe(false)
  })

  it("appends IDs uniquely while preserving existing items", () => {
    const target = ["A"]
    const seen = new Set<string>(target)

    appendUniqueIds(target, seen, ["A", "B", "B", "C"])

    expect(target).toEqual(["A", "B", "C"])
  })

  it("resolves selected nodes to the most specific matching node and dedupes node IDs", () => {
    const nodeA = makeElementNode("A")
    const nodeB = makeElementNode("B")
    const group = makeGroupNode("G", [nodeA, nodeB], {
      primaryElementId: "group-primary:G",
      isExpanded: true,
    })

    const resolved = resolveSelectedNodes([group], ["A", "A", "B"])

    expect(resolved.map((node) => node.id)).toEqual(["el:A", "el:B"])
  })

  it("resolves selections against the full tree even when descendants are collapsed", () => {
    const hiddenChild = makeElementNode("A")
    const collapsedGroup = makeGroupNode("G", [hiddenChild], {
      isExpanded: false,
      primaryElementId: "group-primary:G",
    })

    const resolved = resolveSelectedNodes([collapsedGroup], ["A"])

    expect(resolved.map((node) => node.id)).toEqual(["el:A"])
  })

  it("collects visible node context with correct parent mapping", () => {
    const nodeA = makeElementNode("A")
    const nodeHiddenChild = makeElementNode("H")
    const collapsedInner = makeGroupNode("inner", [nodeHiddenChild], {
      isExpanded: false,
      primaryElementId: "group-primary:inner",
    })
    const group = makeGroupNode("G", [nodeA, collapsedInner], {
      isExpanded: true,
      primaryElementId: "group-primary:G",
    })
    const rootElement = makeElementNode("R")

    const context = collectVisibleNodeContext([group, rootElement])

    expect(context.visibleNodes.map((node) => node.id)).toEqual([
      "group:G",
      "el:A",
      "group:inner",
      "el:R",
    ])
    expect(context.parentById.get("group:G")).toBeNull()
    expect(context.parentById.get("el:A")).toBe("group:G")
    expect(context.parentById.get("group:inner")).toBe("group:G")
    expect(context.parentById.get("el:R")).toBeNull()
    expect(context.parentById.has("el:H")).toBe(false)
  })
})
