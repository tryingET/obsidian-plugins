import { describe, expect, it } from "vitest"

import type { LayerNode } from "../src/model/tree.js"
import {
  buildSidepanelRowFilterResult,
  buildSidepanelVisibleRowTreeResult,
} from "../src/ui/sidepanel/render/rowModel.js"
import {
  makeSidepanelSelectionNodeRef,
  resolveSidepanelSelection,
} from "../src/ui/sidepanel/selection/selectionResolution.js"

const makeElementNode = (
  elementId: string,
  options?: {
    readonly frameId?: string | null
    readonly label?: string
  },
): LayerNode => ({
  id: `el:${elementId}`,
  type: "element",
  elementIds: [elementId],
  primaryElementId: elementId,
  children: [],
  canExpand: false,
  isExpanded: false,
  groupId: null,
  frameId: options?.frameId ?? null,
  label: options?.label ?? elementId,
})

const makeGroupNode = (
  groupId: string,
  children: readonly LayerNode[],
  options?: {
    readonly frameId?: string | null
    readonly isExpanded?: boolean
    readonly label?: string
    readonly primaryElementId?: string
  },
): LayerNode => ({
  id: `group:${groupId}`,
  type: "group",
  elementIds: children.flatMap((child) => child.elementIds),
  primaryElementId:
    options?.primaryElementId ?? children[0]?.primaryElementId ?? `group:${groupId}`,
  children,
  canExpand: children.length > 0,
  isExpanded: options?.isExpanded ?? true,
  groupId,
  frameId: options?.frameId ?? null,
  label: options?.label ?? groupId,
})

describe("sidepanel selection resolution", () => {
  it("gives explicit row intent precedence over element-derived row resolution", () => {
    const nodeA = makeElementNode("A", { frameId: "Frame-A" })
    const nodeB = makeElementNode("B", { frameId: "Frame-A" })
    const group = makeGroupNode("G", [nodeA, nodeB], {
      frameId: "Frame-A",
      isExpanded: false,
      primaryElementId: "A",
    })

    const explicitResolution = resolveSidepanelSelection({
      tree: [group],
      selectedElementIds: ["A", "B"],
      selectionOverride: {
        elementIds: ["A", "B"],
        nodeRefs: [makeSidepanelSelectionNodeRef(group)],
      },
    })

    expect(explicitResolution.explicitSelectedNodes?.map((node) => node.id)).toEqual(["group:G"])
    expect(explicitResolution.selection.nodes.map((node) => node.id)).toEqual(["group:G"])
    expect(explicitResolution.selection.structuralMove).toEqual({
      nodeIds: ["group:G"],
      sourceGroupId: "G",
    })
    expect(explicitResolution.selection.frameResolution).toEqual({
      ok: true,
      frameId: "Frame-A",
    })

    const elementDerivedResolution = resolveSidepanelSelection({
      tree: [group],
      selectedElementIds: ["A", "B"],
      selectionOverride: null,
    })

    expect(elementDerivedResolution.explicitSelectedNodes).toBeNull()
    expect(elementDerivedResolution.selection.nodes.map((node) => node.id)).toEqual([
      "el:A",
      "el:B",
    ])
    expect(elementDerivedResolution.selection.structuralMove).toBeNull()
  })

  it("fails soft to full-tree element ownership when explicit row refs drift", () => {
    const nodeA = makeElementNode("A", { frameId: "Frame-A" })
    const group = makeGroupNode("G", [nodeA], {
      frameId: "Frame-A",
      isExpanded: false,
      primaryElementId: "A",
    })

    const result = resolveSidepanelSelection({
      tree: [group],
      selectedElementIds: ["A"],
      selectionOverride: {
        elementIds: ["A"],
        nodeRefs: [{ kind: "groupId", groupId: "missing-group" }],
      },
    })

    expect(result.explicitSelectedNodes).toBeNull()
    expect(result.selection.nodes.map((node) => node.id)).toEqual(["el:A"])
    expect(result.selection.structuralMove).toBeNull()
  })

  it("resolves selected rows from the full tree even when the filtered visible tree hides them", () => {
    const hiddenChild = makeElementNode("A", {
      frameId: "Frame-A",
      label: "Target child",
    })
    const collapsedGroup = makeGroupNode("G", [hiddenChild], {
      frameId: "Frame-A",
      isExpanded: false,
      label: "Group Alpha",
      primaryElementId: "A",
    })

    const filteredVisibleTree = buildSidepanelRowFilterResult([collapsedGroup], "group alpha").tree

    expect(filteredVisibleTree.map((node) => node.id)).toEqual(["group:G"])
    expect(filteredVisibleTree[0]?.children).toEqual([])

    const result = resolveSidepanelSelection({
      tree: [collapsedGroup],
      selectedElementIds: ["A"],
      selectionOverride: null,
    })

    expect(result.selection.nodes.map((node) => node.id)).toEqual(["el:A"])
    expect(result.selection.structuralMove).toBeNull()
  })

  it("changes visible row projection without changing structural target resolution", () => {
    const nestedLeaf = makeElementNode("A", {
      frameId: "Frame-A",
      label: "Nested leaf",
    })
    const nestedGroup = makeGroupNode("inner", [nestedLeaf], {
      frameId: "Frame-A",
      isExpanded: false,
      label: "Inner target",
      primaryElementId: "A",
    })
    const collapsedGroup = makeGroupNode("outer", [nestedGroup], {
      frameId: "Frame-A",
      isExpanded: false,
      label: "Outer group",
      primaryElementId: "A",
    })

    const collapsedVisibleTree = buildSidepanelVisibleRowTreeResult(
      [collapsedGroup],
      "",
    ).visibleTree
    const filteredVisibleTree = buildSidepanelVisibleRowTreeResult(
      [collapsedGroup],
      "inner target",
    ).visibleTree

    expect(collapsedVisibleTree.map((node) => node.id)).toEqual(["group:outer"])
    expect(collapsedVisibleTree[0]?.children).toEqual([])
    expect(filteredVisibleTree.map((node) => node.id)).toEqual(["group:outer"])
    expect(filteredVisibleTree[0]?.children.map((node) => node.id)).toEqual(["group:inner"])
    expect(filteredVisibleTree[0]?.isExpanded).toBe(true)

    const result = resolveSidepanelSelection({
      tree: [collapsedGroup],
      selectedElementIds: ["A"],
      selectionOverride: null,
    })

    expect(result.selection.nodes.map((node) => node.id)).toEqual(["el:A"])
    expect(result.selection.frameResolution).toEqual({
      ok: true,
      frameId: "Frame-A",
    })
    expect(result.selection.structuralMove).toBeNull()
  })
})
