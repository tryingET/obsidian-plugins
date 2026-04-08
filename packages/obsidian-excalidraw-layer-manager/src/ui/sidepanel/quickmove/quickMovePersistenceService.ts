import type {
  ScriptSettingsLike,
  SidepanelSettingsWriteQueue,
} from "../settings/settingsWriteQueue.js"
import { type GroupReparentPreset, makePresetKey, makePresetLabel } from "./presetHelpers.js"

export type LastQuickMoveDestination =
  | {
      readonly kind: "root"
    }
  | {
      readonly kind: "preset"
      readonly preset: GroupReparentPreset
    }

type PersistedLastMoveDestinationPayload =
  | {
      readonly kind: "root"
    }
  | {
      readonly kind: "preset"
      readonly targetParentPath: readonly string[]
      readonly targetFrameId: string | null
      readonly label?: string
    }

interface SidepanelQuickMovePersistenceServiceInput {
  readonly getScriptSettings?: () => ScriptSettingsLike
  readonly settingsWriteQueue: SidepanelSettingsWriteQueue
}

const SETTING_KEY_PERSIST_LAST_MOVE = "lmx_persist_last_move_destination"
const SETTING_KEY_LAST_MOVE_DESTINATION = "lmx_last_move_destination"
const SETTING_DESC_PERSIST_LAST_MOVE =
  "Persist LayerManager quick-move destination across Obsidian restarts"
const SETTING_DESC_LAST_MOVE_DESTINATION = "LayerManager quick-move destination payload"
const RECENT_DESTINATION_LIMIT = 4

const toPersistedLastMovePayload = (
  destination: LastQuickMoveDestination,
): PersistedLastMoveDestinationPayload => {
  if (destination.kind === "root") {
    return {
      kind: "root",
    }
  }

  return {
    kind: "preset",
    targetParentPath: [...destination.preset.targetParentPath],
    targetFrameId: destination.preset.targetFrameId,
    label: destination.preset.label,
  }
}

const fromPersistedLastMovePayload = (value: unknown): LastQuickMoveDestination | null => {
  if (!value || typeof value !== "object") {
    return null
  }

  const payload = value as Record<string, unknown>
  const kind = payload["kind"]

  if (kind === "root") {
    return {
      kind: "root",
    }
  }

  if (kind !== "preset") {
    return null
  }

  const rawPath = payload["targetParentPath"]
  if (!Array.isArray(rawPath)) {
    return null
  }

  const targetParentPath = rawPath
    .filter((segment): segment is string => typeof segment === "string")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)

  if (targetParentPath.length === 0) {
    return {
      kind: "root",
    }
  }

  const rawTargetFrameId = payload["targetFrameId"]
  const targetFrameId = typeof rawTargetFrameId === "string" ? rawTargetFrameId : null

  const rawLabel = payload["label"]
  const label =
    typeof rawLabel === "string" && rawLabel.trim().length > 0
      ? rawLabel.trim()
      : makePresetLabel(targetParentPath)

  const preset: GroupReparentPreset = {
    key: makePresetKey(targetParentPath, targetFrameId),
    label,
    targetParentPath,
    targetFrameId,
  }

  return {
    kind: "preset",
    preset,
  }
}

const isSameDestination = (
  left: LastQuickMoveDestination,
  right: LastQuickMoveDestination,
): boolean => {
  if (left.kind === "root" || right.kind === "root") {
    return left.kind === right.kind
  }

  return left.preset.key === right.preset.key
}

export class SidepanelQuickMovePersistenceService {
  readonly #getScriptSettings: (() => ScriptSettingsLike) | undefined
  readonly #settingsWriteQueue: SidepanelSettingsWriteQueue

  #lastQuickMoveDestination: LastQuickMoveDestination | null = null
  #recentQuickMoveDestinations: LastQuickMoveDestination[] = []
  #persistLastMoveAcrossRestarts = false
  #didLoadLastMovePersistenceSettings = false

