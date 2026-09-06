import type { EaLike } from "../adapter/excalidraw-types.js"
import { createRuntimeSidepanelLifecycleBinding } from "../runtime/sidepanelLifecycleBinding.js"
import {
  type ExcalidrawSidepanelHost,
  createExcalidrawSidepanelRenderer as createCoreExcalidrawSidepanelRenderer,
} from "./excalidrawSidepanelRendererCore.js"
import type { LayerManagerRenderer, RenderViewModel } from "./renderer.js"

export * from "./excalidrawSidepanelRendererCore.js"

interface RuntimeOwner {
  readonly refresh: () => void
  readonly dispose: () => void
}

type RuntimeGlobal = typeof globalThis & {
  excalidrawLayerManagerRuntime?: RuntimeOwner
}

const runtimeGlobal = globalThis as RuntimeGlobal

const getCurrentRuntime = (): RuntimeOwner | null => {
  return runtimeGlobal.excalidrawLayerManagerRuntime ?? null
}

const refreshCurrentRuntime = (): void => {
  getCurrentRuntime()?.refresh()
}

const disposeCurrentRuntime = (): void => {
  const runtime = getCurrentRuntime()
  if (!runtime) {
    return
  }

  runtime.dispose()

  if (runtimeGlobal.excalidrawLayerManagerRuntime === runtime) {
    Reflect.deleteProperty(runtimeGlobal, "excalidrawLayerManagerRuntime")
  }
}

class LifecycleBoundRenderer implements LayerManagerRenderer {
  readonly #renderer: LayerManagerRenderer
  readonly #binding: ReturnType<typeof createRuntimeSidepanelLifecycleBinding>
  #disposed = false

  constructor(
    renderer: LayerManagerRenderer,
    binding: ReturnType<typeof createRuntimeSidepanelLifecycleBinding>,
  ) {
    this.#renderer = renderer
    this.#binding = binding
    this.#binding.sync()
  }

  render(model: RenderViewModel): void {
    if (this.#disposed) {
      return
    }

    this.#renderer.render(model)
    this.#binding.sync()
  }

  notify(message: string): void {
    this.#renderer.notify?.(message)
  }

  dispose(): void {
    if (this.#disposed) {
      return
    }

    this.#disposed = true
    this.#binding.dispose()
    this.#renderer.dispose?.()
  }
}

export const createExcalidrawSidepanelRenderer = (
  host: ExcalidrawSidepanelHost,
): LayerManagerRenderer | null => {
  const binding = createRuntimeSidepanelLifecycleBinding({
    ea: host as EaLike,
    requestRefresh: refreshCurrentRuntime,
    requestDispose: disposeCurrentRuntime,
  })
  const renderer = createCoreExcalidrawSidepanelRenderer(host)

  if (!renderer) {
    binding.dispose()
    return null
  }

  return new LifecycleBoundRenderer(renderer, binding)
}
