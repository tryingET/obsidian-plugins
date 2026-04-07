import { performance } from "node:perf_hooks"

import { describe, expect, it } from "vitest"

import type { EaLike, RawExcalidrawElement } from "../src/adapter/excalidraw-types.js"
import { planReorder } from "../src/commands/reorderNode.js"
import { createLayerManagerRuntime } from "../src/main.js"
import type { ElementDTO } from "../src/model/entities.js"
import type { LayerNode } from "../src/model/tree.js"
import { makeElement } from "./testFixtures.js"

const DEFAULT_ITERATIONS = 30
const DEFAULT_WARMUP = 4
const DEFAULT_TARGET_P95_MS = 33
const DEFAULT_HARD_CEILING_MS = 250

const toNumberEnv = (name: string, fallback: number): number => {
  const value = process.env[name]
  if (!value) {
    return fallback
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return parsed
}

const percentile = (values: readonly number[], p: number): number => {
  if (values.length === 0) {
    return 0
  }

  const sorted = [...values].sort((left, right) => left - right)
  const rawIndex = Math.ceil(sorted.length * p) - 1
  const index = Math.min(sorted.length - 1, Math.max(0, rawIndex))
  return sorted[index] ?? 0
}

const toRawElement = (element: ElementDTO): RawExcalidrawElement => {
  const raw: RawExcalidrawElement = {
    id: element.id,
    type: element.type,
    groupIds: [...element.groupIds],
    frameId: element.frameId,
    containerId: element.containerId,
    opacity: element.opacity,
    locked: element.locked,
    isDeleted: element.isDeleted,
    customData: { ...element.customData },
  }

  if (element.name !== undefined) {
    raw.name = element.name
  }

  if (element.text !== undefined) {
    raw.text = element.text
  }

  return raw
}

const makeSyntheticScene = (size: number): readonly ElementDTO[] => {
  const elements: ElementDTO[] = []

  let activeFrameId: string | null = null
  let lastRectangleId: string | null = null

  for (let index = 0; index < size; index += 1) {
    if (index % 250 === 0) {
      activeFrameId = `frame-${index}`
      lastRectangleId = null
      elements.push(
        makeElement({
          id: activeFrameId,
          type: "frame",
          zIndex: index,
        }),
      )
      continue
    }

    if (index % 9 === 0 && lastRectangleId) {
      elements.push(
        makeElement({
          id: `text-${index}`,
          type: "text",
          zIndex: index,
          frameId: activeFrameId,
          containerId: lastRectangleId,
        }),
      )
      continue
    }

    const groupIds =
      index % 11 === 0
        ? [`inner-${Math.floor(index / 22)}`, `outer-${Math.floor(index / 110)}`]
        : index % 13 === 0
          ? [`outer-${Math.floor(index / 110)}`]
          : []

    const type = index % 7 === 0 ? "freedraw" : "rectangle"
    const id = type === "freedraw" ? `stroke-${index}` : `shape-${index}`

    elements.push(
      makeElement({
        id,
        type,
        zIndex: index,
        frameId: activeFrameId,
        groupIds,
      }),
    )

    if (type === "rectangle") {
      lastRectangleId = id
    }
  }

  return elements
}

const cloneRawElements = (elements: readonly RawExcalidrawElement[]): RawExcalidrawElement[] => {
  return elements.map((element) => ({
    ...element,
    groupIds: [...(element.groupIds ?? [])],
    customData: { ...(element.customData ?? {}) },
  }))
}

const makeBenchEa = (initialElements: readonly RawExcalidrawElement[]): EaLike => {
  const elements = cloneRawElements(initialElements)
  const selectedIds = new Set<string>()

  return {
    getViewElements: () => elements,
    getViewSelectedElements: () => elements.filter((element) => selectedIds.has(element.id)),
    getScriptSettings: () => ({}),
    copyViewElementsToEAforEditing: () => {},
    getElement: (id: string) => elements.find((element) => element.id === id),
    addElementsToView: async () => {},
    getExcalidrawAPI: () => ({
      updateScene: (scene) => {
        elements.splice(0, elements.length, ...scene.elements)
      },
    }),
    selectElementsInView: (ids: string[]) => {
      selectedIds.clear()
      for (const id of ids) {
        if (elements.some((element) => element.id === id)) {
          selectedIds.add(id)
        }
      }
    },
  }
}

const walkNodes = (nodes: readonly LayerNode[]): number => {
  let checksum = 0

  for (const node of nodes) {
    checksum += node.id.length + node.label.length + node.elementIds.length
    if (node.children.length > 0) {
      checksum += walkNodes(node.children)
    }
  }

  return checksum
}

const measureAsync = async (
  operation: () => Promise<void>,
  iterations: number,
  warmup: number,
): Promise<readonly number[]> => {
  for (let index = 0; index < warmup; index += 1) {
    await operation()
  }

  const timings: number[] = []
  for (let index = 0; index < iterations; index += 1) {
    const start = performance.now()
    await operation()
    timings.push(performance.now() - start)
  }

  return timings
}

describe("runtime render/update performance harness", () => {
  it("tracks p95 for update+render after command apply on 2k scene", async () => {
    const iterations = toNumberEnv("LMX_RUNTIME_BENCH_ITERATIONS", DEFAULT_ITERATIONS)
    const warmup = toNumberEnv("LMX_RUNTIME_BENCH_WARMUP", DEFAULT_WARMUP)
    const targetP95 = toNumberEnv("LMX_RUNTIME_TARGET_P95_MS", DEFAULT_TARGET_P95_MS)
    const hardCeilingP95 = toNumberEnv("LMX_RUNTIME_HARD_CEILING_MS", DEFAULT_HARD_CEILING_MS)
    const enforceTarget = process.env["LMX_ENFORCE_RUNTIME_P95_BUDGET"] === "true"

    const scene = makeSyntheticScene(2000)
    const rawScene = scene.map(toRawElement)
    const ea = makeBenchEa(rawScene)

    let renderChecksum = 0
    const runtime = createLayerManagerRuntime(ea, {
      render: (model) => {
        renderChecksum += walkNodes(model.tree) + model.selectedIds.size
      },
    })

    const movableIds = scene
      .filter((element) => element.type !== "frame")
      .map((element) => element.id)
      .slice(-500)

    expect(movableIds.length).toBe(500)

    const orderedForward = [...movableIds]
    const orderedBackward = [...movableIds].reverse()
    let forward = false

    const timings = await measureAsync(
      async () => {
        forward = !forward
        const orderedElementIds = forward ? orderedForward : orderedBackward

        const outcome = await runtime.executeIntent((context) =>
          planReorder(context, {
            orderedElementIds,
          }),
        )

        if (outcome.status !== "applied") {
          throw new Error(`Runtime benchmark command failed: ${outcome.status}`)
        }
      },
      iterations,
      warmup,
    )

    const p50 = percentile(timings, 0.5)
    const p95 = percentile(timings, 0.95)
    const max = Math.max(...timings)

    console.info(
      `[runtime-bench:update] size=2000 moved=500 iterations=${iterations} warmup=${warmup} p50=${p50.toFixed(2)}ms p95=${p95.toFixed(2)}ms max=${max.toFixed(2)}ms`,
    )

    expect(renderChecksum).toBeGreaterThan(0)
    expect(p95).toBeLessThanOrEqual(hardCeilingP95)

    if (enforceTarget) {
      expect(p95).toBeLessThanOrEqual(targetP95)
    }
  })
})
