import { describe, expect, it, vi } from "vitest"

import type { EaLike, RawExcalidrawElement } from "../src/adapter/excalidraw-types.js"
import { applyPatch, readSnapshot } from "../src/adapter/excalidrawAdapter.js"
import { planRenameNode } from "../src/commands/renameNode.js"
import { buildSceneIndexes } from "../src/model/indexes.js"

const makeEa = (initial: readonly RawExcalidrawElement[], legacy = false) => {
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

  if (legacy) {
    const editing = new Map<string, RawExcalidrawElement>()
    ea.copyViewElementsToEAforEditing = (targets) => {
      for (const element of targets ?? []) editing.set(element.id, { ...element })
    }
    ea.getElement = (id) => editing.get(id)
    ea.addElementsToView = vi.fn(async () => {
      elements = elements.map((element) => editing.get(element.id) ?? element)
      editing.clear()
    })
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

  it.each([false, true])(
    "planner persists native frame names and ordinary labels through legacy=%s",
    async (legacy) => {
      const customData = {
        otherNamespace: { keep: true },
        lmx: { label: "Old label", groupLabels: { G: "Group" }, futureKey: "keep" },
      }
      const fixture = makeEa(
        [
          { id: "F", type: "frame", name: "Old frame", groupIds: [], customData },
          { id: "A", type: "rectangle", name: "Legacy ordinary name", groupIds: [], customData },
        ],
        legacy,
      )
      for (const elementId of ["F", "A"]) {
        const snapshot = readSnapshot(fixture.ea)
        const plan = planRenameNode(
          { snapshot, indexes: buildSceneIndexes(snapshot) },
          {
            elementId,
            nextName: `New ${elementId}`,
          },
        )
        expect(plan.ok).toBe(true)
        if (!plan.ok) throw new Error(plan.error)
        expect((await applyPatch(fixture.ea, plan.value)).status).toBe("applied")
      }
      const [frame, ordinary] = fixture.getElements()
      expect(frame?.name).toBe("New F")
      expect(frame?.customData).toEqual(customData)
      expect(ordinary?.name).toBe("Legacy ordinary name")
      expect(ordinary?.customData).toEqual({
        ...customData,
        lmx: { ...customData.lmx, label: "New A" },
      })
      expect(customData.lmx.label).toBe("Old label")
      if (legacy) {
        expect(fixture.ea.addElementsToView).toHaveBeenCalledTimes(2)
        expect(fixture.updateScene).not.toHaveBeenCalled()
      } else {
        expect(fixture.updateScene).toHaveBeenCalledTimes(2)
      }
    },
  )
})
