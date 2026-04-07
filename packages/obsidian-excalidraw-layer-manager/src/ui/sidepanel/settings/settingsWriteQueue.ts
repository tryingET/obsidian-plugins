export interface ScriptSettingsEntryLike {
  value: unknown
  description?: string
}

export type ScriptSettingsLike = Record<string, ScriptSettingsEntryLike>

interface PendingSettingsWrite {
  readonly mutator: (settings: ScriptSettingsLike) => void
  readonly onErrorMessage: string
}

interface SidepanelSettingsWriteQueueInput {
  readonly getScriptSettings?: () => ScriptSettingsLike
  readonly setScriptSettings?: (settings: ScriptSettingsLike) => Promise<void> | void
  readonly notify: (message: string) => void
}

const isPromiseLike = <T>(value: unknown): value is PromiseLike<T> => {
  return !!value && typeof value === "object" && "then" in value
}

export class SidepanelSettingsWriteQueue {
  readonly #getScriptSettings: (() => ScriptSettingsLike) | undefined
  readonly #setScriptSettings: ((settings: ScriptSettingsLike) => Promise<void> | void) | undefined
  readonly #notify: (message: string) => void

  #pendingSettingsWrites: PendingSettingsWrite[] = []
  #isFlushingSettingsWrites = false

  constructor(input: SidepanelSettingsWriteQueueInput) {
    this.#getScriptSettings = input.getScriptSettings
    this.#setScriptSettings = input.setScriptSettings
    this.#notify = input.notify
  }

  get canWrite(): boolean {
    return !!this.#getScriptSettings && !!this.#setScriptSettings
  }

  enqueue(mutator: (settings: ScriptSettingsLike) => void, onErrorMessage: string): void {
    if (!this.canWrite) {
      return
    }

    this.#pendingSettingsWrites.push({
      mutator,
      onErrorMessage,
    })

    if (!this.#isFlushingSettingsWrites) {
      void this.flush()
    }
  }

  private readScriptSettingsSnapshot(): ScriptSettingsLike {
    const settings = this.#getScriptSettings?.() ?? {}
    const snapshot: ScriptSettingsLike = {}

    for (const [key, entry] of Object.entries(settings)) {
      if (!entry || typeof entry !== "object" || !("value" in entry)) {
        continue
      }

      const cast = entry as ScriptSettingsEntryLike
      if (typeof cast.description === "string") {
        snapshot[key] = {
          value: cast.value,
          description: cast.description,
        }
        continue
      }

      snapshot[key] = {
        value: cast.value,
      }
    }

    return snapshot
  }

  private async flush(): Promise<void> {
    if (this.#isFlushingSettingsWrites) {
      return
    }

    this.#isFlushingSettingsWrites = true

    try {
      while (this.#pendingSettingsWrites.length > 0) {
        const batch = this.#pendingSettingsWrites.splice(0, this.#pendingSettingsWrites.length)
        const nextSettings = this.readScriptSettingsSnapshot()

        for (const entry of batch) {
          entry.mutator(nextSettings)
        }

        try {
          const result = this.#setScriptSettings?.(nextSettings)
          if (isPromiseLike<void>(result)) {
            await result
          }
        } catch {
          const message =
            batch.at(-1)?.onErrorMessage ?? "Failed to persist LayerManager script settings."
          this.#notify(message)
        }
      }
    } finally {
      this.#isFlushingSettingsWrites = false
      if (this.#pendingSettingsWrites.length > 0) {
        void this.flush()
      }
    }
  }
}
