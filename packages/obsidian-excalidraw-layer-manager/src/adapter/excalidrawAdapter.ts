import type { ElementDTO, ElementType } from "../model/entities.js"
import type { ScenePatch } from "../model/patch.js"
import type { LayerManagerSettings } from "../model/settings.js"
import { DEFAULT_SETTINGS } from "../model/settings.js"
import type { SceneSnapshot } from "../model/snapshot.js"
import type { EaLike, RawExcalidrawElement } from "./excalidraw-types.js"

const normalizeElementType = (rawType: string | undefined): ElementType => {
  switch (rawType) {
    case "rectangle":
    case "ellipse":
    case "diamond":
    case "line":
    case "arrow":
    case "freedraw":
    case "text":
    case "image":
    case "frame":
      return rawType
    default:
      return "unknown"
  }
}

const normalizeElement = (element: RawExcalidrawElement, zIndex: number): ElementDTO => {
  const normalized: ElementDTO = {
    id: element.id,
    type: normalizeElementType(element.type),
    zIndex,
    groupIds: Array.isArray(element.groupIds) ? element.groupIds : [],
    frameId: element.frameId ?? null,
    containerId: element.containerId ?? null,
    opacity: typeof element.opacity === "number" ? element.opacity : 100,
    locked: element.locked === true,
    isDeleted: element.isDeleted === true,
    customData: element.customData ?? {},
  }

  if (typeof element.name === "string") {
    normalized.name = element.name
  }

  if (typeof element.text === "string") {
    normalized.text = element.text
  }

  return normalized
}

const readSettings = (ea: EaLike): LayerManagerSettings => {
  const raw = ea.getScriptSettings?.()
  const groupFreedrawValue = raw?.["group_freedraw"]?.value
  const debugValue = raw?.["debug"]?.value

  return {
    groupFreedraw:
      typeof groupFreedrawValue === "boolean" ? groupFreedrawValue : DEFAULT_SETTINGS.groupFreedraw,
    debug: typeof debugValue === "boolean" ? debugValue : DEFAULT_SETTINGS.debug,
  }
}

const getCurrentTargetView = (ea: EaLike): unknown => {
  return ea.targetView ?? null
}

const isUsableTargetView = (value: unknown): boolean => {
  if (!value || typeof value !== "object") {
    return false
  }

  const record = value as Record<string, unknown>
  if ("_loaded" in record) {
    return record["_loaded"] === true
  }

  return true
}

const ensureTargetView = (ea: EaLike): boolean => {
  if (isUsableTargetView(getCurrentTargetView(ea))) {
    return true
  }

  const setView = ea.setView
  if (!setView) {
    return true
  }

  const strategies: readonly {
    readonly viewArg: unknown
    readonly reveal: boolean
  }[] = [
    { viewArg: "active", reveal: false },
    { viewArg: undefined, reveal: false },
    { viewArg: "first", reveal: false },
    { viewArg: "active", reveal: true },
    { viewArg: "first", reveal: true },
  ]

  for (const strategy of strategies) {
    try {
      const resolved = setView(strategy.viewArg, strategy.reveal)
      if (isUsableTargetView(resolved) || isUsableTargetView(getCurrentTargetView(ea))) {
        return true
      }
    } catch {
      // keep trying fallback strategies
    }
  }

  return isUsableTargetView(getCurrentTargetView(ea))
}

const readViewElements = (ea: EaLike): readonly RawExcalidrawElement[] => {
  ensureTargetView(ea)

  try {
    return ea.getViewElements?.() ?? []
  } catch {
    return []
  }
}

const readViewSelectedElements = (ea: EaLike): readonly RawExcalidrawElement[] => {
  ensureTargetView(ea)

  try {
    return ea.getViewSelectedElements?.() ?? []
  } catch {
    return []
  }
}

export const readSnapshot = (ea: EaLike): SceneSnapshot => {
  const rawElements = readViewElements(ea)
  const selected = readViewSelectedElements(ea)

  return {
    version: Date.now(),
    elements: rawElements.map((element, index) => normalizeElement(element, index)),
    selectedIds: new Set(selected.map((element) => element.id)),
    settings: readSettings(ea),
  }
}

