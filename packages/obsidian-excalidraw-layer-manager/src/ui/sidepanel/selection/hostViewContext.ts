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
  readonly targetViewFilePath: string | null
  readonly targetViewMetadataAvailable: boolean
  readonly targetViewExcalidrawPlugin: string | null
  readonly targetViewExcalidrawCapable: boolean | null
  readonly activeFilePath: string | null
  readonly activeFileMetadataAvailable: boolean
  readonly activeFileExcalidrawPlugin: string | null
  readonly activeFileExcalidrawCapable: boolean | null
  readonly hostEligible: boolean
  readonly hasSetView: boolean
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

const hasExplicitTargetViewProperty = (host: SidepanelHostViewContextHost): boolean => {
  return Object.prototype.hasOwnProperty.call(host, "targetView")
}

const getCurrentHostTargetView = (host: SidepanelHostViewContextHost): unknown => {
  return host.targetView ?? null
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

const isExcalidrawCapableMetadataValue = (value: string | null): boolean => {
  return value?.trim().toLowerCase() === EXCALIDRAW_FRONTMATTER_VALUE
}

const resolveHostViewContextDescription = (
  host: SidepanelHostViewContextHost,
): SidepanelHostViewContextDescription => {
  const targetView = getCurrentHostTargetView(host)
  const targetViewLoaded =
    targetView &&
    typeof targetView === "object" &&
    "_loaded" in (targetView as Record<string, unknown>)
      ? (targetView as Record<string, unknown>)["_loaded"] === true
      : null
  const targetViewUsable = isUsableTargetView(targetView)
  const targetViewMetadata = resolveTargetViewExcalidrawMetadata(host, targetView)
  const targetViewExcalidrawCapable = targetViewMetadata.available
    ? isExcalidrawCapableMetadataValue(targetViewMetadata.value)
    : null
  const legacyHostWithoutTargetViewProperty = !hasExplicitTargetViewProperty(host)
  const shouldUseActiveFileDiagnostics = legacyHostWithoutTargetViewProperty || !targetViewUsable
  const activeFile = shouldUseActiveFileDiagnostics
    ? resolveActiveWorkspaceFile(host, targetView)
    : null
  const activeFileMetadata = shouldUseActiveFileDiagnostics
    ? resolveFileExcalidrawMetadata(resolveMetadataApp(host, targetView), activeFile)
    : {
        available: false,
        value: null,
      }
  const activeFileExcalidrawCapable = activeFileMetadata.available
    ? isExcalidrawCapableMetadataValue(activeFileMetadata.value)
    : null

  return {
    hasTargetView: targetView !== null,
    targetViewLoaded,
    targetViewUsable,
    targetViewFilePath: resolveTargetViewFilePath(targetView),
    targetViewMetadataAvailable: targetViewMetadata.available,
    targetViewExcalidrawPlugin: targetViewMetadata.value,
    targetViewExcalidrawCapable,
    activeFilePath: shouldUseActiveFileDiagnostics
      ? resolveActiveWorkspaceFilePath(host, targetView)
      : null,
    activeFileMetadataAvailable: activeFileMetadata.available,
    activeFileExcalidrawPlugin: activeFileMetadata.value,
    activeFileExcalidrawCapable,
    hostEligible: legacyHostWithoutTargetViewProperty
      ? true
      : targetViewUsable && (targetViewExcalidrawCapable ?? true),
    hasSetView: typeof host.setView === "function",
  }
}

export const describeHostViewContext = (
  host: SidepanelHostViewContextHost,
): SidepanelHostViewContextDescription => {
  return resolveHostViewContextDescription(host)
}

export const resolveHostViewContextKey = (host: SidepanelHostViewContextHost): string => {
  if (!hasExplicitTargetViewProperty(host)) {
    return "target:legacy-host"
  }

  const description = resolveHostViewContextDescription(host)
  if (!description.hasTargetView) {
    return "target:null::eligibility:unbound"
  }

  const targetKey = description.targetViewFilePath
    ? `target:file:${description.targetViewFilePath}`
    : "target:unknown-file"

  const eligibilityKey = description.targetViewMetadataAvailable
    ? description.targetViewExcalidrawCapable
      ? "eligible"
      : "ineligible"
    : "legacy"

  return `${targetKey}::eligibility:${eligibilityKey}`
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
