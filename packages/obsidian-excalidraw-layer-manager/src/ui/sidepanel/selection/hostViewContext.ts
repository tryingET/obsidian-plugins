import type {
  ObsidianAppLike,
  ObsidianLike,
  WorkspaceLike,
} from "../../../adapter/excalidraw-types.js"

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

const resolveActiveWorkspaceFile = (
  host: SidepanelHostViewContextHost,
  targetView: unknown,
): unknown | null => {
  const getActiveFile = resolveWorkspace(host, targetView)?.getActiveFile
  if (!getActiveFile) {
    return null
  }

  try {
    return getActiveFile() ?? null
  } catch {
    return null
  }
}

const resolveActiveWorkspaceFilePath = (
  host: SidepanelHostViewContextHost,
  targetView: unknown,
): string | null => {
  const file = resolveActiveWorkspaceFile(host, targetView)
  if (!file || typeof file !== "object") {
    return null
  }

  return typeof (file as Record<string, unknown>)["path"] === "string"
    ? ((file as Record<string, unknown>)["path"] as string)
    : null
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

export const resolveHostViewContextKeyFromObservation = (
  observation: SidepanelHostViewObservation,
): string => {
  if (!observation.hasExplicitTargetViewProperty) {
    return "target:legacy-host"
  }

  const { description } = observation
  const targetPresenceKey = description.hasTargetView ? "target:present" : "target:null"
  const targetFileKey = description.targetViewFilePath
    ? `target-file:${description.targetViewFilePath}`
    : "target-file:none"
  const targetViewIdentityKey = description.targetViewIdentity
    ? `view:${description.targetViewIdentity}`
    : "view:none"

  return `${targetPresenceKey}::${targetFileKey}::${targetViewIdentityKey}::eligibility:${resolveHostViewContextEligibilityKey(description)}`
}

export const resolveHostViewContextKey = (host: SidepanelHostViewContextHost): string => {
  return resolveHostViewContextKeyFromObservation(observeHostViewContext(host))
}

export const shouldRebindHostViewToActiveWorkspaceView = (
  host: SidepanelHostViewContextHost,
): boolean => {
  const { description } = observeHostViewContext(host)

  if (!description.hasSetView) {
    return false
  }

  if (!description.targetViewUsable) {
    return true
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
  if (!shouldRebindHostViewToActiveWorkspaceView(host)) {
    return {
      ok: true,
      rebound: false,
    }
  }

  const setView = host.setView
  if (!setView) {
    return {
      ok: !shouldRebindHostViewToActiveWorkspaceView(host),
      rebound: false,
    }
  }

  for (const strategy of VIEW_BIND_STRATEGIES) {
    try {
      setView(strategy.viewArg, strategy.reveal)
    } catch {
      // keep trying bounded active-view strategies
    }

    if (!shouldRebindHostViewToActiveWorkspaceView(host)) {
      return {
        ok: true,
        rebound: true,
      }
    }
  }

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

  const setView = host.setView
  if (!setView) {
    return {
      ok: resolveHostViewContextDescription(host).hostEligible,
      rebound: false,
    }
  }

  for (const strategy of VIEW_BIND_STRATEGIES) {
    try {
      setView(strategy.viewArg, strategy.reveal)
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
