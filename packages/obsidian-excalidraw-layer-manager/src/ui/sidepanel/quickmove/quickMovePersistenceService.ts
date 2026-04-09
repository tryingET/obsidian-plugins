import type {
  ScriptSettingsLike,
  SidepanelSettingsWriteQueue,
} from "../settings/settingsWriteQueue.js"
import { type GroupReparentPreset, makePresetKey, makePresetOptionLabel } from "./presetHelpers.js"

export type LastQuickMoveDestination =
  | {
      readonly kind: "root"
      readonly targetFrameId: string | null
    }
  | {
      readonly kind: "preset"
      readonly preset: GroupReparentPreset
    }

type PersistedLastMoveDestinationPayload =
  | {
      readonly kind: "root"
      readonly targetFrameId?: string | null
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
      targetFrameId: destination.targetFrameId,
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
    const rawTargetFrameId = payload["targetFrameId"]
    return {
      kind: "root",
      targetFrameId: typeof rawTargetFrameId === "string" ? rawTargetFrameId : null,
    }
  }

  if (kind !== "preset") {
    return null
  }

  const rawPath = payload["targetParentPath"]
  if (!Array.isArray(rawPath) || rawPath.length === 0) {
    return null
  }

  const targetParentPath: string[] = []
  for (const segment of rawPath) {
    if (typeof segment !== "string") {
      return null
    }

    const normalizedSegment = segment.trim()
    if (normalizedSegment.length === 0 || normalizedSegment !== segment) {
      return null
    }

    targetParentPath.push(segment)
  }

  const rawTargetFrameId = payload["targetFrameId"]
  const targetFrameId = typeof rawTargetFrameId === "string" ? rawTargetFrameId : null

  const rawLabel = payload["label"]
  const label =
    typeof rawLabel === "string" && rawLabel.trim().length > 0
      ? rawLabel.trim()
      : makePresetOptionLabel(targetParentPath)

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
    return (
      left.kind === "root" && right.kind === "root" && left.targetFrameId === right.targetFrameId
    )
  }

  return left.preset.key === right.preset.key
}

const areSamePresetPaths = (left: readonly string[], right: readonly string[]): boolean => {
  if (left.length !== right.length) {
    return false
  }

  return left.every((segment, index) => segment === right[index])
}

const areEquivalentDestinations = (
  left: LastQuickMoveDestination | null,
  right: LastQuickMoveDestination | null,
): boolean => {
  if (left === right) {
    return true
  }

  if (!left || !right) {
    return left === right
  }

  if (left.kind === "root" || right.kind === "root") {
    return (
      left.kind === "root" && right.kind === "root" && left.targetFrameId === right.targetFrameId
    )
  }

  return (
    left.preset.key === right.preset.key &&
    left.preset.label === right.preset.label &&
    left.preset.targetFrameId === right.preset.targetFrameId &&
    areSamePresetPaths(left.preset.targetParentPath, right.preset.targetParentPath)
  )
}

const areEquivalentDestinationLists = (
  left: readonly LastQuickMoveDestination[],
  right: readonly LastQuickMoveDestination[],
): boolean => {
  if (left.length !== right.length) {
    return false
  }

  return left.every((destination, index) =>
    areEquivalentDestinations(destination, right[index] ?? null),
  )
}

const buildReboundRecentDestinations = (
  lastQuickMoveDestination: LastQuickMoveDestination | null,
  recentQuickMoveDestinations: readonly LastQuickMoveDestination[],
): readonly LastQuickMoveDestination[] => {
  const reboundDestinations: LastQuickMoveDestination[] = []

  const appendDestination = (destination: LastQuickMoveDestination | null): void => {
    if (!destination) {
      return
    }

    if (reboundDestinations.some((existing) => isSameDestination(existing, destination))) {
      return
    }

    reboundDestinations.push(destination)
  }

  appendDestination(lastQuickMoveDestination)

  for (const destination of recentQuickMoveDestinations) {
    appendDestination(destination)
    if (reboundDestinations.length >= RECENT_DESTINATION_LIMIT) {
      break
    }
  }

  return reboundDestinations
}

export type RememberedDestinationRebindOutcome =
  | {
      readonly status: "unchanged"
    }
  | {
      readonly status: "reconciled"
      readonly persisted: true
    }
  | {
      readonly status: "reconciled"
      readonly persisted: false
      readonly revertedTo: {
        readonly lastQuickMoveDestination: LastQuickMoveDestination | null
        readonly recentQuickMoveDestinations: readonly LastQuickMoveDestination[]
      }
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

  async setPersistLastMoveAcrossRestarts(nextValue: boolean): Promise<boolean> {
    const previousValue = this.#persistLastMoveAcrossRestarts
    this.#persistLastMoveAcrossRestarts = nextValue

    const persisted = await this.persistLastMovePersistencePreference()
    if (!persisted) {
      this.#persistLastMoveAcrossRestarts = previousValue
    }

    return persisted
  }

  async setLastQuickMoveDestination(
    destination: LastQuickMoveDestination | null,
  ): Promise<boolean> {
    const previousDestination = this.#lastQuickMoveDestination
    const previousRecentDestinations = [...this.#recentQuickMoveDestinations]

    this.#lastQuickMoveDestination = destination

    if (destination) {
      this.rememberRecentDestination(destination)
    }

    const persisted = await this.persistLastMoveDestinationIfEnabled()
    if (!persisted) {
      this.#lastQuickMoveDestination = previousDestination
      this.#recentQuickMoveDestinations = previousRecentDestinations
      return false
    }

    return true
  }

  async rebindRememberedDestinations(input: {
    readonly lastQuickMoveDestination: LastQuickMoveDestination | null
    readonly recentQuickMoveDestinations: readonly LastQuickMoveDestination[]
  }): Promise<RememberedDestinationRebindOutcome> {
    const nextRecentQuickMoveDestinations = buildReboundRecentDestinations(
      input.lastQuickMoveDestination,
      input.recentQuickMoveDestinations,
    )

    const changed =
      !areEquivalentDestinations(this.#lastQuickMoveDestination, input.lastQuickMoveDestination) ||
      !areEquivalentDestinationLists(
        this.#recentQuickMoveDestinations,
        nextRecentQuickMoveDestinations,
      )

    if (!changed) {
      return {
        status: "unchanged",
      }
    }

    const previousLastQuickMoveDestination = this.#lastQuickMoveDestination
    const previousRecentQuickMoveDestinations = [...this.#recentQuickMoveDestinations]

    this.#lastQuickMoveDestination = input.lastQuickMoveDestination
    this.#recentQuickMoveDestinations = [...nextRecentQuickMoveDestinations]

    const persisted = await this.persistLastMoveDestinationIfEnabled()
    if (persisted) {
      return {
        status: "reconciled",
        persisted: true,
      }
    }

    this.#lastQuickMoveDestination = previousLastQuickMoveDestination
    this.#recentQuickMoveDestinations = previousRecentQuickMoveDestinations

    return {
      status: "reconciled",
      persisted: false,
      revertedTo: {
        lastQuickMoveDestination: previousLastQuickMoveDestination,
        recentQuickMoveDestinations: previousRecentQuickMoveDestinations,
      },
    }
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

  private persistLastMovePersistencePreference(): Promise<boolean> {
    return this.#settingsWriteQueue.enqueue((settings) => {
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

  private persistLastMoveDestinationIfEnabled(): Promise<boolean> {
    if (!this.#persistLastMoveAcrossRestarts) {
      return Promise.resolve(true)
    }

    return this.#settingsWriteQueue.enqueue((settings) => {
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
