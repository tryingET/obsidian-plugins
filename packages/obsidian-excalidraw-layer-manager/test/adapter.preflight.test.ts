import { describe, expect, it, vi } from "vitest"

import type { EaLike, RawExcalidrawElement } from "../src/adapter/excalidraw-types.js"
import { applyPatch, readSnapshot } from "../src/adapter/excalidrawAdapter.js"

interface MockEaRuntime {
  readonly ea: EaLike
  readonly elements: RawExcalidrawElement[]
  readonly updateScene: ReturnType<typeof vi.fn>
  readonly copyForEditing: ReturnType<typeof vi.fn>
  readonly addToView: ReturnType<typeof vi.fn>
  readonly selectInView: ReturnType<typeof vi.fn>
  readonly setView: ReturnType<typeof vi.fn>
}

const makeMockEa = (
  initialElements: readonly RawExcalidrawElement[],
  options: {
    readonly withReorderCapability?: boolean
    readonly withElementEditCapabilities?: boolean
    readonly requireSetViewForReads?: boolean
    readonly failLegacyGetElement?: boolean
    readonly failUpdateSceneAfterCall?: number
  } = {},
): MockEaRuntime => {
  const elements: RawExcalidrawElement[] = initialElements.map((element) => ({
    ...element,
    groupIds: [...(element.groupIds ?? [])],
    customData: { ...(element.customData ?? {}) },
  }))

  let updateSceneCalls = 0
  const updateScene = vi.fn((scene: { elements: RawExcalidrawElement[] }) => {
    updateSceneCalls += 1
    if (options.failUpdateSceneAfterCall && updateSceneCalls >= options.failUpdateSceneAfterCall) {
      throw new Error("updateScene failed")
    }

    elements.splice(0, elements.length, ...scene.elements)
  })

  const copyForEditing = vi.fn()
  const addToView = vi.fn(async () => {})
  const selectInView = vi.fn()

  const withElementEditCapabilities = options.withElementEditCapabilities !== false
  let viewBound = options.requireSetViewForReads !== true
  let targetView: EaLike["targetView"] = viewBound
    ? {
        id: "mock-view",
        _loaded: true,
      }
    : null

  const setView = vi.fn(() => {
    viewBound = true
    targetView = {
      id: "mock-view",
      _loaded: true,
    }
    ea.targetView = targetView
    return targetView
  })

  const ea: EaLike = {
    targetView,
    setView,
    getViewElements: () => (viewBound ? elements : []),
    getViewSelectedElements: () => (viewBound ? [] : []),
    selectElementsInView: selectInView,
    getExcalidrawAPI:
      options.withReorderCapability === false ? () => ({}) : () => ({ updateScene }),
  }

  if (withElementEditCapabilities) {
    ea.copyViewElementsToEAforEditing = copyForEditing
    ea.getElement = (id: string) => {
      if (options.failLegacyGetElement) {
        return undefined
      }

      return elements.find((element) => element.id === id)
    }
    ea.addElementsToView = addToView
  }

  return {
    ea,
    elements,
    updateScene,
    copyForEditing,
    addToView,
    selectInView,
    setView,
  }
}

