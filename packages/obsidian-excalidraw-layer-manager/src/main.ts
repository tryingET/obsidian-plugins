import type { EaLike } from "./adapter/excalidraw-types.js"
import { readSnapshot } from "./adapter/excalidrawAdapter.js"
import { buildLayerTree } from "./domain/treeBuilder.js"
import { buildSceneIndexes } from "./model/indexes.js"
import type { ScenePatch } from "./model/patch.js"
import type { SceneSnapshot } from "./model/snapshot.js"
import {
  type LayerManagerCommandFacade,
  createLayerManagerCommandFacade,
} from "./runtime/commandFacade.js"
import type { CommandPlanner, ExecuteIntentOutcome } from "./runtime/intentExecution.js"
import { createRuntimeLifecycleActor } from "./runtime/runtimeLifecycleMachine.js"
import { LayerManagerController } from "./ui/controller.js"
import { createExcalidrawSidepanelRenderer } from "./ui/excalidrawSidepanelRenderer.js"
import { ConsoleRenderer, type LayerManagerRenderer } from "./ui/renderer.js"

export type { CommandPlanner, ExecuteIntentOutcome } from "./runtime/intentExecution.js"

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

const toSceneChangeUnsubscribe = (value: unknown): (() => void) | null => {
  return typeof value === "function" ? (value as () => void) : null
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
  dispose: () => void
  commands: LayerManagerCommandFacade
}

