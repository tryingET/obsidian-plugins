import { describe, expect, it } from "vitest"

import type { LayerNode } from "../src/model/tree.js"
import {
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

const makeFreedrawBucketNode = (
  id: string,
  elementIds: readonly string[],
  label = `freedraw (${elementIds.length})`,
): LayerNode => ({
  id,
  type: "freedrawBucket",
  elementIds: [...elementIds],
  primaryElementId: elementIds[0] ?? `${id}:primary`,
  children: [],
  canExpand: false,
  isExpanded: false,
  groupId: null,
  frameId: null,
  label,
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

    const result = buildSidepanelVisibleRowTreeResult([collapsedGroup, gamma], "alpha")
    const filteredGroup = result.visibleTree[0]

    expect(result.active).toBe(true)
    expect(result.renderedRowCount).toBe(2)
    expect(result.searchableRowCount).toBe(4)
    expect(result.visibleTree.map((node) => node.id)).toEqual(["group:G"])
    expect(filteredGroup?.isExpanded).toBe(true)
    expect(filteredGroup?.canExpand).toBe(false)
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

    const collapsedResult = buildSidepanelVisibleRowTreeResult([collapsedGroup], "alpha group")
    const collapsedFilteredGroup = collapsedResult.visibleTree[0]

    expect(collapsedFilteredGroup?.canExpand).toBe(false)
    expect(collapsedFilteredGroup?.isExpanded).toBe(false)
    expect(collapsedFilteredGroup?.children).toEqual([])
    expect(collapsedResult.renderedRowCount).toBe(1)

    const expandedResult = buildSidepanelVisibleRowTreeResult(
      [
        makeGroupNode("G", [alpha, beta], {
          isExpanded: true,
          label: "Alpha Group",
        }),
      ],
      "alpha group",
    )

    expect(expandedResult.visibleTree[0]?.canExpand).toBe(false)
    expect(expandedResult.visibleTree[0]?.children).toEqual([])
    expect(expandedResult.renderedRowCount).toBe(1)
  })

  it("does not match opaque internal ids when the visible label differs", () => {
    const hiddenIdGroup = makeGroupNode("internal-group-id", [makeElementNode("A", "Alpha")], {
      isExpanded: true,
      label: "Readable label",
    })

    const result = buildSidepanelVisibleRowTreeResult([hiddenIdGroup], "internal-group-id")

    expect(result.visibleTree).toEqual([])
    expect(result.renderedRowCount).toBe(0)
  })

  it("keeps search aligned with dense-row descriptor vocabulary", () => {
    const collapsedGroup = makeGroupNode("G", [makeElementNode("A", "Alpha")], {
      isExpanded: false,
      label: "Container",
    })
    const strokes = makeFreedrawBucketNode("fd:1", ["F1", "F2"])

    expect(
      buildSidepanelVisibleRowTreeResult([collapsedGroup], "collapsed").visibleTree.map(
        (node) => node.id,
      ),
    ).toEqual(["group:G"])
    expect(
      buildSidepanelVisibleRowTreeResult([collapsedGroup], "1 items").visibleTree.map(
        (node) => node.id,
      ),
    ).toEqual(["group:G"])
    expect(
      buildSidepanelVisibleRowTreeResult([strokes], "strokes").visibleTree.map((node) => node.id),
    ).toEqual(["fd:1"])
    expect(
      buildSidepanelVisibleRowTreeResult([strokes], "freedrawbucket").visibleTree.map(
        (node) => node.id,
      ),
    ).toEqual(["fd:1"])
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
