import { describe, expect, it, vi } from "vitest"

import type { EaLike, RawExcalidrawElement } from "../src/adapter/excalidraw-types.js"
import { applyPatch } from "../src/adapter/excalidrawAdapter.js"

// Native EA copies into a persistent staging dictionary; addElementsToView does
// not empty it. A mock which clears after every commit hides unrelated replay.
const makeNativeEa = () => {
  let scene: RawExcalidrawElement[] = [
    { id: "A", type: "rectangle", opacity: 100 },
    { id: "B", type: "rectangle", opacity: 100 },
  ]
  const ea: EaLike & {
    elementsDict: Record<string, RawExcalidrawElement>
    imagesDict: Record<string, unknown>
  } = {
    elementsDict: {},
    imagesDict: {},
    getViewElements: () => scene,
    copyViewElementsToEAforEditing: vi.fn((targets) => {
      for (const element of targets ?? []) ea.elementsDict[element.id] = { ...element }
    }),
    getElement: (id) => ea.elementsDict[id],
    addElementsToView: vi.fn(async () => {
      // Native addElementsToView snapshots staging before its first await.
      const staged = Object.values(ea.elementsDict)
      const images = ea.imagesDict
      await Promise.resolve()
      expect(images).toEqual({})
      scene = scene.map((element) => staged.find((entry) => entry.id === element.id) ?? element)
    }),
  }
  return {
    ea,
    getScene: () => scene,
    canvasEdit: (id: string, set: Partial<RawExcalidrawElement>) => {
      scene = scene.map((element) => (element.id === id ? { ...element, ...set } : element))
    },
  }
}

