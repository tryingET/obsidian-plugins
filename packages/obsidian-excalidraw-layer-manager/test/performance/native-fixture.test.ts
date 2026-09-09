import { describe, expect, it } from "vitest"
import {
  expectedFrontOrder,
  expectedRows,
  makeDescriptors,
  sceneProjection,
} from "../../scripts/performance/native-fixture.js"

describe("Given frozen seeded scene descriptors independent of LayerManager", () => {
  it("When a grouped leaf goes to front Then it stays within its parent scope", () => {
    expect(expectedFrontOrder(makeDescriptors(4, "pairs", 1), "e1x0").map((e) => e.id)).toEqual([
      "e1x1",
      "e1x0",
      "e1x2",
      "e1x3",
    ])
    expect(expectedFrontOrder(makeDescriptors(4, "ungrouped", 1), "e1x0").map((e) => e.id)).toEqual(
      ["e1x1", "e1x2", "e1x3", "e1x0"],
    )
  })
  it("When regenerated Then scene identity and foreign metadata are deterministic", () => {
    expect(makeDescriptors(1000, "ten", 558301)).toEqual(makeDescriptors(1000, "ten", 558301))
    expect(makeDescriptors(1000, "ten", 958301)).not.toEqual(makeDescriptors(1000, "ten", 558301))
  })
  it("When collapsed Then exact top-level group order follows scene stacking", () => {
    const scene = makeDescriptors(4, "pairs", 1)
    expect(expectedRows(scene, [])).toEqual([
      { id: "group:g1x1", level: 1, expanded: false },
      { id: "group:g1x0", level: 1, expanded: false },
    ])
    expect(expectedRows(scene, ["group:g1x1"])).toEqual([
      { id: "group:g1x1", level: 1, expanded: true },
      { id: "el:e1x3", level: 2, expanded: null },
      { id: "el:e1x2", level: 2, expanded: null },
      { id: "group:g1x0", level: 1, expanded: false },
    ])
  })
  it("When fully expanded Then every leaf occurs exactly once across all frozen shapes", () => {
    for (const shape of ["ungrouped", "pairs", "ten", "giant", "nested8", "skewed"]) {
      const scene = makeDescriptors(1000, shape, 558301)
      const rows = expectedRows(scene, "all")
      expect(
        rows
          .filter((r) => r.id.startsWith("el:"))
          .map((r) => r.id)
          .sort(),
      ).toEqual(scene.map((e) => `el:${e.id}`).sort())
      expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length)
    }
  })
  it("When transient version fields change Then geometry and unknown metadata remain guarded", () => {
    const [first] = makeDescriptors(1, "ungrouped", 1)
    if (!first) throw Error("fixture")
    const e = { ...first, version: 1, versionNonce: 4, updated: 7, index: "a0" }
    expect(sceneProjection([e])).toEqual(sceneProjection([{ ...e, version: 2 }]))
    expect(sceneProjection([e])).not.toEqual(sceneProjection([{ ...e, x: e.x + 1 }]))
    expect(sceneProjection([e])).not.toEqual(sceneProjection([{ ...e, customData: {} }]))
  })
})
