import type {
  ObsidianAppLike,
  ObsidianLike,
  WorkspaceLike,
} from "../../../adapter/excalidraw-types.js"
import { traceHostContextLifecycleEvent } from "./hostContextFlightRecorder.js"

export interface SidepanelHostViewContextHost {
  readonly targetView?: unknown | null
  readonly setView?: (view?: unknown, reveal?: boolean) => unknown
  readonly app?: ObsidianAppLike
  readonly obsidian?: Pick<ObsidianLike, "app">
}

export interface SidepanelHostViewContextDescription {
  readonly hasTargetView: boolean
  readonly targetViewLoaded: boolean | null
  readonly targetViewUsable: boolean
  readonly targetViewIdentity: string | null
  readonly targetViewFilePath: string | null
  readonly targetViewMetadataAvailable: boolean
  readonly targetViewExcalidrawPlugin: string | null
  readonly targetViewExcalidrawCapable: boolean | null
  readonly activeFilePath: string | null
  readonly activeWorkspaceLeafIdentity: string | null
  readonly activeWorkspaceViewType: string | null
  readonly activeFileMetadataAvailable: boolean
  readonly activeFileExcalidrawPlugin: string | null
  readonly activeFileExcalidrawCapable: boolean | null
  readonly hostEligible: boolean
  readonly hasSetView: boolean
}

export type SidepanelHostContextShellState = "live" | "inactive" | "unbound"

export interface SidepanelHostViewObservation {
  readonly hasExplicitTargetViewProperty: boolean
  readonly targetView: unknown | null
  readonly description: SidepanelHostViewContextDescription
}

export interface SidepanelHostViewContextEnsureResult {
  readonly ok: boolean
  readonly rebound: boolean
}

const EXCALIDRAW_FRONTMATTER_KEY = "excalidraw-plugin"
const EXCALIDRAW_FRONTMATTER_VALUE = "parsed"

const VIEW_BIND_STRATEGIES: readonly {
  readonly viewArg: unknown
  readonly reveal: boolean
}[] = [
  { viewArg: "active", reveal: false },
  { viewArg: undefined, reveal: false },
  { viewArg: "active", reveal: true },
  { viewArg: undefined, reveal: true },
]

const invokeHostSetView = (
  host: SidepanelHostViewContextHost,
  viewArg: unknown,
  reveal: boolean,
): unknown => {
  const setView = host.setView
  if (!setView) {
    return null
  }

  return setView.call(host, viewArg, reveal)
}

export const hasExplicitTargetViewProperty = (host: SidepanelHostViewContextHost): boolean => {
  return Object.prototype.hasOwnProperty.call(host, "targetView")
}

export const getCurrentHostTargetView = (host: SidepanelHostViewContextHost): unknown => {
  return host.targetView ?? null
}

export const isUsableTargetView = (value: unknown): boolean => {
  if (!value || typeof value !== "object") {
    return false
  }

  const record = value as Record<string, unknown>
  if ("_loaded" in record) {
    return record["_loaded"] === true
  }

  return true
}

const resolveTargetViewFile = (targetView: unknown): Record<string, unknown> | null => {
  if (!targetView || typeof targetView !== "object") {
    return null
  }

  const fileCandidate = (targetView as Record<string, unknown>)["file"]
  return fileCandidate && typeof fileCandidate === "object"
    ? (fileCandidate as Record<string, unknown>)
    : null
}

const resolveTargetViewFilePath = (targetView: unknown): string | null => {
  const file = resolveTargetViewFile(targetView)
  return typeof file?.["path"] === "string" ? (file["path"] as string) : null
}

const normalizeIdentityToken = (value: unknown): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  return typeof value === "number" && Number.isFinite(value) ? `${value}` : null
}

