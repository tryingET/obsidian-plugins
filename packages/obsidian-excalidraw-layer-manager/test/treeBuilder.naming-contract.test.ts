import { describe, expect, it } from "vitest"

import { buildLayerTree } from "../src/domain/treeBuilder.js"
import { buildSceneIndexes } from "../src/model/indexes.js"
import { makeElement, makeSnapshot } from "./testFixtures.js"

const buildTree = (elements: ReturnType<typeof makeElement>[]) => {
  const snapshot = makeSnapshot(elements)
  return buildLayerTree(
    {
      elements: snapshot.elements,
      expandedNodeIds: new Set<string>(),
      groupFreedraw: false,
    },
    buildSceneIndexes(snapshot),
  )
}

describe("tree builder naming contract", () => {
  it("uses native frame name ahead of a legacy LMX frame label", () => {
    const tree = buildTree([
      makeElement({
        id: "F",
        type: "frame",
        name: "Native frame",
        customData: {
          lmx: {
            label: "Legacy LMX frame",
          },
        },
      }),
    ])

    expect(tree).toHaveLength(1)
    expect(tree[0]?.type).toBe("frame")
    expect(tree[0]?.label).toBe("Native frame")
  })

  it("keeps a legacy LMX frame label as fallback when native name is absent", () => {
    const tree = buildTree([
      makeElement({
        id: "F",
        type: "frame",
        customData: {
          lmx: {
            label: "Legacy frame",
          },
        },
      }),
    ])

    expect(tree[0]?.label).toBe("Legacy frame")
  })
})
