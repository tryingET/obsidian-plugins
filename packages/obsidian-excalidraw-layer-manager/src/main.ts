import type { EaLike } from "./adapter/excalidraw-types.js"
import { applyPatch, readSnapshot } from "./adapter/excalidrawAdapter.js"
import type { CommandContext } from "./commands/context.js"
import { buildLayerTree } from "./domain/treeBuilder.js"
import { buildSceneIndexes } from "./model/indexes.js"
import type { ScenePatch } from "./model/patch.js"
import type { SceneSnapshot } from "./model/snapshot.js"
import {
  type LayerManagerCommandFacade,
  createLayerManagerCommandFacade,
} from "./runtime/commandFacade.js"
import type { CommandPlanner, ExecuteIntentOutcome } from "./runtime/intentExecution.js"
import { LayerManagerController } from "./ui/controller.js"
import { createExcalidrawSidepanelRenderer } from "./ui/excalidrawSidepanelRenderer.js"
import { ConsoleRenderer, type LayerManagerRenderer } from "./ui/renderer.js"

export type { CommandPlanner, ExecuteIntentOutcome } from "./runtime/intentExecution.js"

interface DeferredVoid {
  readonly promise: Promise<void>
  readonly resolve: () => void
}

const readSelectedIdsFromAppState = (appState: unknown): ReadonlySet<string> | null => {
  if (!appState || typeof appState !== "object") {
    return null
  }

  const selectedElementIdsCandidate = (appState as Record<string, unknown>)["selectedElementIds"]

  if (!selectedElementIdsCandidate) {
    return null
  }

  if (Array.isArray(selectedElementIdsCandidate)) {
    return new Set(
      selectedElementIdsCandidate.filter((entry): entry is string => typeof entry === "string"),
    )
  }

  if (selectedElementIdsCandidate instanceof Set) {
    return new Set(
      [...selectedElementIdsCandidate].filter(
        (entry): entry is string => typeof entry === "string",
      ),
    )
  }

  if (typeof selectedElementIdsCandidate !== "object") {
    return null
  }

  const selectedById = selectedElementIdsCandidate as Record<string, unknown>
  const ids = Object.keys(selectedById).filter((id) => selectedById[id] === true)
  return new Set(ids)
}

const createDeferredVoid = (): DeferredVoid => {
  let resolvePromise: (() => void) | null = null

  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve
  })

  return {
    promise,
    resolve: () => {
      resolvePromise?.()
      resolvePromise = null
    },
  }
}

export interface LayerManagerRuntime {
  refresh: () => void
  apply: (patch: ScenePatch) => Promise<void>
  executeIntent: (planner: CommandPlanner) => Promise<ExecuteIntentOutcome>
  getSnapshot: () => SceneSnapshot
  toggleExpanded: (nodeId: string) => void
  beginInteraction: () => void
  endInteraction: () => void
  withInteraction: <T>(operation: () => Promise<T> | T) => Promise<T>
  isInteractionActive: () => boolean
  commands: LayerManagerCommandFacade
}

