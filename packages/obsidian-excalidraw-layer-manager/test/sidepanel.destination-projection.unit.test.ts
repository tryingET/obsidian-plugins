import { describe, expect, it } from "vitest"

import type { LayerNode } from "../src/model/tree.js"
import {
  buildSidepanelQuickMoveDestinationProjection,
  projectQuickMoveDestination,
  projectQuickMoveDestinations,
} from "../src/ui/sidepanel/quickmove/destinationProjection.js"
import { makePresetKey } from "../src/ui/sidepanel/quickmove/presetHelpers.js"
import type { LastQuickMoveDestination } from "../src/ui/sidepanel/quickmove/quickMovePersistenceService.js"

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
  childNodes: readonly LayerNode[],
  frameId: string | null = null,
  label = groupId,
): LayerNode => ({
  id: `group:${groupId}`,
  type: "group",
  elementIds: childNodes.flatMap((child) => child.elementIds),
  primaryElementId: childNodes[0]?.primaryElementId ?? `${groupId}-primary`,
  children: childNodes,
  canExpand: true,
  isExpanded: true,
  groupId,
  frameId,
  label,
})

const makeFrameNode = (frameId: string, childNodes: readonly LayerNode[]): LayerNode => ({
  id: `frame:${frameId}`,
  type: "frame",
  elementIds: [frameId, ...childNodes.flatMap((child) => child.elementIds)],
  primaryElementId: frameId,
  children: childNodes,
  canExpand: childNodes.length > 0,
  isExpanded: true,
  groupId: null,
  frameId: null,
  label: frameId,
})

describe("sidepanel quick-move destination projection", () => {
  it("projects persisted presets onto live labels and drops stale presets", () => {
    const tree = [makeGroupNode("G", [makeElementNode("A")], null, "Renamed Group")]
    const projection = buildSidepanelQuickMoveDestinationProjection(tree, 24, 64)

    expect(
      projectQuickMoveDestination(
        {
          kind: "preset",
          preset: {
            key: makePresetKey(["G"], null),
            label: "Inside old label",
            targetParentPath: ["G"],
            targetFrameId: null,
          },
        },
        projection.destinationByKey,
        projection.liveFrameIds,
      ),
    ).toEqual({
      kind: "preset",
      preset: {
        key: makePresetKey(["G"], null),
        label: "Inside Renamed Group",
        targetParentPath: ["G"],
        targetFrameId: null,
      },
    })

    expect(
      projectQuickMoveDestination(
        {
          kind: "preset",
          preset: {
            key: makePresetKey(["missing"], null),
            label: "Inside missing",
            targetParentPath: ["missing"],
            targetFrameId: null,
          },
        },
        projection.destinationByKey,
        projection.liveFrameIds,
      ),
    ).toBeNull()
  })

  it("keeps live roots, drops stale frame roots, and preserves frame-aware root dedupe", () => {
    const tree = [makeFrameNode("Frame-A", [makeElementNode("A", "Frame-A")])]
    const projection = buildSidepanelQuickMoveDestinationProjection(tree, 24, 64)
    const destinations: readonly LastQuickMoveDestination[] = [
      { kind: "root", targetFrameId: null },
      { kind: "root", targetFrameId: "Frame-A" },
      { kind: "root", targetFrameId: "Frame-A" },
      { kind: "root", targetFrameId: "missing-frame" },
    ]

    expect(
      projectQuickMoveDestination(
        { kind: "root", targetFrameId: "Frame-A" },
        projection.destinationByKey,
        projection.liveFrameIds,
      ),
    ).toEqual({
      kind: "root",
      targetFrameId: "Frame-A",
    })

    expect(
      projectQuickMoveDestination(
        { kind: "root", targetFrameId: "missing-frame" },
        projection.destinationByKey,
        projection.liveFrameIds,
      ),
    ).toBeNull()

    expect(
      projectQuickMoveDestinations(
        destinations,
        projection.destinationByKey,
        projection.liveFrameIds,
      ),
    ).toEqual([
      { kind: "root", targetFrameId: null },
      { kind: "root", targetFrameId: "Frame-A" },
    ])
  })
})
