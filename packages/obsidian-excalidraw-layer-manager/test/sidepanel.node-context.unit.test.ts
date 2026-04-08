import { describe, expect, it } from "vitest"

import type { LayerNode } from "../src/model/tree.js"
import { resolveSelectedNodes } from "../src/ui/sidepanel/selection/nodeContext.js"

const makeElementNode = (elementId: string, frameId: string | null): LayerNode => ({
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

const makeFrameNode = (
  frameId: string,
  children: readonly LayerNode[],
  isExpanded: boolean,
): LayerNode => ({
  id: `frame:${frameId}`,
  type: "frame",
  elementIds: [frameId, ...children.flatMap((child) => child.elementIds)],
  primaryElementId: frameId,
  children,
  canExpand: children.length > 0,
  isExpanded,
  groupId: null,
  frameId: null,
  label: frameId,
})

describe("sidepanel node context", () => {
  it("resolves selected nodes from collapsed descendants instead of visible projection only", () => {
    const child = makeElementNode("A", "Frame-A")
    const frame = makeFrameNode("Frame-A", [child], false)

    const resolved = resolveSelectedNodes([frame], ["Frame-A", "A"])

    expect(resolved.map((node) => node.id)).toEqual(["frame:Frame-A", "el:A"])
  })
})