export const createLayerManagerRuntime = (
  ea: EaLike,
  renderer: LayerManagerRenderer = createExcalidrawSidepanelRenderer(ea) ?? new ConsoleRenderer(),
): LayerManagerRuntime => {
  let snapshot = readSnapshot(ea)
  let renderLatestSnapshot: () => void = () => {}
  let disposed = false
  let sceneChangeUnsubscribe: (() => void) | null = null
  let subscribedSceneChangeApi: unknown = null
  let lifecycleActor: ReturnType<typeof createRuntimeLifecycleActor> | null = null

  const sendLifecycleEvent = (
    event:
      | { readonly type: "BEGIN_INTERACTION" }
      | { readonly type: "END_INTERACTION" }
      | { readonly type: "REFRESH_REQUEST" }
      | { readonly type: "SCENE_CHANGE_NOTICED" }
      | {
          readonly type: "APPLY_REQUEST"
          readonly patch: ScenePatch
          readonly resolve: () => void
          readonly reject: (error: unknown) => void
        }
      | {
          readonly type: "EXECUTE_INTENT_REQUEST"
          readonly planner: CommandPlanner
          readonly resolve: (outcome: ExecuteIntentOutcome) => void
          readonly reject: (error: unknown) => void
        }
      | { readonly type: "DISPOSE" },
  ): void => {
    if (disposed || !lifecycleActor) {
      return
    }

    lifecycleActor.send(event)
  }

  const isInteractionActive = (): boolean => {
    if (disposed || !lifecycleActor) {
      return false
    }

    return lifecycleActor.getSnapshot().context.interactionDepth > 0
  }

  const isInteractionLifecycleSettled = (): boolean => {
    if (!lifecycleActor) {
      return true
    }

    const lifecycleSnapshot = lifecycleActor.getSnapshot()

    if (lifecycleSnapshot.matches({ active: { lifecycle: "interacting" } })) {
      return false
    }

    if (lifecycleSnapshot.matches({ active: { lifecycle: "refreshing" } })) {
      return false
    }

    return (
      lifecycleSnapshot.context.interactionDepth === 0 &&
      !lifecycleSnapshot.context.pendingRefreshWhileInteractive &&
      !lifecycleSnapshot.context.refreshRequested
    )
  }

  const waitForInteractionIdle = async (): Promise<void> => {
    if (disposed || !lifecycleActor || isInteractionLifecycleSettled()) {
      return
    }

    await new Promise<void>((resolve) => {
      const actor = lifecycleActor
      if (!actor) {
        resolve()
        return
      }

      let resolved = false
      const subscription = actor.subscribe(() => {
        if (resolved || !isInteractionLifecycleSettled()) {
          return
        }

        resolved = true
        subscription.unsubscribe()
        resolve()
      })

      if (!resolved && isInteractionLifecycleSettled()) {
        resolved = true
        subscription.unsubscribe()
        resolve()
      }
    })
  }

  const beginInteraction = (): void => {
    sendLifecycleEvent({ type: "BEGIN_INTERACTION" })
  }

  const endInteraction = (): void => {
    sendLifecycleEvent({ type: "END_INTERACTION" })
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

  const clearSceneChangeSubscription = (): void => {
    try {
      sceneChangeUnsubscribe?.()
    } catch {
      // no-op: best-effort cleanup only
    }

    sceneChangeUnsubscribe = null
    subscribedSceneChangeApi = null
  }

  const subscribeToSceneChanges = (): void => {
    let api: unknown

    try {
      api = ea.getExcalidrawAPI?.()
    } catch {
      return
    }

    if (!api) {
      clearSceneChangeSubscription()
      return
    }

    if (api === subscribedSceneChangeApi) {
      return
    }

    clearSceneChangeSubscription()

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
      const unsubscribeCandidate = onChange((_elements, appState) => {
        selectedIdsHintFromOnChange = readSelectedIdsFromAppState(appState)
        sendLifecycleEvent({ type: "SCENE_CHANGE_NOTICED" })
      })
      sceneChangeUnsubscribe = toSceneChangeUnsubscribe(unsubscribeCandidate)
      subscribedSceneChangeApi = api
    } catch {
      // no-op: host may expose a partial API without change subscriptions
    }
  }

  renderLatestSnapshot = (): void => {
    if (disposed) {
      return
    }

    renderSnapshot(readSnapshot(ea))
    subscribeToSceneChanges()
  }

  lifecycleActor = createRuntimeLifecycleActor({
    ea,
    renderLatestSnapshot,
  })
  lifecycleActor.start()

  const refresh = (): void => {
    sendLifecycleEvent({ type: "REFRESH_REQUEST" })
  }

  const apply = async (patch: ScenePatch): Promise<void> => {
    if (disposed) {
      return
    }

    await new Promise<void>((resolve, reject) => {
      sendLifecycleEvent({
        type: "APPLY_REQUEST",
        patch,
        resolve,
        reject,
      })
    })
  }

  const executeIntent = async (planner: CommandPlanner): Promise<ExecuteIntentOutcome> => {
    if (disposed) {
      throw new Error("Layer Manager runtime disposed.")
    }

    // Canonical write path owner:
    // read snapshot -> build indexes -> plan command -> adapter preflight/apply -> refresh.
    return new Promise<ExecuteIntentOutcome>((resolve, reject) => {
      sendLifecycleEvent({
        type: "EXECUTE_INTENT_REQUEST",
        planner,
        resolve,
        reject,
      })
    })
  }

  const commands = createLayerManagerCommandFacade({
    executeIntent,
    notify: (message) => {
      controller.notify(message)
    },
  })

  const dispose = (): void => {
    if (disposed) {
      return
    }

    sendLifecycleEvent({ type: "DISPOSE" })
    lifecycleActor?.stop()
    lifecycleActor = null
    disposed = true
    clearSceneChangeSubscription()
    renderer.dispose?.()
    controller.dispose()
  }

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
    dispose,
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

  runtimeGlobal.excalidrawLayerManagerRuntime?.dispose?.()
  runtimeGlobal.excalidrawLayerManagerRuntime = createLayerManagerRuntime(scriptEa)
} else if (isLifecycleDebugEnabled) {
  console.log(
    "[LMX] No active Excalidraw context (ea missing). Open an Excalidraw drawing and rerun LayerManager.",
  )
}
