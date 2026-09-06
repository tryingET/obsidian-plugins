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

const hasExplicitTargetViewProperty = (ea: EaLike): boolean => {
  return Object.prototype.hasOwnProperty.call(ea, "targetView")
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

const invokeSetView = (ea: EaLike, viewArg: unknown, reveal: boolean): unknown => {
  const setView = ea.setView
  if (!setView) {
    return null
  }

  return setView.call(ea, viewArg, reveal)
}

const ensureTargetView = (ea: EaLike): boolean => {
  if (isUsableTargetView(getCurrentTargetView(ea))) {
    return true
  }

  if (!ea.setView) {
    return !hasExplicitTargetViewProperty(ea)
  }

  const strategies: readonly {
    readonly viewArg: unknown
    readonly reveal: boolean
  }[] = [
    { viewArg: "active", reveal: false },
    { viewArg: undefined, reveal: false },
    { viewArg: "active", reveal: true },
    { viewArg: undefined, reveal: true },
  ]

  for (const strategy of strategies) {
    try {
      const resolved = invokeSetView(ea, strategy.viewArg, strategy.reveal)
      if (isUsableTargetView(resolved) || isUsableTargetView(getCurrentTargetView(ea))) {
        return true
      }
    } catch {
      // keep trying fallback strategies
    }
  }

  return !hasExplicitTargetViewProperty(ea) || isUsableTargetView(getCurrentTargetView(ea))
}

const readViewElements = (ea: EaLike): readonly RawExcalidrawElement[] => {
  if (!ensureTargetView(ea)) {
    return []
  }

  try {
    return ea.getViewElements?.() ?? []
  } catch {
    return []
  }
}

const readViewSelectedElements = (ea: EaLike): readonly RawExcalidrawElement[] => {
  if (!ensureTargetView(ea)) {
    return []
  }

  try {
    return ea.getViewSelectedElements?.() ?? []
  } catch {
    return []
  }
}

let snapshotVersionCounter = 0

export const readSnapshot = (ea: EaLike): SceneSnapshot => {
  const rawElements = readViewElements(ea)
  const selected = readViewSelectedElements(ea)

  snapshotVersionCounter += 1

  return {
    version: snapshotVersionCounter,
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

type CachedCapabilities = {
  readonly legacy: boolean
  readonly updateScene: boolean
}

const capabilityCache = new WeakMap<EaLike, CachedCapabilities>()

const probeCapabilities = (ea: EaLike): CachedCapabilities => {
  const cached = capabilityCache.get(ea)
  if (cached) {
    return cached
  }

  const result: CachedCapabilities = {
    legacy: !!ea.copyViewElementsToEAforEditing && !!ea.getElement && !!ea.addElementsToView,
    updateScene: !!ea.getExcalidrawAPI?.()?.updateScene,
  }

  capabilityCache.set(ea, result)
  return result
}

const hasLegacyElementMutationCapabilities = (ea: EaLike): boolean => {
  return probeCapabilities(ea).legacy
}

const hasUpdateSceneCapability = (ea: EaLike): boolean => {
  return probeCapabilities(ea).updateScene
}

const hasElementMutationCapability = (ea: EaLike): boolean => {
  const caps = probeCapabilities(ea)
  return caps.legacy || caps.updateScene
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

const cloneElementForSceneMutation = (element: RawExcalidrawElement): RawExcalidrawElement => {
  const nextElement: RawExcalidrawElement = {
    ...element,
  }

  if (Array.isArray(element.groupIds)) {
    nextElement.groupIds = [...element.groupIds]
  }

  if (element.customData) {
    nextElement.customData = { ...element.customData }
  }

  return nextElement
}

const buildNextElementsForUpdateScene = (
  current: readonly RawExcalidrawElement[],
  patch: ScenePatch,
): readonly RawExcalidrawElement[] | null => {
  const patchById = new Map(patch.elementPatches.map((entry) => [entry.id, entry]))
  let appliedPatchCount = 0

  const patchedElements = current.map((element) => {
    const nextElement = cloneElementForSceneMutation(element)
    const elementPatch = patchById.get(element.id)
    if (!elementPatch) {
      return nextElement
    }

    appliedPatchCount += 1
    patchElementProperties(nextElement, elementPatch)
    return nextElement
  })

  if (appliedPatchCount !== patch.elementPatches.length) {
    return null
  }

  if (!patch.reorder) {
    return patchedElements
  }

  const byId = new Map(patchedElements.map((element) => [element.id, element]))
  const orderedElements = patch.reorder.orderedElementIds
    .map((id) => byId.get(id))
    .filter((element): element is RawExcalidrawElement => Boolean(element))

  if (orderedElements.length !== patchedElements.length) {
    return null
  }

  return orderedElements
}

const applyPatchViaUpdateScene = (ea: EaLike, patch: ScenePatch): boolean => {
  ensureTargetView(ea)

  const api = ea.getExcalidrawAPI?.()
  const current = readViewElements(ea)
  if (!api?.updateScene) {
    return false
  }

  const nextElements = buildNextElementsForUpdateScene(current, patch)
  if (!nextElements) {
    return false
  }

  try {
    api.updateScene({ elements: [...nextElements] })
    return true
  } catch {
    return false
  }
}

const applyElementPatchesViaUpdateScene = (ea: EaLike, patch: ScenePatch): boolean => {
  return applyPatchViaUpdateScene(ea, patch)
}

interface ElementPatchApplyResult {
  readonly ok: boolean
}

const applyElementPatches = async (
  ea: EaLike,
  patch: ScenePatch,
): Promise<ElementPatchApplyResult> => {
  if (patch.elementPatches.length === 0) {
    return {
      ok: true,
    }
  }

  if (hasLegacyElementMutationCapabilities(ea)) {
    const legacyApplied = await applyElementPatchesViaLegacyEditing(ea, patch)
    if (legacyApplied) {
      return {
        ok: true,
      }
    }
  }

  if (hasUpdateSceneCapability(ea)) {
    return {
      ok: applyElementPatchesViaUpdateScene(ea, patch),
    }
  }

  return {
    ok: false,
  }
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

  if (patch.reorder) {
    const patchApplied = applyPatchViaUpdateScene(ea, patch)
    if (!patchApplied) {
      return {
        status: "preflightFailed",
        reason: "Patch apply failed before commit due to scene mismatch.",
      }
    }
  } else {
    const elementApply = await applyElementPatches(ea, patch)
    if (!elementApply.ok) {
      return {
        status: "preflightFailed",
        reason: "Element patch apply failed due to scene mismatch.",
      }
    }
  }

  if (patch.selectIds && ea.selectElementsInView) {
    ea.selectElementsInView([...patch.selectIds])
  }

  return {
    status: "applied",
  }
}
