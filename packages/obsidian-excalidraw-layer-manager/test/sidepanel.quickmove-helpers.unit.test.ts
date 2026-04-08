import { describe, expect, it } from "vitest"

import type { LayerNode } from "../src/model/tree.js"
import {
  collectTopLevelGroupReparentPresets,
  makePresetKey,
  makePresetLabel,
  resolveSharedFrame,
  truncateLabel,
} from "../src/ui/sidepanel/quickmove/presetHelpers.js"

const makeElementNode = (elementId: string, frameId: string | null = null): LayerNode => ({
  id: `el:${elementId}`,
  type: "element",
  elementIds: [elementId],
  primaryElementId: elementId,
  children: [],
  canExpand: false,
  isExpanded: false,
  groupId: null,
  frameId,
  label: elementId,
})

const makeGroupNode = (
  groupId: string,
  children: readonly LayerNode[],
  options?: {
    readonly frameId?: string | null
    readonly isExpanded?: boolean
    readonly primaryElementId?: string
    readonly label?: string
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
  label: options?.label ?? groupId,
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
  frameId: null,
  label: frameId,
})

describe("sidepanel quick-move preset helpers", () => {
  it("resolves shared frame correctly for homogeneous, frame-row, and mixed selections", () => {
    expect(
      resolveSharedFrame([
        makeElementNode("A", "F1"),
        makeElementNode("B", "F1"),
        makeElementNode("C", "F1"),
      ]),
    ).toEqual({ ok: true, frameId: "F1" })

    const frameChild = makeElementNode("frame-child", "F1")
    expect(resolveSharedFrame([makeFrameNode("F1", [frameChild]), frameChild])).toEqual({
      ok: true,
      frameId: "F1",
    })

    expect(resolveSharedFrame([makeElementNode("A", "F1"), makeElementNode("B", "F2")])).toEqual({
      ok: false,
      frameId: null,
    })
  })

  it("builds deterministic preset keys and compact labels", () => {
    expect(makePresetKey(["outer", "inner"], "F1")).toBe("F1:outer/inner")
    expect(makePresetKey(["outer", "inner"], null)).toBe("null:outer/inner")

    const short = makePresetLabel(["GroupA"])
    expect(short).toBe("Inside GroupA")

    const long = makePresetLabel(["alpha", "beta", "gamma", "delta"])
    expect(long.length).toBeLessThanOrEqual(28)
    expect(long.startsWith("Inside")).toBe(true)
  })

  it("truncates long labels with an ellipsis", () => {
    expect(truncateLabel("abc", 8)).toBe("abc")
    expect(truncateLabel("abcdefghijkl", 6)).toBe("abcde…")
  })

  it("collects only top-level group presets and keeps frame-aware dedupe keys", () => {
    const inner = makeGroupNode("Inner", [makeElementNode("A", "F1")], {
      frameId: "F1",
      primaryElementId: "group-primary:inner",
    })
    const topInF1 = makeGroupNode("G", [inner], {
      frameId: "F1",
      primaryElementId: "group-primary:g-f1",
    })
    const topInF2 = makeGroupNode("G", [makeElementNode("B", "F2")], {
      frameId: "F2",
      primaryElementId: "group-primary:g-f2",
    })
    const topInRoot = makeGroupNode("G", [makeElementNode("C", null)], {
      frameId: null,
      primaryElementId: "group-primary:g-root",
    })

    const tree = [makeFrameNode("F1", [topInF1]), makeFrameNode("F2", [topInF2]), topInRoot]

    const presets = collectTopLevelGroupReparentPresets(tree, 10)

    expect(presets.map((preset) => preset.key)).toEqual(["F1:G", "F2:G", "null:G"])
    expect(presets.some((preset) => preset.key.includes("Inner"))).toBe(false)
  })

  it("uses live group labels rather than raw group ids for preset labels", () => {
    const tree = [
      makeGroupNode("G", [makeElementNode("A")], {
        primaryElementId: "group-primary:g",
        label: "Renamed Group",
      }),
    ]

    const presets = collectTopLevelGroupReparentPresets(tree, 10)

    expect(presets).toEqual([
      {
        key: "null:G",
        label: "Inside Renamed Group",
        targetParentPath: ["G"],
        targetFrameId: null,
      },
    ])
  })

  it("honors max preset count in traversal order", () => {
    const tree = [
      makeGroupNode("G1", [makeElementNode("A")], { primaryElementId: "group-primary:g1" }),
      makeGroupNode("G2", [makeElementNode("B")], { primaryElementId: "group-primary:g2" }),
      makeGroupNode("G3", [makeElementNode("C")], { primaryElementId: "group-primary:g3" }),
    ]

    const presets = collectTopLevelGroupReparentPresets(tree, 2)

    expect(presets.map((preset) => preset.key)).toEqual(["null:G1", "null:G2"])
  })
})