describe("applyPatch adapter preflight", () => {
  it("rebinds target view via setView before snapshot reads", () => {
    const runtime = makeMockEa(
      [
        { id: "A", type: "rectangle" },
        { id: "B", type: "rectangle" },
      ],
      {
        requireSetViewForReads: true,
      },
    )

    const snapshot = readSnapshot(runtime.ea)

    expect(runtime.setView).toHaveBeenCalled()
    expect(snapshot.elements.map((element) => element.id)).toEqual(["A", "B"])
  })

  it("rebinds target view via setView before patch preflight/apply", async () => {
    const runtime = makeMockEa(
      [
        { id: "A", type: "rectangle" },
        { id: "B", type: "rectangle" },
      ],
      {
        requireSetViewForReads: true,
      },
    )

    const outcome = await applyPatch(runtime.ea, {
      elementPatches: [],
      reorder: {
        orderedElementIds: ["A", "B"],
      },
    })

    expect(runtime.setView).toHaveBeenCalled()
    expect(outcome.status).toBe("applied")
    expect(runtime.updateScene).toHaveBeenCalledTimes(1)
  })

  it("accepts target-view binding when setView mutates ea.targetView but returns null", () => {
    const getViewElements = vi.fn(() => [{ id: "A", type: "rectangle" }])
    const getViewSelectedElements = vi.fn(() => [])

    const ea: EaLike = {
      targetView: null,
      setView: vi.fn(() => {
        ea.targetView = {
          _loaded: true,
        }
        return null
      }),
      getViewElements,
      getViewSelectedElements,
    }

    const snapshot = readSnapshot(ea)

    expect(ea.setView).toHaveBeenCalled()
    expect(getViewElements).toHaveBeenCalledTimes(1)
    expect(snapshot.elements.map((element) => element.id)).toEqual(["A"])
  })

  it("preserves ExcalidrawAutomate setView this-binding during rebinding", () => {
    const getViewElements = vi.fn(() => [{ id: "A", type: "rectangle" }])
    const getViewSelectedElements = vi.fn(() => [])

    const ea: EaLike = {
      targetView: null,
      setView: vi.fn(function (this: EaLike) {
        if (this !== ea) {
          throw new Error("detached setView")
        }

        this.targetView = {
          id: "bound-view",
          _loaded: true,
        }
        return this.targetView
      }),
      getViewElements,
      getViewSelectedElements,
    }

    const snapshot = readSnapshot(ea)

    expect(ea.setView).toHaveBeenCalled()
    expect(getViewElements).toHaveBeenCalledTimes(1)
    expect(snapshot.elements.map((element) => element.id)).toEqual(["A"])
  })

  it("fail-stops snapshot reads when explicit targetView cannot be rebound", () => {
    const getViewElements = vi.fn(() => {
      throw new Error("targetView not set")
    })
    const getViewSelectedElements = vi.fn(() => {
      throw new Error("targetView not set")
    })

    const ea: EaLike = {
      targetView: null,
      setView: vi.fn(() => null),
      getViewElements,
      getViewSelectedElements,
    }

    const snapshot = readSnapshot(ea)

    expect(ea.setView).toHaveBeenCalled()
    expect(getViewElements).not.toHaveBeenCalled()
    expect(getViewSelectedElements).not.toHaveBeenCalled()
    expect(snapshot.elements).toEqual([])
    expect(snapshot.selectedIds.size).toBe(0)
  })

  it("fail-stops snapshot reads when explicit targetView stays unloaded after rebinding attempts", () => {
    const getViewElements = vi.fn(() => {
      throw new Error("targetView not loaded")
    })
    const getViewSelectedElements = vi.fn(() => {
      throw new Error("targetView not loaded")
    })

    const ea: EaLike = {
      targetView: {
        _loaded: false,
      },
      setView: vi.fn(() => ({
        _loaded: false,
      })),
      getViewElements,
      getViewSelectedElements,
    }

    const snapshot = readSnapshot(ea)

    expect(ea.setView).toHaveBeenCalled()
    expect(getViewElements).not.toHaveBeenCalled()
    expect(getViewSelectedElements).not.toHaveBeenCalled()
    expect(snapshot.elements).toEqual([])
    expect(snapshot.selectedIds.size).toBe(0)
  })

  it("preserves legacy snapshot reads when no explicit targetView property exists", () => {
    const getViewElements = vi.fn(() => [{ id: "A", type: "rectangle" }])
    const getViewSelectedElements = vi.fn(() => [])

    const ea: EaLike = {
      getViewElements,
      getViewSelectedElements,
    }

    const snapshot = readSnapshot(ea)

    expect(getViewElements).toHaveBeenCalledTimes(1)
    expect(getViewSelectedElements).toHaveBeenCalledTimes(1)
    expect(snapshot.elements.map((element) => element.id)).toEqual(["A"])
  })

  it("does not rescue snapshot reads through first-view fallback", () => {
    const getViewElements = vi.fn(() => {
      throw new Error("targetView not set")
    })
    const getViewSelectedElements = vi.fn(() => {
      throw new Error("targetView not set")
    })

    const ea: EaLike = {
      targetView: null,
      setView: vi.fn((viewArg?: unknown) => {
        if (viewArg === "first") {
          ea.targetView = {
            _loaded: true,
          }
        }

        return ea.targetView
      }),
      getViewElements,
      getViewSelectedElements,
    }

    const snapshot = readSnapshot(ea)

    expect(snapshot.elements).toEqual([])
    expect(snapshot.selectedIds.size).toBe(0)
    expect(ea.setView).not.toHaveBeenCalledWith("first", false)
    expect(ea.setView).not.toHaveBeenCalledWith("first", true)
  })

  it("fail-stops patch preflight reads when explicit targetView cannot be rebound", async () => {
    const getViewElements = vi.fn(() => {
      throw new Error("targetView not set")
    })
    const updateScene = vi.fn()

    const ea: EaLike = {
      targetView: null,
      setView: vi.fn(() => null),
      getViewElements,
      getExcalidrawAPI: () => ({ updateScene }),
    }

    const outcome = await applyPatch(ea, {
      elementPatches: [],
      reorder: {
        orderedElementIds: ["A"],
      },
    })

    expect(ea.setView).toHaveBeenCalled()
    expect(getViewElements).not.toHaveBeenCalled()
    expect(updateScene).not.toHaveBeenCalled()
    expect(outcome.status).toBe("preflightFailed")
  })

  it("R01 — aborts before writes when patch references missing IDs", async () => {
    const runtime = makeMockEa([
      { id: "A", type: "rectangle" },
      { id: "B", type: "rectangle" },
    ])

    const outcome = await applyPatch(runtime.ea, {
      elementPatches: [
        {
          id: "missing",
          set: {
            locked: true,
          },
        },
      ],
    })

    expect(outcome.status).toBe("preflightFailed")
    expect(runtime.copyForEditing).not.toHaveBeenCalled()
    expect(runtime.addToView).not.toHaveBeenCalled()
    expect(runtime.updateScene).not.toHaveBeenCalled()
    expect(runtime.elements.map((element) => element.id)).toEqual(["A", "B"])
  })

  it("R02 — aborts before writes when reorder is not a full permutation", async () => {
    const runtime = makeMockEa([
      { id: "A", type: "rectangle" },
      { id: "B", type: "rectangle" },
      { id: "C", type: "rectangle" },
    ])

    const outcome = await applyPatch(runtime.ea, {
      elementPatches: [],
      reorder: {
        orderedElementIds: ["A", "C"],
      },
    })

    expect(outcome.status).toBe("preflightFailed")
    expect(runtime.updateScene).not.toHaveBeenCalled()
    expect(runtime.copyForEditing).not.toHaveBeenCalled()
    expect(runtime.addToView).not.toHaveBeenCalled()
    expect(runtime.elements.map((element) => element.id)).toEqual(["A", "B", "C"])
  })

  it("applies element patches via updateScene fallback when edit capabilities are missing", async () => {
    const runtime = makeMockEa(
      [
        { id: "A", type: "rectangle", isDeleted: false },
        { id: "B", type: "rectangle", isDeleted: false },
      ],
      {
        withElementEditCapabilities: false,
      },
    )

    const outcome = await applyPatch(runtime.ea, {
      elementPatches: [
        {
          id: "A",
          set: {
            isDeleted: true,
          },
        },
      ],
    })

    expect(outcome.status).toBe("applied")
    expect(runtime.copyForEditing).not.toHaveBeenCalled()
    expect(runtime.addToView).not.toHaveBeenCalled()
    expect(runtime.updateScene).toHaveBeenCalledTimes(1)
    expect(runtime.elements.find((element) => element.id === "A")?.isDeleted).toBe(true)
    expect(runtime.elements.find((element) => element.id === "B")?.isDeleted).toBe(false)
  })

  it("passes patch targets to legacy copyViewElementsToEAforEditing", async () => {
    const runtime = makeMockEa([
      { id: "A", type: "rectangle", isDeleted: false },
      { id: "B", type: "rectangle", isDeleted: false },
      { id: "C", type: "rectangle", isDeleted: false },
    ])

    const outcome = await applyPatch(runtime.ea, {
      elementPatches: [
        {
          id: "A",
          set: {
            isDeleted: true,
          },
        },
        {
          id: "B",
          set: {
            locked: true,
          },
        },
      ],
    })

    expect(outcome.status).toBe("applied")
    expect(runtime.copyForEditing).toHaveBeenCalledTimes(1)

    const copiedTargets = runtime.copyForEditing.mock.calls[0]?.[0] as
      | readonly RawExcalidrawElement[]
      | undefined
    expect(copiedTargets?.map((element) => element.id)).toEqual(["A", "B"])
  })

  it("falls back to updateScene when legacy element editing path cannot resolve editable elements", async () => {
    const runtime = makeMockEa(
      [
        { id: "A", type: "rectangle", isDeleted: false },
        { id: "B", type: "rectangle", isDeleted: false },
      ],
      {
        failLegacyGetElement: true,
      },
    )

    const outcome = await applyPatch(runtime.ea, {
      elementPatches: [
        {
          id: "A",
          set: {
            isDeleted: true,
          },
        },
      ],
    })

    expect(outcome.status).toBe("applied")
    expect(runtime.copyForEditing).toHaveBeenCalledTimes(1)
    expect(runtime.addToView).not.toHaveBeenCalled()
    expect(runtime.updateScene).toHaveBeenCalledTimes(1)
    expect(runtime.elements.find((element) => element.id === "A")?.isDeleted).toBe(true)
    expect(runtime.elements.find((element) => element.id === "B")?.isDeleted).toBe(false)
  })

  it("fails closed for element patches when neither legacy editing nor updateScene is available", async () => {
    const runtime = makeMockEa(
      [
        { id: "A", type: "rectangle", isDeleted: false },
        { id: "B", type: "rectangle", isDeleted: false },
      ],
      {
        withElementEditCapabilities: false,
        withReorderCapability: false,
      },
    )

    const outcome = await applyPatch(runtime.ea, {
      elementPatches: [
        {
          id: "A",
          set: {
            isDeleted: true,
          },
        },
      ],
    })

    expect(outcome.status).toBe("capabilityMissing")
    expect(runtime.updateScene).not.toHaveBeenCalled()
    expect(runtime.copyForEditing).not.toHaveBeenCalled()
    expect(runtime.addToView).not.toHaveBeenCalled()
  })

  it("R03 — reports capability missing and performs no writes", async () => {
    const runtime = makeMockEa(
      [
        { id: "A", type: "rectangle" },
        { id: "B", type: "rectangle" },
      ],
      { withReorderCapability: false },
    )

    const outcome = await applyPatch(runtime.ea, {
      elementPatches: [],
      reorder: {
        orderedElementIds: ["A", "B"],
      },
    })

    expect(outcome.status).toBe("capabilityMissing")
    expect(runtime.updateScene).not.toHaveBeenCalled()
    expect(runtime.copyForEditing).not.toHaveBeenCalled()
    expect(runtime.addToView).not.toHaveBeenCalled()
  })

  it("surfaces partialApply when updateScene applies element patches before reorder fails", async () => {
    const runtime = makeMockEa(
      [
        { id: "A", type: "rectangle", locked: false },
        { id: "B", type: "rectangle", locked: false },
      ],
      {
        withElementEditCapabilities: false,
        failUpdateSceneAfterCall: 2,
      },
    )

    const outcome = await applyPatch(runtime.ea, {
      elementPatches: [
        {
          id: "A",
          set: {
            locked: true,
          },
        },
      ],
      reorder: {
        orderedElementIds: ["B", "A"],
      },
    })

    expect(outcome.status).toBe("partialApply")
    if (outcome.status === "partialApply") {
      expect(outcome.reason).toContain("Element patches applied")
    }
    expect(runtime.updateScene).toHaveBeenCalledTimes(2)
    expect(runtime.elements.find((element) => element.id === "A")?.locked).toBe(true)
    expect(runtime.elements.map((element) => element.id)).toEqual(["A", "B"])
  })
})