export type ApplyPatchOutcome =
  | {
      readonly status: "applied"
    }
  | {
      readonly status: "preflightFailed"
      readonly reason: string
    }
  | {
      readonly status: "capabilityMissing"
      readonly reason: string
    }

interface PreflightResult {
  readonly ok: boolean
  readonly outcome?: ApplyPatchOutcome
}

const hasDuplicateIds = (ids: readonly string[]): boolean => {
  return new Set(ids).size !== ids.length
}

const isFullPermutation = (
  orderedIds: readonly string[],
  currentIds: ReadonlySet<string>,
): boolean => {
  if (orderedIds.length !== currentIds.size) {
    return false
  }

  const seen = new Set<string>()
  for (const id of orderedIds) {
    if (seen.has(id)) {
      return false
    }

    if (!currentIds.has(id)) {
      return false
    }

    seen.add(id)
  }

  return seen.size === currentIds.size
}

const hasLegacyElementMutationCapabilities = (ea: EaLike): boolean => {
  return !!ea.copyViewElementsToEAforEditing && !!ea.getElement && !!ea.addElementsToView
}

const hasUpdateSceneCapability = (ea: EaLike): boolean => {
  return !!ea.getExcalidrawAPI?.()?.updateScene
}

const hasElementMutationCapability = (ea: EaLike): boolean => {
  return hasLegacyElementMutationCapabilities(ea) || hasUpdateSceneCapability(ea)
}

const preflightPatch = (ea: EaLike, patch: ScenePatch): PreflightResult => {
  ensureTargetView(ea)

  const hasElementMutations = patch.elementPatches.length > 0
  const hasReorderMutation = !!patch.reorder
  const requiresMutationCapabilities = hasElementMutations || hasReorderMutation

  if (requiresMutationCapabilities && !ea.getViewElements) {
    return {
      ok: false,
      outcome: {
        status: "capabilityMissing",
        reason: "Missing getViewElements capability for mutation preflight.",
      },
    }
  }

  const currentElements = readViewElements(ea)
  const currentIds = new Set(currentElements.map((element) => element.id))

  if (hasElementMutations) {
    if (!hasElementMutationCapability(ea)) {
      return {
        ok: false,
        outcome: {
          status: "capabilityMissing",
          reason: "Missing element-mutation capabilities.",
        },
      }
    }

    const patchIds = patch.elementPatches.map((entry) => entry.id)
    if (hasDuplicateIds(patchIds)) {
      return {
        ok: false,
        outcome: {
          status: "preflightFailed",
          reason: "Duplicate elementPatch IDs are invalid.",
        },
      }
    }

    for (const id of patchIds) {
      if (!currentIds.has(id)) {
        return {
          ok: false,
          outcome: {
            status: "preflightFailed",
            reason: `Element patch target missing in current scene: ${id}`,
          },
        }
      }
    }
  }

  if (hasReorderMutation) {
    if (!hasUpdateSceneCapability(ea)) {
      return {
        ok: false,
        outcome: {
          status: "capabilityMissing",
          reason: "Missing reorder capability (updateScene).",
        },
      }
    }

    if (!patch.reorder || !isFullPermutation(patch.reorder.orderedElementIds, currentIds)) {
      return {
        ok: false,
        outcome: {
          status: "preflightFailed",
          reason: "Reorder payload must be a full permutation of current scene IDs.",
        },
      }
    }
  }

  return { ok: true }
}

const patchElementProperties = (
  target: RawExcalidrawElement,
  elementPatch: ScenePatch["elementPatches"][number],
): void => {
  const { set } = elementPatch

  if (set.groupIds !== undefined) target.groupIds = [...set.groupIds]
  if (set.frameId !== undefined) target.frameId = set.frameId
  if (set.opacity !== undefined) target.opacity = set.opacity
  if (set.locked !== undefined) target.locked = set.locked
  if (set.isDeleted !== undefined) target.isDeleted = set.isDeleted
  if (set.customData !== undefined) {
    target.customData = { ...set.customData }
  }
  if (set.name !== undefined) target.name = set.name
}