export const resolveTargetViewIdentity = (targetView: unknown): string | null => {
  if (!targetView || typeof targetView !== "object") {
    return null
  }

  const record = targetView as Record<string, unknown>
  const leafRecord =
    record["leaf"] && typeof record["leaf"] === "object"
      ? (record["leaf"] as Record<string, unknown>)
      : null

  const identityCandidates = [
    record["id"],
    record["viewId"],
    record["leafId"],
    record["workspaceLeafId"],
    leafRecord?.["id"],
  ]

  for (const candidate of identityCandidates) {
    const identityToken = normalizeIdentityToken(candidate)
    if (identityToken) {
      return identityToken
    }
  }

  return null
}

const resolveMetadataApp = (
  host: SidepanelHostViewContextHost,
  targetView: unknown,
): ObsidianAppLike | null => {
  const targetViewRecord =
    targetView && typeof targetView === "object" ? (targetView as Record<string, unknown>) : null

  const candidates = [
    targetViewRecord?.["app"],
    host.app,
    host.obsidian?.app,
    (globalThis as Record<string, unknown>)["app"],
    (globalThis as { window?: { app?: unknown } }).window?.app,
    (globalThis as { obsidian?: { app?: unknown } }).obsidian?.app,
  ]

  for (const candidate of candidates) {
    if (candidate && typeof candidate === "object") {
      return candidate as ObsidianAppLike
    }
  }

  return null
}

const resolveFileExcalidrawMetadata = (
  app: ObsidianAppLike | null,
  file: unknown,
): {
  readonly available: boolean
  readonly value: string | null
} => {
  if (!file) {
    return {
      available: false,
      value: null,
    }
  }

  const getFileCache = app?.metadataCache?.getFileCache
  if (!getFileCache) {
    return {
      available: false,
      value: null,
    }
  }

  try {
    const fileCache = getFileCache(file)
    const frontmatter = fileCache?.frontmatter
    const excalidrawPluginValue = frontmatter?.[EXCALIDRAW_FRONTMATTER_KEY]

    return {
      available: true,
      value: typeof excalidrawPluginValue === "string" ? excalidrawPluginValue : null,
    }
  } catch {
    return {
      available: false,
      value: null,
    }
  }
}

const resolveTargetViewExcalidrawMetadata = (
  host: SidepanelHostViewContextHost,
  targetView: unknown,
): {
  readonly available: boolean
  readonly value: string | null
} => {
  return resolveFileExcalidrawMetadata(
    resolveMetadataApp(host, targetView),
    resolveTargetViewFile(targetView),
  )
}

const resolveWorkspace = (
  host: SidepanelHostViewContextHost,
  targetView: unknown,
): WorkspaceLike | null => {
  return resolveMetadataApp(host, targetView)?.workspace ?? null
}