export const createLayerManagerRuntime = (
  ea: EaLike,
  renderer: LayerManagerRenderer = createExcalidrawSidepanelRenderer(ea) ?? new ConsoleRenderer(),
): LayerManagerRuntime => {
  let snapshot = readSnapshot(ea)
  let mutationQueue: Promise<void> = Promise.resolve()

  let interactionDepth = 0
  let pendingRefreshWhileInteractive = false
  let interactionIdleDeferred: DeferredVoid | null = null
  let renderLatestSnapshot: () => void = () => {}

  const isInteractionActive = (): boolean => {
    return interactionDepth > 0
  }

  const waitForInteractionIdle = async (): Promise<void> => {
    if (!isInteractionActive()) {
      return
    }

    if (!interactionIdleDeferred) {
      interactionIdleDeferred = createDeferredVoid()
    }

    await interactionIdleDeferred.promise
  }

  const beginInteraction = (): void => {
    interactionDepth += 1
    pendingRefreshWhileInteractive = true

    if (!interactionIdleDeferred) {
      interactionIdleDeferred = createDeferredVoid()
    }
  }

  const endInteraction = (): void => {
    if (interactionDepth === 0) {
      return
    }

    interactionDepth -= 1
    if (interactionDepth > 0) {
      return
    }

    if (pendingRefreshWhileInteractive) {
      pendingRefreshWhileInteractive = false
      renderLatestSnapshot()
    }

    interactionIdleDeferred?.resolve()
    interactionIdleDeferred = null
  }

  const withInteraction = async <T>(operation: () => Promise<T> | T): Promise<T> => {
    beginInteraction()

    try {
      return await operation()
    } finally {
      endInteraction()
    }
  }

  const controller = new LayerManagerController(renderer, undefined, {
    waitForIdle: waitForInteractionIdle,
    beginInteraction,
    endInteraction,
  })

  let selectedIdsHintFromOnChange: ReadonlySet<string> | null = null

  const renderSnapshot = (nextSnapshot: SceneSnapshot): void => {
    const elementIds = new Set(nextSnapshot.elements.map((element) => element.id))

    const resolvedSelectedIds = selectedIdsHintFromOnChange
      ? new Set([...selectedIdsHintFromOnChange].filter((id) => elementIds.has(id)))
      : nextSnapshot.selectedIds

    snapshot = {
      ...nextSnapshot,
      selectedIds: resolvedSelectedIds,
    }

    const indexes = buildSceneIndexes(nextSnapshot)
    const tree = buildLayerTree(
      {
        elements: nextSnapshot.elements,
        expandedNodeIds: controller.getExpandedNodeIds(),
        groupFreedraw: nextSnapshot.settings.groupFreedraw,
      },
      indexes,
    )

    const elementStateById = new Map(
      nextSnapshot.elements.map(
        (element) =>
          [
            element.id,
            {
              opacity: element.opacity,
              locked: element.locked,
            },
          ] as const,
      ),
    )

    controller.setTree(tree, nextSnapshot.version, resolvedSelectedIds, elementStateById)
  }

  renderLatestSnapshot = (): void => {
    renderSnapshot(readSnapshot(ea))
    subscribeToSceneChanges()
  }

  const refresh = (): void => {
    if (isInteractionActive()) {
      pendingRefreshWhileInteractive = true
      return
    }

    renderLatestSnapshot()
  }

  let externalRefreshQueued = false
  let subscribedSceneChangeApi: unknown = null

  const queueExternalRefresh = (): void => {
    if (externalRefreshQueued) {
      return
    }

    externalRefreshQueued = true
    Promise.resolve().then(() => {
      externalRefreshQueued = false
      refresh()
    })
  }

  const subscribeToSceneChanges = (): void => {
    let api: unknown

    try {
      api = ea.getExcalidrawAPI?.()
    } catch {
      return
    }

    if (!api || api === subscribedSceneChangeApi) {
      return
    }

    const onChange = (
      api as {
        readonly onChange?: (
          callback: (elements: readonly unknown[], appState: unknown, files: unknown) => void,
        ) => unknown
      }
    ).onChange

    if (!onChange) {
      return
    }

    try {
      onChange((_elements, appState) => {
        selectedIdsHintFromOnChange = readSelectedIdsFromAppState(appState)
        queueExternalRefresh()
      })
      subscribedSceneChangeApi = api
    } catch {
      // no-op: host may expose a partial API without change subscriptions
    }
  }

  const runSerializedMutation = async <T>(operation: () => Promise<T>): Promise<T> => {
    const scheduled = mutationQueue.then(operation, operation)
    mutationQueue = scheduled.then(
      () => undefined,
      () => undefined,
    )

    return scheduled
  }

  const runInteractionAwareMutation = async <T>(operation: () => Promise<T>): Promise<T> => {
    return runSerializedMutation(async () => {
      await waitForInteractionIdle()
      return operation()
    })
  }

  const apply = async (patch: ScenePatch): Promise<void> => {
    await runInteractionAwareMutation(async () => {
      await applyPatch(ea, patch)
      refresh()
    })
  }

  const executeIntent = async (planner: CommandPlanner): Promise<ExecuteIntentOutcome> => {
    // Canonical write path owner:
    // read snapshot -> build indexes -> plan command -> adapter preflight/apply -> refresh.
    return runInteractionAwareMutation(async () => {
      let attempts = 0

      while (attempts < 2) {
        attempts += 1
        const attempt = attempts as 1 | 2

        const planningSnapshot = readSnapshot(ea)
        const planningContext: CommandContext = {
          snapshot: planningSnapshot,
          indexes: buildSceneIndexes(planningSnapshot),
        }

        const planned = planner(planningContext)
        if (!planned.ok) {
          refresh()
          return {
            status: "plannerError",
            error: planned.error,
            attempts: attempt,
          }
        }

        const applyOutcome = await applyPatch(ea, planned.value)
        if (applyOutcome.status === "applied") {
          refresh()
          return {
            status: "applied",
            attempts: attempt,
          }
        }

        if (applyOutcome.status === "preflightFailed" && attempts < 2) {
          refresh()
          continue
        }

        refresh()
        return {
          status: applyOutcome.status,
          reason: applyOutcome.reason,
          attempts: attempt,
        }
      }

      refresh()
      return {
        status: "preflightFailed",
        reason: "Patch preflight failed after bounded retry.",
        attempts: 2,
      }
    })
  }

  const commands = createLayerManagerCommandFacade({
    executeIntent,
    notify: (message) => {
      controller.notify(message)
    },
  })

  controller.setCommandFacade(commands)

  const toggleExpanded = (nodeId: string): void => {
    controller.toggleExpanded(nodeId)
    refresh()
  }

  refresh()

  return {
    refresh,
    apply,
    executeIntent,
    getSnapshot: () => snapshot,
    toggleExpanded,
    beginInteraction,
    endInteraction,
    withInteraction,
    isInteractionActive,
    commands,
  }
}

