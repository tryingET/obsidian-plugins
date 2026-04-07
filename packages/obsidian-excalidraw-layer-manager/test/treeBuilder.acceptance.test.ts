import { describe, expect, it } from "vitest"

import { buildLayerTree } from "../src/domain/treeBuilder.js"
import type { ElementDTO } from "../src/model/entities.js"
import { buildSceneIndexes } from "../src/model/indexes.js"
import type { LayerNode } from "../src/model/tree.js"
import { makeElement, makeSnapshot } from "./testFixtures.js"

interface BuildTreeOptions {
  readonly expandedNodeIds?: readonly string[]
  readonly groupFreedraw?: boolean
}

const elementNodeId = (id: string): string => `el:${id}`
const groupNodeId = (path: string): string => `group:${path}`
const frameNodeId = (id: string): string => `frame:${id}`

const buildTree = (
  elements: readonly ElementDTO[],
  options: BuildTreeOptions = {},
): readonly LayerNode[] => {
  const snapshot = makeSnapshot(elements)
  const indexes = buildSceneIndexes(snapshot)

  return buildLayerTree(
    {
      elements,
      expandedNodeIds: new Set(options.expandedNodeIds ?? []),
      groupFreedraw: options.groupFreedraw ?? true,
    },
    indexes,
  )
}

const findNodeById = (nodes: readonly LayerNode[], nodeId: string): LayerNode | undefined => {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return node
    }

    const nested = findNodeById(node.children, nodeId)
    if (nested) {
      return nested
    }
  }

  return undefined
}

