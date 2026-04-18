import { describe, expect, it, vi } from "vitest"

import type { EaLike, RawExcalidrawElement } from "../src/adapter/excalidraw-types.js"
import { createLayerManagerRuntime } from "../src/main.js"
import { ok } from "../src/model/result.js"

interface MockEaRuntime {
  readonly ea: EaLike
  readonly elements: RawExcalidrawElement[]
  readonly copyForEditing: ReturnType<typeof vi.fn>
  readonly addToView: ReturnType<typeof vi.fn>
  readonly updateScene: ReturnType<typeof vi.fn>
}

const makeMockEa = (initialElements: readonly RawExcalidrawElement[]): MockEaRuntime => {
  const elements: RawExcalidrawElement[] = initialElements.map((element) => ({
    ...element,
    groupIds: [...(element.groupIds ?? [])],
    customData: { ...(element.customData ?? {}) },
  }))

  const copyForEditing = vi.fn()
  const addToView = vi.fn(async () => {})
  const updateScene = vi.fn((scene: { elements: RawExcalidrawElement[] }) => {
    elements.splice(0, elements.length, ...scene.elements)
  })

  return {
    ea: {
      getViewElements: () => elements,
      getViewSelectedElements: () => [],
      copyViewElementsToEAforEditing: copyForEditing,
      getElement: (id: string) => elements.find((element) => element.id === id),
      addElementsToView: addToView,
      getExcalidrawAPI: () => ({ updateScene }),
      getScriptSettings: () => ({}),
    },
    elements,
    copyForEditing,
    addToView,
    updateScene,
  }
}

describe("LayerManagerRuntime executeIntent", () => {
  it("R04 — refreshes, replans once, and succeeds after one stale preflight failure", async () => {
    const runtime = makeMockEa([
      { id: "A", type: "rectangle", locked: false },
      { id: "B", type: "rectangle", locked: false },
    ])

    const renderer = {
      render: vi.fn(),
    }

    const app = createLayerManagerRuntime(runtime.ea, renderer)

    let plannerCalls = 0
    const result = await app.executeIntent(() => {
      plannerCalls += 1

      if (plannerCalls === 1) {
        return ok({
          elementPatches: [
            {
              id: "missing",
              set: {
                locked: true,
              },
            },
          ],
        })
      }

      return ok({
        elementPatches: [
          {
            id: "A",
            set: {
              locked: true,
            },
          },
        ],
      })
    })

    expect(result).toEqual({
      status: "applied",
      attempts: 2,
    })

    expect(plannerCalls).toBe(2)
    expect(runtime.copyForEditing).toHaveBeenCalledTimes(1)
    expect(runtime.addToView).toHaveBeenCalledTimes(1)
    expect(runtime.elements.find((element) => element.id === "A")?.locked).toBe(true)
    expect(renderer.render).toHaveBeenCalled()
  })

  it("MOE-15 — bounds stale retry to one replan attempt", async () => {
    const runtime = makeMockEa([
      { id: "A", type: "rectangle", locked: false },
      { id: "B", type: "rectangle", locked: false },
    ])

    const app = createLayerManagerRuntime(runtime.ea, {
      render: vi.fn(),
    })

    let plannerCalls = 0
    const result = await app.executeIntent(() => {
      plannerCalls += 1

      return ok({
        elementPatches: [
          {
            id: "missing",
            set: {
              locked: true,
            },
          },
        ],
      })
    })

    expect(result.status).toBe("preflightFailed")
    expect(result.attempts).toBe(2)
    expect(plannerCalls).toBe(2)
    expect(runtime.copyForEditing).not.toHaveBeenCalled()
    expect(runtime.addToView).not.toHaveBeenCalled()
    expect(runtime.elements.some((element) => element.locked)).toBe(false)
  })

  it("surfaces raw apply outcomes instead of resolving silent success", async () => {
    const runtime = makeMockEa([{ id: "A", type: "rectangle", locked: false }])
    runtime.ea.getExcalidrawAPI = () => ({})

    const app = createLayerManagerRuntime(runtime.ea, {
      render: vi.fn(),
    })

    const outcome = await app.apply({
      elementPatches: [],
      reorder: {
        orderedElementIds: ["A"],
      },
    })

    expect(outcome).toEqual({
      status: "capabilityMissing",
      reason: "Missing reorder capability (updateScene).",
    })
    expect(runtime.updateScene).not.toHaveBeenCalled()
  })
})