const normalizeFilePath = (file: unknown): string | null => {
  if (typeof file === "string") {
    const trimmed = file.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  if (!file || typeof file !== "object") {
    return null
  }

  return typeof (file as Record<string, unknown>)["path"] === "string"
    ? ((file as Record<string, unknown>)["path"] as string)
    : null
}

const normalizeFileLike = (file: unknown): unknown | null => {
  if (file && typeof file === "object") {
    return file
  }

  const path = normalizeFilePath(file)
  return path ? { path } : null
}

const resolveActiveWorkspaceLeaf = (
  host: SidepanelHostViewContextHost,
  targetView: unknown,
): Record<string, unknown> | null => {
  const workspace = resolveWorkspace(host, targetView) as
    | (WorkspaceLike & {
        activeLeaf?: unknown
        getMostRecentLeaf?: () => unknown
      })
    | null

  if (!workspace) {
    return null
  }

  const leafCandidates = [workspace.activeLeaf]

  if (typeof workspace.getMostRecentLeaf === "function") {
    try {
      leafCandidates.push(workspace.getMostRecentLeaf())
    } catch {
      // no-op: best-effort active leaf probing only
    }
  }

  for (const candidate of leafCandidates) {
    if (candidate && typeof candidate === "object") {
      return candidate as Record<string, unknown>
    }
  }

  return null
}

const resolveActiveWorkspaceLeafFile = (
  host: SidepanelHostViewContextHost,
  targetView: unknown,
): unknown | null => {
  const activeLeaf = resolveActiveWorkspaceLeaf(host, targetView)
  if (!activeLeaf) {
    return null
  }

  const viewRecord =
    activeLeaf["view"] && typeof activeLeaf["view"] === "object"
      ? (activeLeaf["view"] as Record<string, unknown>)
      : null

  const directCandidates = [viewRecord?.["file"], activeLeaf["file"]]
  for (const candidate of directCandidates) {
    const normalizedCandidate = normalizeFileLike(candidate)
    if (normalizedCandidate) {
      return normalizedCandidate
    }
  }

  const methodCandidates: readonly {
    readonly owner: Record<string, unknown>
    readonly getFile: unknown
  }[] = [
    { owner: activeLeaf, getFile: activeLeaf["getFile"] },
    ...(viewRecord ? [{ owner: viewRecord, getFile: viewRecord["getFile"] }] : []),
  ]

  for (const candidate of methodCandidates) {
    if (typeof candidate.getFile !== "function") {
      continue
    }

    try {
      const resolvedFile = normalizeFileLike(candidate.getFile.call(candidate.owner))
      if (resolvedFile) {
        return resolvedFile
      }
    } catch {
      // no-op: best-effort active leaf file probing only
    }
  }

  return null
}

const resolveActiveWorkspaceFile = (
  host: SidepanelHostViewContextHost,
  targetView: unknown,
): unknown | null => {
  const getActiveFile = resolveWorkspace(host, targetView)?.getActiveFile
  if (getActiveFile) {
    try {
      const activeFile = normalizeFileLike(getActiveFile())
      if (activeFile) {
        return activeFile
      }
    } catch {
      // no-op: fall through to active-leaf file probing
    }
  }

  return resolveActiveWorkspaceLeafFile(host, targetView)
}

const resolveActiveWorkspaceFilePath = (
  host: SidepanelHostViewContextHost,
  targetView: unknown,
): string | null => {
  return normalizeFilePath(resolveActiveWorkspaceFile(host, targetView))
}

const resolveActiveWorkspaceLeafIdentity = (
  host: SidepanelHostViewContextHost,
  targetView: unknown,
): string | null => {
  const activeLeaf = resolveActiveWorkspaceLeaf(host, targetView)
  if (!activeLeaf) {
    return null
  }

  const viewRecord =
    activeLeaf["view"] && typeof activeLeaf["view"] === "object"
      ? (activeLeaf["view"] as Record<string, unknown>)
      : null

  const identityCandidates = [
    activeLeaf["id"],
    activeLeaf["leafId"],
    activeLeaf["workspaceLeafId"],
    viewRecord?.["leafId"],
  ]

  for (const candidate of identityCandidates) {
    const identityToken = normalizeIdentityToken(candidate)
    if (identityToken) {
      return identityToken
    }
  }

  return null
}

const resolveActiveWorkspaceViewType = (
  host: SidepanelHostViewContextHost,
  targetView: unknown,
): string | null => {
  const activeLeaf = resolveActiveWorkspaceLeaf(host, targetView)
  if (!activeLeaf) {
    return null
  }

  const viewRecord =
    activeLeaf["view"] && typeof activeLeaf["view"] === "object"
      ? (activeLeaf["view"] as Record<string, unknown>)
      : null

  const directViewType = normalizeIdentityToken(viewRecord?.["viewType"])
  if (directViewType) {
    return directViewType
  }

  const getViewType = viewRecord?.["getViewType"]
  if (typeof getViewType === "function") {
    try {
      return normalizeIdentityToken(getViewType.call(viewRecord))
    } catch {
      // no-op: best-effort active leaf probing only
    }
  }

  return null
}

const isExcalidrawCapableMetadataValue = (value: string | null): boolean => {
  return value?.trim().toLowerCase() === EXCALIDRAW_FRONTMATTER_VALUE
}

const resolveHostViewContextDescription = (
  host: SidepanelHostViewContextHost,
  targetView: unknown = getCurrentHostTargetView(host),
): SidepanelHostViewContextDescription => {
  const targetViewLoaded =
    targetView &&
    typeof targetView === "object" &&
    "_loaded" in (targetView as Record<string, unknown>)
      ? (targetView as Record<string, unknown>)["_loaded"] === true
      : null
  const targetViewUsable = isUsableTargetView(targetView)
  const targetViewIdentity = resolveTargetViewIdentity(targetView)
  const targetViewMetadata = resolveTargetViewExcalidrawMetadata(host, targetView)
  const targetViewExcalidrawCapable = targetViewMetadata.available
    ? isExcalidrawCapableMetadataValue(targetViewMetadata.value)
    : null
  const activeFile = resolveActiveWorkspaceFile(host, targetView)
  const activeWorkspaceLeafIdentity = resolveActiveWorkspaceLeafIdentity(host, targetView)
  const activeWorkspaceViewType = resolveActiveWorkspaceViewType(host, targetView)
  const activeFileMetadata = resolveFileExcalidrawMetadata(
    resolveMetadataApp(host, targetView),
    activeFile,
  )
  const activeFileExcalidrawCapable = activeFileMetadata.available
    ? isExcalidrawCapableMetadataValue(activeFileMetadata.value)
    : null
  const legacyHostWithoutTargetViewProperty = !hasExplicitTargetViewProperty(host)
  const effectiveExcalidrawCapable = activeFileMetadata.available
    ? activeFileExcalidrawCapable
    : targetViewExcalidrawCapable

  return {
    hasTargetView: targetView !== null,
    targetViewLoaded,
    targetViewUsable,
    targetViewIdentity,
    targetViewFilePath: resolveTargetViewFilePath(targetView),
    targetViewMetadataAvailable: targetViewMetadata.available,
    targetViewExcalidrawPlugin: targetViewMetadata.value,
    targetViewExcalidrawCapable,
    activeFilePath: resolveActiveWorkspaceFilePath(host, targetView),
    activeWorkspaceLeafIdentity,
    activeWorkspaceViewType,
    activeFileMetadataAvailable: activeFileMetadata.available,
    activeFileExcalidrawPlugin: activeFileMetadata.value,
    activeFileExcalidrawCapable,
    hostEligible: legacyHostWithoutTargetViewProperty
      ? true
      : targetViewUsable && (effectiveExcalidrawCapable ?? true),
    hasSetView: typeof host.setView === "function",
  }
}

export const observeHostViewContext = (
  host: SidepanelHostViewContextHost,
): SidepanelHostViewObservation => {
  const targetView = getCurrentHostTargetView(host)

  return {
    hasExplicitTargetViewProperty: hasExplicitTargetViewProperty(host),
    targetView,
    description: resolveHostViewContextDescription(host, targetView),
  }
}

export const describeHostViewContext = (
  host: SidepanelHostViewContextHost,
): SidepanelHostViewContextDescription => {
  return observeHostViewContext(host).description
}

export const resolveHostViewContextShellStateFromObservation = (
  observation: SidepanelHostViewObservation,
): SidepanelHostContextShellState => {
  const { description } = observation

  if (!observation.hasExplicitTargetViewProperty) {
    return "live"
  }

  if (description.hostEligible) {
    return "live"
  }

  if (
    description.activeFileMetadataAvailable &&
    description.activeFileExcalidrawCapable === false
  ) {
    return "inactive"
  }

  if (
    description.targetViewMetadataAvailable &&
    description.targetViewExcalidrawCapable === false
  ) {
    return "inactive"
  }

  return "unbound"
}

const resolveHostViewContextEligibilityKey = (
  description: SidepanelHostViewContextDescription,
): string => {
  return description.activeFileMetadataAvailable
    ? description.activeFileExcalidrawCapable
      ? "eligible"
      : "ineligible"
    : description.targetViewMetadataAvailable
      ? description.targetViewExcalidrawCapable
        ? "eligible"
        : "ineligible"
      : "legacy"
}

const resolveTargetViewSceneKey = (description: SidepanelHostViewContextDescription): string => {
  const targetFileKey = description.targetViewFilePath
    ? `file:${description.targetViewFilePath}`
    : "file:none"
  const targetViewIdentityKey = description.targetViewIdentity
    ? `view:${description.targetViewIdentity}`
    : "view:none"

  return `scene:target-view::${targetFileKey}::${targetViewIdentityKey}`
}

const resolveActiveLeafFallbackSceneKey = (
  description: SidepanelHostViewContextDescription,
): string | null => {
  if (
    !description.activeFilePath &&
    !description.activeWorkspaceLeafIdentity &&
    !description.activeWorkspaceViewType
  ) {
    return null
  }

  const activeFileKey = description.activeFilePath
    ? `file:${description.activeFilePath}`
    : "file:none"
  const activeLeafKey = description.activeWorkspaceLeafIdentity
    ? `leaf:${description.activeWorkspaceLeafIdentity}`
    : "leaf:none"
  const activeViewTypeKey = description.activeWorkspaceViewType
    ? `view-type:${description.activeWorkspaceViewType}`
    : "view-type:none"

  return `scene:active-leaf::${activeFileKey}::${activeLeafKey}::${activeViewTypeKey}`
}

export const resolveHostViewContextKeyFromObservation = (
  observation: SidepanelHostViewObservation,
): string => {
  if (!observation.hasExplicitTargetViewProperty) {
    return "target:legacy-host"
  }

  const { description } = observation

  if (description.targetViewUsable) {
    return resolveTargetViewSceneKey(description)
  }

  return (
    resolveActiveLeafFallbackSceneKey(description) ??
    `scene:none::eligibility:${resolveHostViewContextEligibilityKey(description)}`
  )
}

export const resolveHostViewContextKey = (host: SidepanelHostViewContextHost): string => {
  return resolveHostViewContextKeyFromObservation(observeHostViewContext(host))
}

const summarizeHostViewContextForDebug = (
  description: SidepanelHostViewContextDescription,
): Record<string, unknown> => {
  return {
    activeFilePath: description.activeFilePath,
    activeLeafIdentity: description.activeWorkspaceLeafIdentity,
    activeViewType: description.activeWorkspaceViewType,
    targetViewIdentity: description.targetViewIdentity,
    targetViewFilePath: description.targetViewFilePath,
    targetViewLoaded: description.targetViewLoaded,
    targetViewUsable: description.targetViewUsable,
    hostEligible: description.hostEligible,
    hasSetView: description.hasSetView,
  }
}

const renderViewBindStrategyLabel = (strategy: {
  readonly viewArg: unknown
  readonly reveal: boolean
}): string => {
  const viewArgLabel = strategy.viewArg === undefined ? "undefined" : `${strategy.viewArg}`
  return `${viewArgLabel}|reveal:${strategy.reveal}`
}

const normalizeWorkspaceViewType = (value: string | null): string | null => {
  const normalized = value?.trim().toLowerCase() ?? null
  return normalized && normalized.length > 0 ? normalized : null
}

const isDefinitelyNonRebindableActiveWorkspaceViewType = (value: string | null): boolean => {
  const normalizedViewType = normalizeWorkspaceViewType(value)
  return normalizedViewType !== null && normalizedViewType !== "excalidraw"
}

export const shouldRebindHostViewToActiveWorkspaceView = (
  host: SidepanelHostViewContextHost,
): boolean => {
  const { description } = observeHostViewContext(host)

  if (!description.hasSetView) {
    return false
  }

  if (isDefinitelyNonRebindableActiveWorkspaceViewType(description.activeWorkspaceViewType)) {
    return false
  }

  if (!description.targetViewUsable) {
    if (
      description.activeFileMetadataAvailable &&
      description.activeFileExcalidrawCapable === false
    ) {
      return false
    }

    return (
      normalizeWorkspaceViewType(description.activeWorkspaceViewType) === "excalidraw" ||
      description.activeFilePath !== null
    )
  }

  if (!description.activeFilePath) {
    return false
  }

  if (
    description.activeFileMetadataAvailable &&
    description.activeFileExcalidrawCapable === false
  ) {
    return false
  }

  return description.targetViewFilePath !== description.activeFilePath
}

export const bindHostViewToActiveWorkspaceView = (
  host: SidepanelHostViewContextHost,
): SidepanelHostViewContextEnsureResult => {
  const initialDescription = resolveHostViewContextDescription(host)

  if (!shouldRebindHostViewToActiveWorkspaceView(host)) {
    return {
      ok: true,
      rebound: false,
    }
  }

  traceHostContextLifecycleEvent("rebind", "host view rebind requested", {
    ...summarizeHostViewContextForDebug(initialDescription),
  })

  if (!host.setView) {
    traceHostContextLifecycleEvent("rebind", "host view rebind unavailable: host has no setView", {
      ...summarizeHostViewContextForDebug(initialDescription),
    })

    return {
      ok: !shouldRebindHostViewToActiveWorkspaceView(host),
      rebound: false,
    }
  }

  for (const strategy of VIEW_BIND_STRATEGIES) {
    const beforeDescription = resolveHostViewContextDescription(host)
    let threw = false
    let errorMessage: string | null = null

    try {
      invokeHostSetView(host, strategy.viewArg, strategy.reveal)
    } catch (error) {
      threw = true
      errorMessage = error instanceof Error ? error.message : `${error}`
    }

    const afterDescription = resolveHostViewContextDescription(host)
    const shouldAttemptRebindAfter = shouldRebindHostViewToActiveWorkspaceView(host)

    traceHostContextLifecycleEvent("rebind", "host view rebind strategy attempted", {
      strategy: renderViewBindStrategyLabel(strategy),
      threw,
      ...(errorMessage ? { errorMessage } : {}),
      before: summarizeHostViewContextForDebug(beforeDescription),
      after: summarizeHostViewContextForDebug(afterDescription),
      shouldAttemptRebindAfter,
    })

    if (!shouldAttemptRebindAfter) {
      traceHostContextLifecycleEvent("rebind", "host view rebind confirmed", {
        strategy: renderViewBindStrategyLabel(strategy),
        ...summarizeHostViewContextForDebug(afterDescription),
      })

      return {
        ok: true,
        rebound: true,
      }
    }
  }

  const finalDescription = resolveHostViewContextDescription(host)

  traceHostContextLifecycleEvent("rebind", "host view rebind exhausted without usable targetView", {
    initial: summarizeHostViewContextForDebug(initialDescription),
    final: summarizeHostViewContextForDebug(finalDescription),
  })

  return {
    ok: !shouldRebindHostViewToActiveWorkspaceView(host),
    rebound: false,
  }
}

export const resolveLiveExcalidrawApiFromTargetView = (targetView: unknown): unknown => {
  if (!targetView || typeof targetView !== "object") {
    return null
  }

  const record = targetView as Record<string, unknown>
  if ("_loaded" in record && record["_loaded"] !== true) {
    return null
  }

  return record["excalidrawAPI"] ?? null
}

export const ensureHostViewContextState = (
  host: SidepanelHostViewContextHost,
): SidepanelHostViewContextEnsureResult => {
  if (resolveHostViewContextDescription(host).hostEligible) {
    return {
      ok: true,
      rebound: false,
    }
  }

  if (!host.setView) {
    return {
      ok: resolveHostViewContextDescription(host).hostEligible,
      rebound: false,
    }
  }

  for (const strategy of VIEW_BIND_STRATEGIES) {
    try {
      invokeHostSetView(host, strategy.viewArg, strategy.reveal)
      if (resolveHostViewContextDescription(host).hostEligible) {
        return {
          ok: true,
          rebound: true,
        }
      }
    } catch {
      // keep trying fallback strategies
    }
  }

  return {
    ok: resolveHostViewContextDescription(host).hostEligible,
    rebound: false,
  }
}

export const ensureHostViewContext = (host: SidepanelHostViewContextHost): boolean => {
  return ensureHostViewContextState(host).ok
}
