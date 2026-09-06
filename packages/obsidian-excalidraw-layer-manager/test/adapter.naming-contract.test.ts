import { describe, expect, it, vi } from "vitest"

import type { EaLike, RawExcalidrawElement } from "../src/adapter/excalidraw-types.js"
import { applyPatch } from "../src/adapter/excalidrawAdapter.js"

const makeEa = (initial: readonly RawExcalidrawElement[]) => {
  let elements: RawExcalidrawElement[] = initial.map((element) => ({
    ...element,
    groupIds: [...(element.groupIds ?? [])],
    customData: { ...(element.customData ?? {}) },
  }))

  const updateScene = vi.fn((scene: { elements: RawExcalidrawElement[] }) => {
    elements = scene.elements
  })

  const ea: EaLike = {
    getViewElements: () => elements,
    getViewSelectedElements: () => [],
    getExcalidrawAPI: () => ({ updateScene }),
  }

  return {
    ea,
    updateScene,
    getElements: () => elements,
  }
}

describe("adapter naming persistence contract", () => {
  it("persists an ordinary-element label only in customData.lmx", async () => {
    const fixture = makeEa([
      {
        id: "A",
        type: "rectangle",
        groupIds: [],
        customData: {
          otherNamespace: { keep: true },
        },
      },
    ])

    const outcome = await applyPatch(fixture.ea, {
      elementPatches: [
        {
          id: "A",
          set: {
            name: "Alpha",
            customData: {
              otherNamespace: { keep: true },
              lmx: {
                label: "Alpha",
                futureKey: "keep",
              },
            },
          },
        },
      ],
    })

    expect(outcome.status).toBe("applied")
    const [element] = fixture.getElements()
    expect(element?.name).toBeUndefined()
    expect(element?.customData).toEqual({
      otherNamespace: { keep: true },
      lmx: {
        label: "Alpha",
        futureKey: "keep",
      },
    })
  })

  it("persists a frame name natively and removes only the duplicate LMX element label", async () => {
    const fixture = makeEa([
      {
        id: "F",
        type: "frame",
        groupIds: [],
        customData: {},
      },
    ])

    const outcome = await applyPatch(fixture.ea, {
      elementPatches: [
        {
          id: "F",
          set: {
            name: "Frame A",
            customData: {
              otherNamespace: { keep: true },
              lmx: {
                label: "Frame A",
                groupLabels: { G: "Group" },
                futureKey: "keep",
              },
            },
          },
        },
      ],
    })

    expect(outcome.status).toBe("applied")
    const [element] = fixture.getElements()
    expect(element?.name).toBe("Frame A")
    expect(element?.customData).toEqual({
      otherNamespace: { keep: true },
      lmx: {
        groupLabels: { G: "Group" },
        futureKey: "keep",
      },
    })
  })
})
