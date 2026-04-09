import { describe, expect, it } from "vitest"

import type { LayerNode } from "../src/model/tree.js"
import {
  buildSidepanelRowFilterResult,
  buildSidepanelVisibleRowTreeResult,
  resolveSidepanelRowVisualState,
} from "../src/ui/sidepanel/render/rowModel.js"

const makeElementNode = (elementId: string, label = elementId): LayerNode => ({
  id: `el:${elementId}`,
  type: "element",
  elementIds: [elementId],
  primaryElementId: elementId,
  children: [],
  canExpand: false,
  isExpanded: false,
  groupId: null,
  frameId: null,
  label,
})

const makeGroupNode = (
  groupId: string,
  children: readonly LayerNode[],
  options?: {
    readonly isExpanded?: boolean
    readonly label?: string
  },
): LayerNode => ({
  id: `group:${groupId}`,
  type: "group",
  elementIds: children.flatMap((child) => child.elementIds),
  primaryElementId: children[0]?.primaryElementId ?? `group:${groupId}`,
  children,
  canExpand: children.length > 0,
  isExpanded: options?.isExpanded ?? false,
  groupId,
  frameId: null,
  label: options?.label ?? groupId,
})

describe("sidepanel row model helpers", () => {
  it("derives mixed visibility and lock states from represented elements", () => {
    const node = makeGroupNode("G", [makeElementNode("A"), makeElementNode("B")])

    const state = resolveSidepanelRowVisualState(
      node,
      new Map([
        [
          "A",
          {
            opacity: 0,
            locked: true,
          },
        ],
        [
          "B",
          {
            opacity: 100,
            locked: false,
          },
        ],
      ]),
    )

    expect(state).toEqual({
      visibility: "mixed",
      lock: "mixed",
    })
  })

  it("filters into collapsed descendants while retaining ancestor context", () => {
    const alpha = makeElementNode("A", "Alpha")
    const beta = makeElementNode("B", "Beta")
    const collapsedGroup = makeGroupNode("G", [alpha, beta], {
      isExpanded: false,
      label: "Container",
    })
    const gamma = makeElementNode("C", "Gamma")

    const result = buildSidepanelRowFilterResult([collapsedGroup, gamma], "alpha")
    const filteredGroup = result.tree[0]

    expect(result.active).toBe(true)
    expect(result.renderedRowCount).toBe(2)
    expect(result.searchableRowCount).toBe(4)
    expect(result.tree.map((node) => node.id)).toEqual(["group:G"])
    expect(filteredGroup?.isExpanded).toBe(true)
    expect(filteredGroup?.canExpand).toBe(true)
    expect(filteredGroup?.children.map((node) => node.id)).toEqual(["el:A"])
    expect(result.matchKindByNodeId.get("group:G")).toBe("descendant")
    expect(result.matchKindByNodeId.get("el:A")).toBe("self")
    expect(result.matchKindByNodeId.has("el:B")).toBe(false)
    expect(result.matchKindByNodeId.has("el:C")).toBe(false)
  })

  it("keeps self-matching containers expansion-invariant during filtering without dumping unrelated descendants", () => {
    const alpha = makeElementNode("A", "Alpha")
    const beta = makeElementNode("B", "Beta")
    const collapsedGroup = makeGroupNode("G", [alpha, beta], {
      isExpanded: false,
      label: "Alpha Group",
    })

    const collapsedResult = buildSidepanelRowFilterResult([collapsedGroup], "alpha group")
    const collapsedFilteredGroup = collapsedResult.tree[0]

    expect(collapsedFilteredGroup?.canExpand).toBe(true)
    expect(collapsedFilteredGroup?.isExpanded).toBe(false)
    expect(collapsedFilteredGroup?.children).toEqual([])
    expect(collapsedResult.renderedRowCount).toBe(1)

    const expandedResult = buildSidepanelRowFilterResult(
      [
        makeGroupNode("G", [alpha, beta], {
          isExpanded: true,
          label: "Alpha Group",
        }),
      ],
      "alpha group",
    )

    expect(expandedResult.tree[0]?.children).toEqual([])
    expect(expandedResult.renderedRowCount).toBe(1)
  })

  it("does not match opaque internal ids when the visible label differs", () => {
    const hiddenIdGroup = makeGroupNode("internal-group-id", [makeElementNode("A", "Alpha")], {
      isExpanded: true,
      label: "Readable label",
    })

    const result = buildSidepanelRowFilterResult([hiddenIdGroup], "internal-group-id")

    expect(result.tree).toEqual([])
    expect(result.renderedRowCount).toBe(0)
  })

  it("derives visible rows from expansion state when filter query is blank", () => {
    const alpha = makeElementNode("A", "Alpha")
    const beta = makeElementNode("B", "Beta")
    const collapsedGroup = makeGroupNode("G", [alpha, beta], {
      isExpanded: false,
      label: "Container",
    })

    const result = buildSidepanelVisibleRowTreeResult([collapsedGroup], "   ")

    expect(result.active).toBe(false)
    expect(result.renderedRowCount).toBe(1)
    expect(result.searchableRowCount).toBe(3)
    expect(result.visibleTree.map((node) => node.id)).toEqual(["group:G"])
    expect(result.visibleTree[0]?.canExpand).toBe(true)
    expect(result.visibleTree[0]?.isExpanded).toBe(false)
    expect(result.visibleTree[0]?.children).toEqual([])
    expect(collapsedGroup.children.map((node) => node.id)).toEqual(["el:A", "el:B"])
  })
})
