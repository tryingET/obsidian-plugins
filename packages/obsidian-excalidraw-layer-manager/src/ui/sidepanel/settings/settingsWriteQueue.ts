import { assign, createActor, fromPromise, setup } from "xstate"

export interface ScriptSettingsEntryLike {
  value: unknown
  description?: string
}

export type ScriptSettingsLike = Record<string, ScriptSettingsEntryLike>

interface PendingSettingsWrite {
  readonly mutator: (settings: ScriptSettingsLike) => void
  readonly onErrorMessage: string
  readonly resolve: (result: boolean) => void
}

interface SidepanelSettingsWriteQueueInput {
  readonly getScriptSettings?: () => ScriptSettingsLike
  readonly setScriptSettings?: (settings: ScriptSettingsLike) => Promise<void> | void
  readonly notify: (message: string) => void
}

interface SettingsPersistenceMachineContext {
  readonly getScriptSettings: (() => ScriptSettingsLike) | undefined
  readonly setScriptSettings: ((settings: ScriptSettingsLike) => Promise<void> | void) | undefined
  readonly notify: (message: string) => void
  readonly activeBatch: readonly PendingSettingsWrite[]
  readonly pendingWrites: readonly PendingSettingsWrite[]
}

type SettingsPersistenceMachineEvent =
  | {
      readonly type: "ENQUEUE"
      readonly entry: PendingSettingsWrite
    }
  | {
      readonly type: "DISPOSE"
    }

interface PersistSettingsBatchActorInput {
  readonly getScriptSettings: () => ScriptSettingsLike
  readonly setScriptSettings: (settings: ScriptSettingsLike) => Promise<void> | void
  readonly batch: readonly PendingSettingsWrite[]
}

const SETTINGS_WRITE_VERIFICATION_MAX_ATTEMPTS = 2

const isPromiseLike = <T>(value: unknown): value is PromiseLike<T> => {
  return !!value && typeof value === "object" && "then" in value
}

const readScriptSettingsSnapshot = (getScriptSettings?: () => ScriptSettingsLike) => {
  const settings = getScriptSettings?.() ?? {}
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

const buildNextSettingsSnapshot = (input: PersistSettingsBatchActorInput): ScriptSettingsLike => {
  const nextSettings = readScriptSettingsSnapshot(input.getScriptSettings)

  for (const entry of input.batch) {
    entry.mutator(nextSettings)
  }

  return nextSettings
}

const areEquivalentSettingValues = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) {
    return true
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false
    }

    return left.every((entry, index) => areEquivalentSettingValues(entry, right[index]))
  }

  if (!left || !right || typeof left !== "object" || typeof right !== "object") {
    return false
  }

  const leftEntries = Object.entries(left as Record<string, unknown>)
  const rightEntries = Object.entries(right as Record<string, unknown>)

  if (leftEntries.length !== rightEntries.length) {
    return false
  }

  return leftEntries.every(([key, value]) =>
    areEquivalentSettingValues(value, (right as Record<string, unknown>)[key]),
  )
}

const areEquivalentSettingEntries = (
  left: ScriptSettingsEntryLike | undefined,
  right: ScriptSettingsEntryLike | undefined,
): boolean => {
  if (!left || !right) {
    return left === right
  }

  return (
    areEquivalentSettingValues(left.value, right.value) && left.description === right.description
  )
}

const doesSettingsSnapshotContain = (
  currentSettings: ScriptSettingsLike,
  expectedSettings: ScriptSettingsLike,
): boolean => {
  return Object.entries(expectedSettings).every(([key, entry]) =>
    areEquivalentSettingEntries(currentSettings[key], entry),
  )
}

const persistSettingsBatch = async (input: PersistSettingsBatchActorInput): Promise<void> => {
  for (let attempt = 0; attempt < SETTINGS_WRITE_VERIFICATION_MAX_ATTEMPTS; attempt += 1) {
    const nextSettings = buildNextSettingsSnapshot(input)
    const result = input.setScriptSettings(nextSettings)
    if (isPromiseLike<void>(result)) {
      await result
    }

    await Promise.resolve()

    const persistedSettings = readScriptSettingsSnapshot(input.getScriptSettings)
    if (doesSettingsSnapshotContain(persistedSettings, nextSettings)) {
      return
    }
  }

  throw new Error("Script settings verification failed after bounded retries.")
}

const resolveBatch = (batch: readonly PendingSettingsWrite[], result: boolean): void => {
  for (const entry of batch) {
    entry.resolve(result)
  }
}

