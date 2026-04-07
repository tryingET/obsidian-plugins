import { describe, expect, it } from "vitest"

import type { LayerNode } from "../src/model/tree.js"
import { renderSidepanelRowTree } from "../src/ui/sidepanel/render/rowTreeRenderer.js"

const makeElementNode = (id: string, frameId: string | null = null): LayerNode => ({
  id: `el:${id}`,
  type: "element",
  elementIds: [id],
  primaryElementId: id,
  children: [],
  canExpand: false,
  isExpanded: false,
  groupId: null,
  frameId,
  label: id,
})

const makeGroupNode = (
  groupId: string,
  children: readonly LayerNode[],
  isExpanded = true,
): LayerNode => ({
  id: `group:${groupId}`,
  type: "group",
  elementIds: children.flatMap((child) => child.elementIds),
  primaryElementId: children[0]?.primaryElementId ?? `group-primary:${groupId}`,
  children,
  canExpand: true,
  isExpanded,
  groupId,
  frameId: null,
  label: groupId,
})

const makeFrameNode = (frameId: string, children: readonly LayerNode[]): LayerNode => ({
  id: `frame:${frameId}`,
  type: "frame",
  elementIds: [frameId, ...children.flatMap((child) => child.elementIds)],
  primaryElementId: frameId,
  children,
  canExpand: true,
  isExpanded: true,
  groupId: null,
  frameId: frameId,
  label: frameId,
})

interface TraversalSignature {
  readonly nodeId: string
  readonly depth: number
  readonly branchFrameId: string | null
  readonly branchGroupPath: readonly string[]
  readonly nodeFrameId: string | null
  readonly childFrameId: string | null
  readonly childGroupPath: readonly string[]
}

const collectTraversalSignatures = (nodes: readonly LayerNode[]): readonly TraversalSignature[] => {
  const signatures: TraversalSignature[] = []

  renderSidepanelRowTree({
    nodes,
    depth: 0,
    branchContext: {
      frameId: null,
      groupPath: [],
    },
    resolveNodeFrameId: (node, branchContext) => {
      if (node.type === "frame") {
        return node.primaryElementId
      }

      return node.frameId ?? branchContext.frameId
    },
    visitNode: ({ node, depth, branchContext, nodeFrameId, childBranchContext }) => {
      signatures.push({
        nodeId: node.id,
        depth,
        branchFrameId: branchContext.frameId,
        branchGroupPath: [...branchContext.groupPath],
        nodeFrameId,
        childFrameId: childBranchContext.frameId,
        childGroupPath: [...childBranchContext.groupPath],
      })
    },
  })

  return signatures
}

describe("sidepanel row-tree renderer", () => {
  it("traverses visible rows in deterministic pre-order with depth + branch context propagation", () => {
    const tree: readonly LayerNode[] = [
      makeFrameNode("F", [
        makeGroupNode("G1", [makeElementNode("A")], true),
        makeGroupNode("G2", [makeElementNode("B")], false),
      ]),
      makeElementNode("C"),
    ]

    const traversal = collectTraversalSignatures(tree)

    expect(traversal).toEqual([
      {
        nodeId: "frame:F",
        depth: 0,
        branchFrameId: null,
        branchGroupPath: [],
        nodeFrameId: "F",
        childFrameId: "F",
        childGroupPath: [],
      },
      {
        nodeId: "group:G1",
        depth: 1,
        branchFrameId: "F",
        branchGroupPath: [],
        nodeFrameId: "F",
        childFrameId: "F",
        childGroupPath: ["G1"],
      },
      {
        nodeId: "el:A",
        depth: 2,
        branchFrameId: "F",
        branchGroupPath: ["G1"],
        nodeFrameId: "F",
        childFrameId: "F",
        childGroupPath: ["G1"],
      },
      {
        nodeId: "group:G2",
        depth: 1,
        branchFrameId: "F",
        branchGroupPath: [],
        nodeFrameId: "F",
        childFrameId: "F",
        childGroupPath: ["G2"],
      },
      {
        nodeId: "el:C",
        depth: 0,
        branchFrameId: null,
        branchGroupPath: [],
        nodeFrameId: null,
        childFrameId: null,
        childGroupPath: [],
      },
    ])
  })

  it("produces identical traversal output across repeated runs", () => {
    const tree: readonly LayerNode[] = [
      makeGroupNode("Outer", [makeElementNode("A"), makeElementNode("B")], true),
      makeElementNode("C"),
    ]

    const first = collectTraversalSignatures(tree)
    const second = collectTraversalSignatures(tree)

    expect(second).toEqual(first)
  })
})