const applyElementPatchesViaLegacyEditing = async (
  ea: EaLike,
  patch: ScenePatch,
): Promise<boolean> => {
  if (!ea.copyViewElementsToEAforEditing || !ea.getElement || !ea.addElementsToView) {
    return false
  }

  ensureTargetView(ea)

  const currentElements = readViewElements(ea)
  const currentById = new Map(currentElements.map((element) => [element.id, element]))
  const targets: RawExcalidrawElement[] = []

  for (const elementPatch of patch.elementPatches) {
    const target = currentById.get(elementPatch.id)
    if (!target) {
      return false
    }

    targets.push(target)
  }

  try {
    ea.copyViewElementsToEAforEditing(targets)
  } catch {
    return false
  }

  const editableById = new Map<string, RawExcalidrawElement>()
  for (const elementPatch of patch.elementPatches) {
    const editable = ea.getElement(elementPatch.id)
    if (!editable) {
      return false
    }

    editableById.set(elementPatch.id, editable)
  }

  for (const elementPatch of patch.elementPatches) {
    const editable = editableById.get(elementPatch.id)
    if (!editable) {
      return false
    }

    patchElementProperties(editable, elementPatch)
  }

  try {
    await ea.addElementsToView(false, false)
  } catch {
    return false
  }

  return true
}

const applyElementPatchesViaUpdateScene = (ea: EaLike, patch: ScenePatch): boolean => {
  ensureTargetView(ea)

  const api = ea.getExcalidrawAPI?.()
  const current = readViewElements(ea)
  if (!api?.updateScene) {
    return false
  }

  const patchById = new Map(patch.elementPatches.map((entry) => [entry.id, entry]))
  let appliedPatchCount = 0

  const nextElements = current.map((element) => {
    const elementPatch = patchById.get(element.id)
    if (!elementPatch) {
      return element
    }

    appliedPatchCount += 1

    const nextElement: RawExcalidrawElement = {
      ...element,
    }

    if (Array.isArray(element.groupIds)) {
      nextElement.groupIds = [...element.groupIds]
    }

    if (element.customData) {
      nextElement.customData = { ...element.customData }
    }

    patchElementProperties(nextElement, elementPatch)
    return nextElement
  })

  if (appliedPatchCount !== patch.elementPatches.length) {
    return false
  }

  api.updateScene({ elements: nextElements })
  return true
}

const applyElementPatches = async (ea: EaLike, patch: ScenePatch): Promise<boolean> => {
  if (patch.elementPatches.length === 0) {
    return true
  }

  if (hasLegacyElementMutationCapabilities(ea)) {
    const legacyApplied = await applyElementPatchesViaLegacyEditing(ea, patch)
    if (legacyApplied) {
      return true
    }
  }

  if (hasUpdateSceneCapability(ea)) {
    return applyElementPatchesViaUpdateScene(ea, patch)
  }

  return false
}

const applyReorderPatch = (ea: EaLike, patch: ScenePatch): boolean => {
  ensureTargetView(ea)

  const api = ea.getExcalidrawAPI?.()
  const current = readViewElements(ea)

  if (!patch.reorder) {
    return true
  }

  if (!api?.updateScene) {
    return false
  }

  const byId = new Map(current.map((element) => [element.id, element]))
  const desired = patch.reorder.orderedElementIds
    .map((id) => byId.get(id))
    .filter((element): element is RawExcalidrawElement => Boolean(element))

  if (desired.length !== current.length) {
    return false
  }

  api.updateScene({ elements: desired })
  return true
}

export const applyPatch = async (ea: EaLike, patch: ScenePatch): Promise<ApplyPatchOutcome> => {
  const preflight = preflightPatch(ea, patch)
  if (!preflight.ok) {
    return (
      preflight.outcome ?? {
        status: "preflightFailed",
        reason: "Patch preflight failed.",
      }
    )
  }

  const elementsApplied = await applyElementPatches(ea, patch)
  if (!elementsApplied) {
    return {
      status: "preflightFailed",
      reason: "Element patch apply failed due to scene mismatch.",
    }
  }

  const reorderApplied = applyReorderPatch(ea, patch)
  if (!reorderApplied) {
    return {
      status: "preflightFailed",
      reason: "Reorder apply failed due to scene mismatch.",
    }
  }

  if (patch.selectIds && ea.selectElementsInView) {
    ea.selectElementsInView([...patch.selectIds])
  }

  return {
    status: "applied",
  }
}
