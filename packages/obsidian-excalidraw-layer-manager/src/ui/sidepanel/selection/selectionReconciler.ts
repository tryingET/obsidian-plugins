import { collectUniqueSelectionIds, haveSameIds } from "./selectionIds.js"

type SelectionResolutionSource =
  | "noLiveSelectionApi"
  | "liveMatchesOverride"
  | "overrideWithoutBridgeFallback"
  | "snapshotPreferredOverEmptyLive"
  | "liveDiffersFromSnapshot"
  | "snapshotOrOverrideFallback"

interface SelectionElementLike {
  readonly id: string
}

interface SelectionReconcileInput<T extends SelectionElementLike> {
  readonly snapshotSelection: readonly string[]
  readonly selectionOverride: readonly string[] | null
  readonly getViewSelectedElements?: () => readonly T[]
  readonly hasSelectionBridge: boolean
  readonly ensureHostViewContext: () => boolean
}

interface SelectionReconcileResult {
  readonly source: SelectionResolutionSource
  readonly resolvedSelection: readonly string[]
  readonly clearSelectionOverride: boolean
  readonly readErrorMessage?: string
}

export const reconcileSelectedElementIds = <T extends SelectionElementLike>(
  input: SelectionReconcileInput<T>,
): SelectionReconcileResult => {
  if (!input.getViewSelectedElements) {
    return {
      source: "noLiveSelectionApi",
      resolvedSelection: input.selectionOverride ?? input.snapshotSelection,
      clearSelectionOverride: false,
    }
  }

  input.ensureHostViewContext()

  try {
    const liveSelection = collectUniqueSelectionIds(input.getViewSelectedElements() ?? [])

    if (input.selectionOverride && haveSameIds(liveSelection, input.selectionOverride)) {
      return {
        source: "liveMatchesOverride",
        resolvedSelection: liveSelection,
        clearSelectionOverride: false,
      }
    }

    if (input.selectionOverride && !input.hasSelectionBridge && liveSelection.length === 0) {
      return {
        source: "overrideWithoutBridgeFallback",
        resolvedSelection: input.selectionOverride,
        clearSelectionOverride: false,
      }
    }

    if (liveSelection.length === 0 && input.snapshotSelection.length > 0) {
      const hasStaleOverrideAgainstSnapshot =
        !!input.selectionOverride && !haveSameIds(input.selectionOverride, input.snapshotSelection)

      return {
        source: "snapshotPreferredOverEmptyLive",
        resolvedSelection: hasStaleOverrideAgainstSnapshot
          ? input.snapshotSelection
          : (input.selectionOverride ?? input.snapshotSelection),
        clearSelectionOverride: hasStaleOverrideAgainstSnapshot,
      }
    }

    if (!haveSameIds(liveSelection, input.snapshotSelection)) {
      return {
        source: "liveDiffersFromSnapshot",
        resolvedSelection: liveSelection,
        clearSelectionOverride: true,
      }
    }

    const hasStaleOverrideAgainstLive =
      !!input.selectionOverride && !haveSameIds(liveSelection, input.selectionOverride)

    if (hasStaleOverrideAgainstLive) {
      return {
        source: "snapshotOrOverrideFallback",
        resolvedSelection: liveSelection,
        clearSelectionOverride: true,
      }
    }
  } catch (error) {
    return {
      source: "snapshotOrOverrideFallback",
      resolvedSelection: input.selectionOverride ?? input.snapshotSelection,
      clearSelectionOverride: false,
      readErrorMessage: error instanceof Error ? error.message : "unknown",
    }
  }

  return {
    source: "snapshotOrOverrideFallback",
    resolvedSelection: input.selectionOverride ?? input.snapshotSelection,
    clearSelectionOverride: false,
  }
}