  constructor(input: SidepanelQuickMovePersistenceServiceInput) {
    this.#getScriptSettings = input.getScriptSettings
    this.#settingsWriteQueue = input.settingsWriteQueue
  }

  get canPersistSettings(): boolean {
    return !!this.#getScriptSettings && this.#settingsWriteQueue.canWrite
  }

  get lastQuickMoveDestination(): LastQuickMoveDestination | null {
    return this.#lastQuickMoveDestination
  }

  get recentQuickMoveDestinations(): readonly LastQuickMoveDestination[] {
    return this.#recentQuickMoveDestinations
  }

  get persistLastMoveAcrossRestarts(): boolean {
    return this.#persistLastMoveAcrossRestarts
  }

  loadFromSettingsOnce(): void {
    if (this.#didLoadLastMovePersistenceSettings) {
      return
    }

    this.#didLoadLastMovePersistenceSettings = true

    const settings = this.#getScriptSettings?.()
    if (!settings) {
      return
    }

    this.#persistLastMoveAcrossRestarts = settings[SETTING_KEY_PERSIST_LAST_MOVE]?.value === true

    if (!this.#persistLastMoveAcrossRestarts) {
      return
    }

    const persistedPayload = settings[SETTING_KEY_LAST_MOVE_DESTINATION]?.value
    const persistedDestination = fromPersistedLastMovePayload(persistedPayload)
    if (!persistedDestination) {
      return
    }

    this.#lastQuickMoveDestination = persistedDestination
    this.rememberRecentDestination(persistedDestination)
  }

  setPersistLastMoveAcrossRestarts(nextValue: boolean): void {
    this.#persistLastMoveAcrossRestarts = nextValue
    this.persistLastMovePersistencePreference()
  }

  setLastQuickMoveDestination(destination: LastQuickMoveDestination | null): void {
    this.#lastQuickMoveDestination = destination

    if (destination) {
      this.rememberRecentDestination(destination)
    }

    this.persistLastMoveDestinationIfEnabled()
  }

  private rememberRecentDestination(destination: LastQuickMoveDestination): void {
    const withoutDuplicate = this.#recentQuickMoveDestinations.filter(
      (existing) => !isSameDestination(existing, destination),
    )

    this.#recentQuickMoveDestinations = [destination, ...withoutDuplicate].slice(
      0,
      RECENT_DESTINATION_LIMIT,
    )
  }

  private persistLastMovePersistencePreference(): void {
    this.#settingsWriteQueue.enqueue((settings) => {
      settings[SETTING_KEY_PERSIST_LAST_MOVE] = {
        value: this.#persistLastMoveAcrossRestarts,
        description: SETTING_DESC_PERSIST_LAST_MOVE,
      }

      if (!this.#persistLastMoveAcrossRestarts || !this.#lastQuickMoveDestination) {
        settings[SETTING_KEY_LAST_MOVE_DESTINATION] = {
          value: null,
          description: SETTING_DESC_LAST_MOVE_DESTINATION,
        }
        return
      }

      settings[SETTING_KEY_LAST_MOVE_DESTINATION] = {
        value: toPersistedLastMovePayload(this.#lastQuickMoveDestination),
        description: SETTING_DESC_LAST_MOVE_DESTINATION,
      }
    }, "Failed to persist last-move preference.")
  }

  private persistLastMoveDestinationIfEnabled(): void {
    if (!this.#persistLastMoveAcrossRestarts) {
      return
    }

    this.#settingsWriteQueue.enqueue((settings) => {
      settings[SETTING_KEY_PERSIST_LAST_MOVE] = {
        value: true,
        description: SETTING_DESC_PERSIST_LAST_MOVE,
      }

      settings[SETTING_KEY_LAST_MOVE_DESTINATION] = {
        value: this.#lastQuickMoveDestination
          ? toPersistedLastMovePayload(this.#lastQuickMoveDestination)
          : null,
        description: SETTING_DESC_LAST_MOVE_DESTINATION,
      }
    }, "Failed to persist last move destination.")
  }
}
