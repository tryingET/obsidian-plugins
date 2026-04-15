import { createActor, setup } from "xstate"

import type { LayerManagerUiActions } from "../../renderer.js"

type PromptFunctionLike = (message?: string, initialValue?: string) => string | null

interface PromptSource {
  readonly owner: unknown
  readonly prompt: PromptFunctionLike
}

export interface SidepanelPromptInteractionServiceHost {
  readonly getOwnerDocument: () => Document | null
  readonly notify: (message: string) => void
  readonly suppressKeyboardAfterPrompt: () => void
  readonly setShouldAutofocusContentRoot: (value: boolean) => void
  readonly focusContentRoot: () => void
}

type PromptRawResult =
  | {
      readonly available: false
    }
  | {
      readonly available: true
      readonly value: string | null
    }

type PromptWithInteractionResult =
  | {
      readonly cancelled: true
    }
  | {
      readonly cancelled: false
      readonly value: string
    }

interface PromptInteractionMachineInput {
  readonly host: SidepanelPromptInteractionServiceHost
}

interface PromptInteractionMachineContext {
  readonly host: SidepanelPromptInteractionServiceHost
}

type RunInteractionWindowEvent = {
  readonly type: "RUN_INTERACTION_WINDOW"
  readonly actions: LayerManagerUiActions
  readonly operation: () => unknown
  readonly respond: (result: unknown) => void
  readonly fail: (error: unknown) => void
}

type PromptWithInteractionEvent = {
  readonly type: "PROMPT_WITH_INTERACTION"
  readonly actions: LayerManagerUiActions
  readonly message: string
  readonly initialValue: string
  readonly unsupportedPromptMessage: string
  readonly respond: (result: PromptWithInteractionResult) => void
  readonly fail: (error: unknown) => void
}

type PromptInteractionMachineEvent = RunInteractionWindowEvent | PromptWithInteractionEvent

const collectPromptSources = (ownerDocument: Document | null): readonly PromptSource[] => {
  const sources: PromptSource[] = []

  const pushPromptSource = (owner: unknown): void => {
    if (!owner || (typeof owner !== "object" && typeof owner !== "function")) {
      return
    }

    const promptCandidate = (owner as Record<string, unknown>)["prompt"]
    if (typeof promptCandidate !== "function") {
      return
    }

    sources.push({
      owner,
      prompt: promptCandidate as PromptFunctionLike,
    })
  }

  pushPromptSource(globalThis)
  pushPromptSource((globalThis as { readonly window?: unknown }).window)
  pushPromptSource(ownerDocument?.defaultView ?? null)

  return sources
}

const resolvePromptRaw = (
  ownerDocument: Document | null,
  message: string,
  initialValue: string,
): PromptRawResult => {
  const promptSources = collectPromptSources(ownerDocument)

  for (const source of promptSources) {
    try {
      const response = source.prompt.call(source.owner, message, initialValue)
      if (response === null || typeof response === "string") {
        return {
          available: true,
          value: response,
        }
      }

      return {
        available: true,
        value: `${response}`,
      }
    } catch {
      // try next prompt source
    }
  }

  return {
    available: false,
  }
}

const finalizeInteractionWindow = (
  host: SidepanelPromptInteractionServiceHost,
  actions: LayerManagerUiActions,
): void => {
  actions.endInteraction()
  host.suppressKeyboardAfterPrompt()
  host.setShouldAutofocusContentRoot(true)
  host.focusContentRoot()
}

const runInteractionWindow = <T>(
  host: SidepanelPromptInteractionServiceHost,
  actions: LayerManagerUiActions,
  operation: () => T,
): T => {
  actions.beginInteraction()

  try {
    return operation()
  } finally {
    finalizeInteractionWindow(host, actions)
  }
}