describe("buildLayerTree acceptance matrix", () => {
  it("A01 — plain ungrouped elements", () => {
    const tree = buildTree([
      makeElement({ id: "a", zIndex: 0 }),
      makeElement({ id: "b", zIndex: 1 }),
      makeElement({ id: "c", zIndex: 2 }),
    ])

    expect(tree.map((node) => node.id)).toEqual([
      elementNodeId("c"),
      elementNodeId("b"),
      elementNodeId("a"),
    ])
  })

  it("A02 — frame containment", () => {
    const tree = buildTree(
      [
        makeElement({ id: "F", type: "frame", zIndex: 0 }),
        makeElement({ id: "A", zIndex: 1, frameId: "F" }),
        makeElement({ id: "B", zIndex: 2, frameId: "F" }),
      ],
      {
        expandedNodeIds: [frameNodeId("F")],
      },
    )

    expect(tree).toHaveLength(1)
    expect(tree[0]?.type).toBe("frame")
    expect(tree[0]?.id).toBe(frameNodeId("F"))
    expect(tree[0]?.children.map((child) => child.id)).toEqual([
      elementNodeId("B"),
      elementNodeId("A"),
    ])
  })

  it("A03 — bound text merged", () => {
    const tree = buildTree([
      makeElement({ id: "S", type: "rectangle", zIndex: 0 }),
      makeElement({
        id: "T",
        type: "text",
        zIndex: 1,
        containerId: "S",
        text: "Renamed from canvas",
      }),
    ])

    expect(tree).toHaveLength(1)
    expect(tree[0]?.id).toBe(elementNodeId("S"))
    expect(tree[0]?.elementIds).toEqual(["S", "T"])
    expect(tree[0]?.label).toBe("Renamed from canvas")
    expect(findNodeById(tree, elementNodeId("T"))).toBeUndefined()
  })

  it("A04 — orphan bound text visible", () => {
    const tree = buildTree([
      makeElement({ id: "T", type: "text", zIndex: 0, containerId: "missing" }),
    ])

    expect(tree).toHaveLength(1)
    expect(tree[0]?.id).toBe(elementNodeId("T"))
    expect(tree[0]?.elementIds).toEqual(["T"])
  })

  it("A05 — simple group", () => {
    const tree = buildTree(
      [
        makeElement({ id: "A", zIndex: 0, groupIds: ["G"] }),
        makeElement({ id: "B", zIndex: 1, groupIds: ["G"] }),
      ],
      {
        expandedNodeIds: [groupNodeId("G")],
      },
    )

    expect(tree).toHaveLength(1)
    expect(tree[0]?.type).toBe("group")
    expect(tree[0]?.id).toBe(groupNodeId("G"))
    expect(tree[0]?.label).toBe("G")
    expect(tree[0]?.children.map((child) => child.id)).toEqual([
      elementNodeId("B"),
      elementNodeId("A"),
    ])
  })

  it("A05b — group label follows representative explicit name", () => {
    const tree = buildTree(
      [
        makeElement({ id: "A", zIndex: 0, groupIds: ["G"] }),
        makeElement({ id: "B", zIndex: 1, groupIds: ["G"], name: "Renamed group" }),
      ],
      {
        expandedNodeIds: [groupNodeId("G")],
      },
    )

    expect(tree).toHaveLength(1)
    expect(tree[0]?.type).toBe("group")
    expect(tree[0]?.id).toBe(groupNodeId("G"))
    expect(tree[0]?.label).toBe("Renamed group")
    expect(tree[0]?.primaryElementId).toBe("B")
  })

  it("A06 — nested groups under one outer group", () => {
    const tree = buildTree(
      [
        makeElement({ id: "A", zIndex: 1, groupIds: ["inner", "outer"] }),
        makeElement({ id: "B", zIndex: 2, groupIds: ["outer"] }),
      ],
      {
        expandedNodeIds: [groupNodeId("outer"), groupNodeId("outer/inner")],
      },
    )

    expect(tree).toHaveLength(1)
    expect(tree[0]?.id).toBe(groupNodeId("outer"))

    const outer = tree[0]
    expect(
      outer?.children.some((child) => child.type === "group" && child.groupId === "inner"),
    ).toBe(true)
    expect(
      outer?.children.some((child) => child.type === "element" && child.primaryElementId === "B"),
    ).toBe(true)

    const inner = findNodeById(tree, groupNodeId("outer/inner"))
    expect(inner?.children.map((child) => child.primaryElementId)).toEqual(["A"])
  })

  it("A07 — grouped elements not duplicated", () => {
    const tree = buildTree(
      [
        makeElement({ id: "A", zIndex: 0, groupIds: ["G"] }),
        makeElement({ id: "B", zIndex: 1, groupIds: ["G"] }),
        makeElement({ id: "C", zIndex: 2 }),
      ],
      {
        expandedNodeIds: [groupNodeId("G")],
      },
    )

    expect(tree.map((node) => node.id)).toEqual([elementNodeId("C"), groupNodeId("G")])
    expect(tree.some((node) => node.id === elementNodeId("A"))).toBe(false)
    expect(tree.some((node) => node.id === elementNodeId("B"))).toBe(false)
  })

  it("A08 — group inside frame", () => {
    const tree = buildTree(
      [
        makeElement({ id: "F", type: "frame", zIndex: 0 }),
        makeElement({ id: "A", zIndex: 1, frameId: "F", groupIds: ["G"] }),
        makeElement({ id: "B", zIndex: 2, frameId: "F", groupIds: ["G"] }),
      ],
      {
        expandedNodeIds: [frameNodeId("F"), groupNodeId("G")],
      },
    )

    expect(tree).toHaveLength(1)
    expect(tree[0]?.id).toBe(frameNodeId("F"))
    expect(tree[0]?.children).toHaveLength(1)
    expect(tree[0]?.children[0]?.id).toBe(groupNodeId("G"))
    expect(tree.some((node) => node.id === groupNodeId("G"))).toBe(false)
  })

  it("A09 — mixed-frame max group", () => {
    const tree = buildTree(
      [
        makeElement({ id: "F1", type: "frame", zIndex: 0 }),
        makeElement({ id: "F2", type: "frame", zIndex: 1 }),
        makeElement({ id: "A", zIndex: 2, frameId: "F1", groupIds: ["G"] }),
        makeElement({ id: "B", zIndex: 3, frameId: "F2", groupIds: ["G"] }),
      ],
      {
        expandedNodeIds: [frameNodeId("F1"), frameNodeId("F2"), groupNodeId("G")],
      },
    )

    const mixedGroup = tree.find((node) => node.id === groupNodeId("G"))
    expect(mixedGroup).toBeDefined()
    expect(mixedGroup?.frameId).toBeNull()

    const frameNodes = tree.filter((node) => node.type === "frame")
    for (const frameNode of frameNodes) {
      expect(frameNode.children.some((child) => child.id === groupNodeId("G"))).toBe(false)
    }
  })

  it("A10 — freedraw bucket enabled", () => {
    const tree = buildTree([
      makeElement({ id: "A", type: "freedraw", zIndex: 0 }),
      makeElement({ id: "B", type: "freedraw", zIndex: 1 }),
      makeElement({ id: "C", type: "freedraw", zIndex: 2 }),
    ])

    expect(tree).toHaveLength(1)
    expect(tree[0]?.type).toBe("freedrawBucket")
    expect(tree[0]?.elementIds).toEqual(["C", "B", "A"])
  })

  it("A11 — freedraw bucket disabled", () => {
    const tree = buildTree(
      [
        makeElement({ id: "A", type: "freedraw", zIndex: 0 }),
        makeElement({ id: "B", type: "freedraw", zIndex: 1 }),
        makeElement({ id: "C", type: "freedraw", zIndex: 2 }),
      ],
      {
        groupFreedraw: false,
      },
    )

    expect(tree.map((node) => node.id)).toEqual([
      elementNodeId("C"),
      elementNodeId("B"),
      elementNodeId("A"),
    ])
    expect(tree.every((node) => node.type === "element")).toBe(true)
  })

  it("A12 — collapse behavior", () => {
    const tree = buildTree([
      makeElement({ id: "A", zIndex: 0, groupIds: ["G"] }),
      makeElement({ id: "B", zIndex: 1, groupIds: ["G"] }),
    ])

    expect(tree).toHaveLength(1)
    expect(tree[0]?.id).toBe(groupNodeId("G"))
    expect(tree[0]?.isExpanded).toBe(false)
    expect(tree[0]?.canExpand).toBe(true)
    expect(tree[0]?.children).toHaveLength(0)
  })

  it("A13 — deterministic rebuild", () => {
    const elements = [
      makeElement({ id: "F", type: "frame", zIndex: 0 }),
      makeElement({ id: "S", zIndex: 1, frameId: "F" }),
      makeElement({ id: "T", type: "text", zIndex: 2, frameId: "F", containerId: "S" }),
      makeElement({ id: "A", zIndex: 3, frameId: "F", groupIds: ["inner", "outer"] }),
      makeElement({ id: "B", zIndex: 4, frameId: "F", groupIds: ["outer"] }),
      makeElement({ id: "D", zIndex: 5, type: "freedraw" }),
      makeElement({ id: "E", zIndex: 6, type: "freedraw" }),
      makeElement({ id: "C", zIndex: 7 }),
    ]

    const options: BuildTreeOptions = {
      expandedNodeIds: [frameNodeId("F"), groupNodeId("outer"), groupNodeId("outer/inner")],
      groupFreedraw: true,
    }

    const first = buildTree(elements, options)
    const second = buildTree(elements, options)

    expect(first).toEqual(second)
  })

  it("A14 — scale smoke", () => {
    const elements: ElementDTO[] = []
    let activeFrameId: string | null = null
    let lastRectangleId: string | null = null

    for (let index = 0; index < 2000; index += 1) {
      if (index % 250 === 0) {
        activeFrameId = `frame-${index}`
        elements.push(
          makeElement({
            id: activeFrameId,
            type: "frame",
            zIndex: index,
          }),
        )
        continue
      }

      if (index % 9 === 0 && lastRectangleId) {
        elements.push(
          makeElement({
            id: `text-${index}`,
            type: "text",
            zIndex: index,
            frameId: activeFrameId,
            containerId: lastRectangleId,
          }),
        )
        continue
      }

      const groupIds =
        index % 11 === 0
          ? [`inner-${Math.floor(index / 22)}`, `outer-${Math.floor(index / 110)}`]
          : index % 13 === 0
            ? [`outer-${Math.floor(index / 110)}`]
            : []

      const type = index % 7 === 0 ? "freedraw" : "rectangle"
      const id = type === "freedraw" ? `stroke-${index}` : `shape-${index}`

      elements.push(
        makeElement({
          id,
          type,
          zIndex: index,
          frameId: activeFrameId,
          groupIds,
        }),
      )

      if (type === "rectangle") {
        lastRectangleId = id
      }
    }

    const first = buildTree(elements, { groupFreedraw: true })
    const second = buildTree(elements, { groupFreedraw: true })

    const coveredIds = new Set(first.flatMap((node) => node.elementIds))

    expect(first.length).toBeGreaterThan(0)
    expect(second).toEqual(first)
    expect(coveredIds.size).toBe(elements.length)
  })
})
