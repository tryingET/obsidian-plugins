import type { ScenePatch } from "../model/patch.js"
import {
  applyPatch as applyCorePatch,
  type ApplyPatchOutcome,
} from "./excalidrawAdapterCore.js"
import type { EaLike } from "./excalidraw-types.js"

export * from "./excalidrawAdapterCore.js"

const copyWithoutLmxElementLabel = (
  customData: Readonly<Record<string, unknown>>,
): Record<string, unknown> => {
  const nextCustomData = { ...customData }
  const lmx = nextCustomData["lmx"]

  if (!lmx || typeof lmx !== "object" || Array.isArray(lmx)) {
    return nextCustomData
  }

  const nextLmx = { ...(lmx as Record<string, unknown>) }
  Reflect.deleteProperty(nextLmx, "label")

  if (Object.keys(nextLmx).length === 0) {
    Reflect.deleteProperty(nextCustomData, "lmx")
  } else {
    nextCustomData["lmx"] = nextLmx
  }

  return nextCustomData
}

const resolveElementTypeById = (ea: EaLike): ReadonlyMap<string, string | undefined> => {
  try {
    return new Map((ea.getViewElements?.() ?? []).map((element) => [element.id, element.type]))
  } catch {
    return new Map()
  }
}

const normalizeNamingPatch = (ea: EaLike, patch: ScenePatch): ScenePatch => {
  if (!patch.elementPatches.some((entry) => entry.set.name !== undefined)) {
    return patch
  }

  const typeById = resolveElementTypeById(ea)
  const elementPatches = patch.elementPatches.map((entry) => {
    if (entry.set.name === undefined) {
      return entry
    }

    const elementType = typeById.get(entry.id)
    if (elementType === "frame") {
      const customData = entry.set.customData
      return {
        ...entry,
        set: {
          ...entry.set,
          ...(customData === undefined
            ? {}
            : { customData: copyWithoutLmxElementLabel(customData) }),
        },
      }
    }

    const { name: _ignoredLegacyName, ...setWithoutName } = entry.set
    return {
      ...entry,
      set: setWithoutName,
    }
  })

  return {
    ...patch,
    elementPatches,
  }
}

export const applyPatch = async (ea: EaLike, patch: ScenePatch): Promise<ApplyPatchOutcome> => {
  return applyCorePatch(ea, normalizeNamingPatch(ea, patch))
}

export type { ApplyPatchOutcome }