const promptInteractionMachine = setup({
  types: {
    context: {} as PromptInteractionMachineContext,
    input: {} as PromptInteractionMachineInput,
    events: {} as PromptInteractionMachineEvent,
  },
  actions: {
    runInteractionWindowEvent: ({ context, event }) => {
      if (event.type !== "RUN_INTERACTION_WINDOW") {
        return
      }

      try {
        const result = runInteractionWindow(context.host, event.actions, event.operation)
        event.respond(result)
      } catch (error: unknown) {
        event.fail(error)
      }
    },
    runPromptWithInteractionEvent: ({ context, event }) => {
      if (event.type !== "PROMPT_WITH_INTERACTION") {
        return
      }

      try {
        const result = runInteractionWindow(context.host, event.actions, () => {
          const promptResult = resolvePromptRaw(
            context.host.getOwnerDocument(),
            event.message,
            event.initialValue,
          )
          if (!promptResult.available) {
            context.host.notify(event.unsupportedPromptMessage)
            return {
              cancelled: true,
            } satisfies PromptWithInteractionResult
          }

          if (promptResult.value === null) {
            return {
              cancelled: true,
            } satisfies PromptWithInteractionResult
          }

          return {
            cancelled: false,
            value: promptResult.value,
          } satisfies PromptWithInteractionResult
        })

        event.respond(result)
      } catch (error: unknown) {
        event.fail(error)
      }
    },
  },
}).createMachine({
  id: "sidepanelPromptInteraction",
  initial: "ready",
  context: ({ input }) => ({
    host: input.host,
  }),
  states: {
    ready: {
      on: {
        RUN_INTERACTION_WINDOW: {
          actions: "runInteractionWindowEvent",
        },
        PROMPT_WITH_INTERACTION: {
          actions: "runPromptWithInteractionEvent",
        },
      },
    },
  },
})

export const createPromptInteractionActor = (input: PromptInteractionMachineInput) => {
  return createActor(promptInteractionMachine, {
    input,
  })
}

export class SidepanelPromptInteractionService {
  readonly #host: SidepanelPromptInteractionServiceHost
  readonly #actor: ReturnType<typeof createPromptInteractionActor>

  constructor(host: SidepanelPromptInteractionServiceHost) {
    this.#host = host
    this.#actor = createPromptInteractionActor({
      host,
    })
    this.#actor.start()
  }

  dispose(): void {
    this.#actor.stop()
  }

  promptRaw(message: string, initialValue: string): PromptRawResult {
    return resolvePromptRaw(this.#host.getOwnerDocument(), message, initialValue)
  }

  withInteractionWindow<T>(actions: LayerManagerUiActions, operation: () => T): T {
    let settled = false
    let result: T | undefined
    let failure: unknown = undefined

    this.#actor.send({
      type: "RUN_INTERACTION_WINDOW",
      actions,
      operation: operation as () => unknown,
      respond: (nextResult) => {
        settled = true
        result = nextResult as T
      },
      fail: (error) => {
        settled = true
        failure = error
      },
    })

    if (!settled) {
      throw new Error("Prompt interaction actor did not settle synchronously.")
    }

    if (failure !== undefined) {
      throw failure
    }

    return result as T
  }

  withPromptlessInteraction<T>(actions: LayerManagerUiActions, operation: () => T): T {
    return this.withInteractionWindow(actions, operation)
  }

  promptWithInteraction(
    actions: LayerManagerUiActions,
    message: string,
    initialValue: string,
    unsupportedPromptMessage: string,
  ): PromptWithInteractionResult {
    let settled = false
    let result: PromptWithInteractionResult | null = null
    let failure: unknown = undefined

    this.#actor.send({
      type: "PROMPT_WITH_INTERACTION",
      actions,
      message,
      initialValue,
      unsupportedPromptMessage,
      respond: (nextResult) => {
        settled = true
        result = nextResult
      },
      fail: (error) => {
        settled = true
        failure = error
      },
    })

    if (failure !== undefined) {
      throw failure
    }

    if (!settled || !result) {
      throw new Error("Prompt interaction actor did not produce a prompt result.")
    }

    return result
  }
}