const settingsPersistenceMachine = setup({
  types: {
    context: {} as SettingsPersistenceMachineContext,
    input: {} as SidepanelSettingsWriteQueueInput,
    events: {} as SettingsPersistenceMachineEvent,
  },
  actors: {
    writeSettingsBatch: fromPromise(
      async ({ input }: { input: PersistSettingsBatchActorInput }) => {
        await persistSettingsBatch(input)
      },
    ),
  },
  guards: {
    hasPendingWrites: ({ context }) => context.pendingWrites.length > 0,
  },
  actions: {
    startBatchFromEvent: assign({
      activeBatch: ({ event }) => (event.type === "ENQUEUE" ? [event.entry] : []),
      pendingWrites: [],
    }),
    appendPendingWriteFromEvent: assign({
      pendingWrites: ({ context, event }) => {
        if (event.type !== "ENQUEUE") {
          return context.pendingWrites
        }

        return [...context.pendingWrites, event.entry]
      },
    }),
    promotePendingWritesToActiveBatch: assign({
      activeBatch: ({ context }) => context.pendingWrites,
      pendingWrites: [],
    }),
    clearBatches: assign({
      activeBatch: [],
      pendingWrites: [],
    }),
    resolveActiveBatchSuccess: ({ context }) => {
      resolveBatch(context.activeBatch, true)
    },
    resolveActiveBatchFailure: ({ context }) => {
      resolveBatch(context.activeBatch, false)
    },
    notifyActiveBatchFailure: ({ context }) => {
      const message =
        context.activeBatch.at(-1)?.onErrorMessage ??
        "Failed to persist LayerManager script settings."
      context.notify(message)
    },
    resolveAllWritesAsFailed: ({ context }) => {
      resolveBatch(context.activeBatch, false)
      resolveBatch(context.pendingWrites, false)
    },
  },
}).createMachine({
  id: "sidepanelSettingsPersistence",
  initial: "idle",
  context: ({ input }) => ({
    getScriptSettings: input.getScriptSettings,
    setScriptSettings: input.setScriptSettings,
    notify: input.notify,
    activeBatch: [],
    pendingWrites: [],
  }),
  states: {
    idle: {
      on: {
        ENQUEUE: {
          target: "writing",
          actions: "startBatchFromEvent",
        },
        DISPOSE: {
          target: "closed",
          actions: ["resolveAllWritesAsFailed", "clearBatches"],
        },
      },
    },
    writing: {
      invoke: {
        src: "writeSettingsBatch",
        input: ({ context }) => {
          if (!context.getScriptSettings || !context.setScriptSettings) {
            throw new Error("Missing script settings persistence host APIs.")
          }

          return {
            getScriptSettings: context.getScriptSettings,
            setScriptSettings: context.setScriptSettings,
            batch: context.activeBatch,
          } satisfies PersistSettingsBatchActorInput
        },
        onDone: [
          {
            guard: "hasPendingWrites",
            target: "writing",
            reenter: true,
            actions: ["resolveActiveBatchSuccess", "promotePendingWritesToActiveBatch"],
          },
          {
            target: "idle",
            actions: ["resolveActiveBatchSuccess", "clearBatches"],
          },
        ],
        onError: [
          {
            guard: "hasPendingWrites",
            target: "writing",
            reenter: true,
            actions: [
              "notifyActiveBatchFailure",
              "resolveActiveBatchFailure",
              "promotePendingWritesToActiveBatch",
            ],
          },
          {
            target: "idle",
            actions: ["notifyActiveBatchFailure", "resolveActiveBatchFailure", "clearBatches"],
          },
        ],
      },
      on: {
        ENQUEUE: {
          actions: "appendPendingWriteFromEvent",
        },
        DISPOSE: {
          target: "closed",
          actions: ["resolveAllWritesAsFailed", "clearBatches"],
        },
      },
    },
    closed: {
      type: "final",
    },
  },
})

export const createSidepanelSettingsPersistenceActor = (
  input: SidepanelSettingsWriteQueueInput,
) => {
  return createActor(settingsPersistenceMachine, {
    input,
  })
}

export class SidepanelSettingsWriteQueue {
  readonly #getScriptSettings: (() => ScriptSettingsLike) | undefined
  readonly #setScriptSettings: ((settings: ScriptSettingsLike) => Promise<void> | void) | undefined
  readonly #actor: ReturnType<typeof createSidepanelSettingsPersistenceActor>

  #disposed = false

  constructor(input: SidepanelSettingsWriteQueueInput) {
    this.#getScriptSettings = input.getScriptSettings
    this.#setScriptSettings = input.setScriptSettings
    this.#actor = createSidepanelSettingsPersistenceActor(input)
    this.#actor.start()
  }

  get canWrite(): boolean {
    return !this.#disposed && !!this.#getScriptSettings && !!this.#setScriptSettings
  }

  enqueue(
    mutator: (settings: ScriptSettingsLike) => void,
    onErrorMessage: string,
  ): Promise<boolean> {
    if (!this.canWrite) {
      return Promise.resolve(false)
    }

    return new Promise<boolean>((resolve) => {
      this.#actor.send({
        type: "ENQUEUE",
        entry: {
          mutator,
          onErrorMessage,
          resolve,
        },
      })
    })
  }

  dispose(): void {
    if (this.#disposed) {
      return
    }

    this.#disposed = true
    this.#actor.send({
      type: "DISPOSE",
    })
    this.#actor.stop()
  }
}