describe("native EA staging isolation", () => {
  const patch = { elementPatches: [{ id: "B", set: { locked: true } }] }

  it.each([false, true])(
    "preserves entries inserted into restored dictionaries during pending rejection=%s",
    async (rejectCommit) => {
      const { ea } = makeNativeEa()
      const originalElements = ea.elementsDict
      const originalImages = ea.imagesDict
      let resolve!: () => void
      let reject!: (reason: Error) => void
      ea.addElementsToView = () =>
        new Promise<void>((yes, no) => {
          resolve = yes
          reject = no
        })
      const pending = applyPatch(ea, patch)
      const element = { id: "external", opacity: 32 }
      const image = { dataURL: "newer" }
      originalElements["external"] = element
      originalImages["external"] = image
      if (rejectCommit) reject(new Error("late failure"))
      else resolve()
      expect((await pending).status).toBe(rejectCommit ? "preflightFailed" : "applied")
      expect(ea.elementsDict).toBe(originalElements)
      expect(ea.imagesDict).toBe(originalImages)
      expect(ea.elementsDict).toEqual({ external: element })
      expect(ea.imagesDict).toEqual({ external: image })
    },
  )

  it.each(["copy", "get"])(
    "does not patch or commit reentrant replacement staging during %s",
    async (phase) => {
      const { ea } = makeNativeEa()
      const newerElement = { id: "B", locked: false }
      const newerElements = { B: newerElement }
      const replace = () => {
        ea.elementsDict = newerElements
      }
      if (phase === "copy") ea.copyViewElementsToEAforEditing = replace
      else
        ea.getElement = () => {
          replace()
          return newerElement
        }
      expect((await applyPatch(ea, patch)).status).toBe("preflightFailed")
      expect(ea.elementsDict).toBe(newerElements)
      expect(newerElement.locked).toBe(false)
      expect(ea.addElementsToView).not.toHaveBeenCalled()
    },
  )

  it("restores caller-owned element and image dictionaries before awaiting the commit", async () => {
    const { ea } = makeNativeEa()
    const staged = { id: "A", opacity: 12 }
    const image = { dataURL: "external-image" }
    ea.elementsDict["A"] = staged
    ea.imagesDict["external"] = image
    const originalElements = ea.elementsDict
    const originalImages = ea.imagesDict
    const pending = applyPatch(ea, patch)
    expect(ea.elementsDict).toBe(originalElements)
    expect(ea.imagesDict).toBe(originalImages)
    expect(ea.elementsDict["A"]).toBe(staged)
    expect(ea.imagesDict["external"]).toBe(image)
    expect((await pending).status).toBe("applied")
    expect(ea.elementsDict).toEqual({ A: staged })
  })

  it.each(["copy", "get", "commit", "cancel"])(
    "restores staging on synchronous %s failure",
    async (phase) => {
      const { ea } = makeNativeEa()
      const originalElements = ea.elementsDict
      const originalImages = ea.imagesDict
      const originalCopy = ea.copyViewElementsToEAforEditing
      let active = true
      const fail = () => {
        throw new Error("native failure")
      }
      if (phase === "copy") ea.copyViewElementsToEAforEditing = fail
      if (phase === "get") ea.getElement = () => undefined
      if (phase === "commit") ea.addElementsToView = fail
      if (phase === "cancel")
        ea.copyViewElementsToEAforEditing = (targets) => {
          originalCopy?.(targets)
          active = false
        }
      expect((await applyPatch(ea, patch, () => active)).status).not.toBe("applied")
      expect(ea.elementsDict).toBe(originalElements)
      expect(ea.imagesDict).toBe(originalImages)
      expect(ea.elementsDict).toEqual({})
    },
  )

  it.each([false, true])(
    "does not touch newer staging on pending commit rejection=%s after cancellation",
    async (rejectCommit) => {
      const { ea } = makeNativeEa()
      let resolve!: () => void
      let reject!: (reason: Error) => void
      ea.addElementsToView = () =>
        new Promise<void>((yes, no) => {
          resolve = yes
          reject = no
        })
      let active = true
      const pending = applyPatch(ea, patch, () => active)
      const newerElements = { external: { id: "external", opacity: 32 } }
      const newerImages = { external: { dataURL: "newer" } }
      ea.elementsDict = newerElements
      ea.imagesDict = newerImages
      active = false
      if (rejectCommit) reject(new Error("late failure"))
      else resolve()
      expect((await pending).status).not.toBe("applied")
      expect(ea.elementsDict).toBe(newerElements)
      expect(ea.imagesDict).toBe(newerImages)
    },
  )

  it("does not overwrite reentrant replacement dictionaries", async () => {
    const { ea } = makeNativeEa()
    const newerElements = { external: { id: "external", opacity: 32 } }
    const newerImages = { external: { dataURL: "newer" } }
    ea.addElementsToView = vi.fn(() => {
      ea.elementsDict = newerElements
      ea.imagesDict = newerImages
    })
    expect((await applyPatch(ea, patch)).status).toBe("applied")
    expect(ea.elementsDict).toBe(newerElements)
    expect(ea.imagesDict).toBe(newerImages)
  })

  it("isolates overlapping commits without retaining either command's staging", async () => {
    const { ea } = makeNativeEa()
    const originalElements = ea.elementsDict
    const originalImages = ea.imagesDict
    const captured: string[][] = []
    const releases: Array<() => void> = []
    ea.addElementsToView = () => {
      captured.push(Object.keys(ea.elementsDict))
      return new Promise<void>((resolve) => {
        releases.push(resolve)
      })
    }
    const first = applyPatch(ea, { elementPatches: [{ id: "A", set: { locked: true } }] })
    const second = applyPatch(ea, patch)
    expect(captured).toEqual([["A"], ["B"]])
    expect(ea.elementsDict).toBe(originalElements)
    expect(ea.imagesDict).toBe(originalImages)
    for (const resolve of [...releases].reverse()) resolve()
    expect((await first).status).toBe("applied")
    expect((await second).status).toBe("applied")
    expect(ea.elementsDict).toEqual({})
  })

  it("does not replay stale native EA staging over unrelated canvas edits", async () => {
    const fixture = makeNativeEa()
    expect(
      (
        await applyPatch(fixture.ea, {
          elementPatches: [{ id: "A", set: { opacity: 0 } }],
        })
      ).status,
    ).toBe("applied")
    fixture.canvasEdit("A", { opacity: 65, locked: true, customData: { foreign: "new" } })
    expect(
      (
        await applyPatch(fixture.ea, {
          elementPatches: [{ id: "B", set: { locked: true } }],
        })
      ).status,
    ).toBe("applied")
    expect(fixture.getScene()).toEqual([
      { id: "A", type: "rectangle", opacity: 65, locked: true, customData: { foreign: "new" } },
      { id: "B", type: "rectangle", opacity: 100, locked: true },
    ])
    expect(fixture.ea.addElementsToView).toHaveBeenCalledTimes(2)
  })

  it("excludes unrelated pre-existing staging from the native commit", async () => {
    const fixture = makeNativeEa()
    fixture.ea.elementsDict["A"] = { id: "A", opacity: 12 }
    await applyPatch(fixture.ea, { elementPatches: [{ id: "B", set: { locked: true } }] })
    expect(fixture.getScene()[0]).toEqual({ id: "A", type: "rectangle", opacity: 100 })
  })
})