type RuntimeGlobal = typeof globalThis & {
  excalidrawLayerManagerRuntime?: LayerManagerRuntime
}

declare const ea: EaLike | undefined

const runtimeGlobal = globalThis as RuntimeGlobal
const isLifecycleDebugEnabled =
  (runtimeGlobal as Record<string, unknown>)["LMX_DEBUG_SIDEPANEL_LIFECYCLE"] === true

const resolveScriptEa = (): EaLike | undefined => {
  if (typeof ea !== "undefined" && ea) {
    return ea
  }

  const globalEa = (globalThis as { readonly ea?: EaLike }).ea
  if (globalEa) {
    return globalEa
  }

  return undefined
}

const scriptEa = resolveScriptEa()
if (scriptEa) {
  if (isLifecycleDebugEnabled) {
    const Notice = scriptEa.obsidian?.Notice
    if (Notice) {
      new Notice("[LMX] LayerManager script executed.", 2200)
    }

    const targetViewRecord = (scriptEa as Record<string, unknown>)["targetView"] as
      | Record<string, unknown>
      | undefined

    console.log("[LMX] LayerManager script executed.")
    console.log("[LMX] EA pre-runtime context", {
      targetLoaded: targetViewRecord?.["_loaded"] === true,
      targetPath: (targetViewRecord?.["file"] as { path?: string } | undefined)?.path,
      hasSetView: typeof scriptEa.setView === "function",
    })
  }

  runtimeGlobal.excalidrawLayerManagerRuntime = createLayerManagerRuntime(scriptEa)
} else if (isLifecycleDebugEnabled) {
  console.log(
    "[LMX] No active Excalidraw context (ea missing). Open an Excalidraw drawing and rerun LayerManager.",
  )
}
