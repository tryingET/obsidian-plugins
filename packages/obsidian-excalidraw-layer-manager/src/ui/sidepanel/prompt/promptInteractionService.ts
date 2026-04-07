import type { LayerManagerUiActions } from "../../renderer.js"

type PromptFunctionLike = (message?: string, initialValue?: string) => string | null

interface PromptSource {
  readonly owner: unknown
  readonly prompt: PromptFunctionLike
}

interface SidepanelPromptInteractionServiceHost {
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

export class SidepanelPromptInteractionService {
  readonly #host: SidepanelPromptInteractionServiceHost

  constructor(host: SidepanelPromptInteractionServiceHost) {
    this.#host = host
  }

  promptRaw(message: string, initialValue: string): PromptRawResult {
    const ownerDocument = this.#host.getOwnerDocument()
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

  withInteractionWindow<T>(actions: LayerManagerUiActions, operation: () => T): T {
    actions.beginInteraction()

    try {
      return operation()
    } finally {
      actions.endInteraction()
      this.#host.suppressKeyboardAfterPrompt()
      this.#host.setShouldAutofocusContentRoot(true)
      this.#host.focusContentRoot()
    }
  }

  promptWithInteraction(
    actions: LayerManagerUiActions,
    message: string,
    initialValue: string,
    unsupportedPromptMessage: string,
  ): PromptWithInteractionResult {
    return this.withInteractionWindow(actions, () => {
      const promptResult = this.promptRaw(message, initialValue)
      if (!promptResult.available) {
        this.#host.notify(unsupportedPromptMessage)
        return {
          cancelled: true,
        }
      }

      if (promptResult.value === null) {
        return {
          cancelled: true,
        }
      }

      return {
        cancelled: false,
        value: promptResult.value,
      }
    })
  }
}
