import type {
  SidepanelHostContextShellState,
  SidepanelHostViewContextHost,
  SidepanelHostViewObservation,
} from "./hostViewContext.js"
import {
  observeHostViewContext,
  resolveHostViewContextKeyFromObservation,
  resolveHostViewContextShellStateFromObservation,
  shouldRebindHostViewToActiveWorkspaceView,
} from "./hostViewContext.js"

export type SidepanelSceneRefSource = "legacy-host" | "target-view" | "active-leaf"

export interface SidepanelSceneRef {
  readonly source: SidepanelSceneRefSource
  readonly key: string
  readonly filePath: string | null
  readonly viewIdentity: string | null
  readonly leafIdentity: string | null
  readonly viewType: string | null
}

export interface SidepanelSceneBinding {
  readonly source: SidepanelSceneRefSource | "none"
  readonly sceneRef: SidepanelSceneRef | null
  readonly sceneKey: string
  readonly refreshKey: string
  readonly state: SidepanelHostContextShellState
  readonly shouldAttemptRebind: boolean
}

const createSceneRef = (input: SidepanelSceneRef): SidepanelSceneRef => {
  return input
}

export const resolveSceneRefFromObservation = (
  observation: SidepanelHostViewObservation,
): SidepanelSceneRef | null => {
  const { description } = observation
  const key = resolveHostViewContextKeyFromObservation(observation)
  const state = resolveHostViewContextShellStateFromObservation(observation)

  if (!observation.hasExplicitTargetViewProperty) {
    return createSceneRef({
      source: "legacy-host",
      key,
      filePath: description.activeFilePath,
      viewIdentity: description.targetViewIdentity ?? description.activeFilePath,
      leafIdentity: description.activeWorkspaceLeafIdentity,
      viewType: description.activeWorkspaceViewType,
    })
  }

  if (state === "live" && description.targetViewUsable) {
    return createSceneRef({
      source: "target-view",
      key,
      filePath: description.targetViewFilePath,
      viewIdentity: description.targetViewIdentity,
      leafIdentity: description.activeWorkspaceLeafIdentity,
      viewType: description.activeWorkspaceViewType,
    })
  }

  if (
    description.activeFilePath ||
    description.activeWorkspaceLeafIdentity ||
    description.activeWorkspaceViewType
  ) {
    return createSceneRef({
      source: "active-leaf",
      key,
      filePath: description.activeFilePath,
      viewIdentity:
        description.activeWorkspaceLeafIdentity ??
        description.activeWorkspaceViewType ??
        description.activeFilePath,
      leafIdentity: description.activeWorkspaceLeafIdentity,
      viewType: description.activeWorkspaceViewType,
    })
  }

  return null
}

export const resolveSceneBindingFromObservation = (input: {
  readonly observation: SidepanelHostViewObservation
  readonly state: SidepanelHostContextShellState
  readonly shouldAttemptRebind: boolean
}): SidepanelSceneBinding => {
  const sceneRef = resolveSceneRefFromObservation(input.observation)
  const sceneKey = sceneRef?.key ?? resolveHostViewContextKeyFromObservation(input.observation)

  return {
    source: sceneRef?.source ?? "none",
    sceneRef,
    sceneKey,
    refreshKey: `${sceneKey}::state:${input.state}::rebind:${input.shouldAttemptRebind ? "yes" : "no"}`,
    state: input.state,
    shouldAttemptRebind: input.shouldAttemptRebind,
  }
}

export const resolveSceneBindingFromHost = (
  host: SidepanelHostViewContextHost,
): SidepanelSceneBinding => {
  const observation = observeHostViewContext(host)

  return resolveSceneBindingFromObservation({
    observation,
    state: resolveHostViewContextShellStateFromObservation(observation),
    shouldAttemptRebind: shouldRebindHostViewToActiveWorkspaceView(host),
  })
}

export const haveSameSceneBindingRefreshKey = (
  left: SidepanelSceneBinding | null | undefined,
  right: SidepanelSceneBinding | null | undefined,
): boolean => {
  if (!left || !right) {
    return left === right
  }

  return left.refreshKey === right.refreshKey
}

export const canMirrorSelectionToSceneBinding = (binding: SidepanelSceneBinding): boolean => {
  if (binding.state !== "live" || binding.shouldAttemptRebind) {
    return false
  }

  return binding.source === "legacy-host" || binding.source === "target-view"
}
