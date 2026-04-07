import { performance } from "node:perf_hooks"

import { describe, expect, it } from "vitest"

import type { EaLike, RawExcalidrawElement } from "../src/adapter/excalidraw-types.js"
import { applyPatch } from "../src/adapter/excalidrawAdapter.js"
import type { CommandContext } from "../src/commands/context.js"
import { planReorder } from "../src/commands/reorderNode.js"
import { planReparentNode } from "../src/commands/reparentNode.js"
import { buildLayerTree } from "../src/domain/treeBuilder.js"
import type { ElementDTO } from "../src/model/entities.js"
import { buildSceneIndexes } from "../src/model/indexes.js"
import { makeElement, makeSnapshot } from "./testFixtures.js"

const DEFAULT_ITERATIONS = 16
const DEFAULT_WARMUP = 3
const DEFAULT_BATCH_REPEATS = 8
const DEFAULT_MAX_DOUBLE_RATIO = 3.6
const DEFAULT_MAX_X4_RATIO = 9.5
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

const cloneRawElements = (elements: readonly RawExcalidrawElement[]): RawExcalidrawElement[] => {
  return elements.map((element) => ({
    ...element,
    groupIds: [...(element.groupIds ?? [])],
    customData: { ...(element.customData ?? {}) },
  }))
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

const makeBenchEa = (initialElements: readonly RawExcalidrawElement[]): EaLike => {
  const elements = cloneRawElements(initialElements)

  return {
    getViewElements: () => elements,
    getViewSelectedElements: () => [],
    getScriptSettings: () => ({}),
    copyViewElementsToEAforEditing: () => {},
    getElement: (id: string) => elements.find((element) => element.id === id),
    addElementsToView: async () => {},
    getExcalidrawAPI: () => ({
      updateScene: (scene) => {
        elements.splice(0, elements.length, ...scene.elements)
      },
    }),
    selectElementsInView: () => {},
  }
}

const buildContext = (elements: readonly ElementDTO[]): CommandContext => {
  const snapshot = makeSnapshot(elements)
  return {
    snapshot,
    indexes: buildSceneIndexes(snapshot),
  }
}

const measureBatched = async (
  operation: () => Promise<void>,
  iterations: number,
  warmup: number,
  batchRepeats: number,
): Promise<readonly number[]> => {
  for (let index = 0; index < warmup; index += 1) {
    for (let repeat = 0; repeat < batchRepeats; repeat += 1) {
      await operation()
    }
  }

  const timings: number[] = []
  for (let index = 0; index < iterations; index += 1) {
    const start = performance.now()

    for (let repeat = 0; repeat < batchRepeats; repeat += 1) {
      await operation()
    }

    const duration = performance.now() - start
    timings.push(duration / batchRepeats)
  }

  return timings
}

interface SizeSweepPoint {
  readonly size: number
  readonly p50: number
  readonly p95: number
}

const assertNearLinearTrend = (
  label: string,
  points: readonly SizeSweepPoint[],
  maxDoubleRatio: number,
  maxX4Ratio: number,
): void => {
  expect(points).toHaveLength(3)

  const size500 = points[0]
  const size1000 = points[1]
  const size2000 = points[2]

  if (!size500 || !size1000 || !size2000) {
    throw new Error(`${label}: expected size sweep points for 500, 1000, and 2000`) // should be unreachable
  }

  const doubleRatio1 = size1000.p50 / size500.p50
  const doubleRatio2 = size2000.p50 / size1000.p50
  const x4Ratio = size2000.p50 / size500.p50

  console.info(
    `[complexity:${label}] p50@500=${size500.p50.toFixed(2)}ms p50@1000=${size1000.p50.toFixed(2)}ms p50@2000=${size2000.p50.toFixed(2)}ms ratio(500->1000)=${doubleRatio1.toFixed(2)} ratio(1000->2000)=${doubleRatio2.toFixed(2)} ratio(500->2000)=${x4Ratio.toFixed(2)}`,
  )

  expect(doubleRatio1).toBeLessThanOrEqual(maxDoubleRatio)
  expect(doubleRatio2).toBeLessThanOrEqual(maxDoubleRatio)
  expect(x4Ratio).toBeLessThanOrEqual(maxX4Ratio)
}

describe("performance complexity sentinel", () => {
  it("MOE-19 tree hot path shows bounded growth trend across 500/1000/2000", async () => {
    const iterations = toNumberEnv("LMX_COMPLEXITY_ITERATIONS", DEFAULT_ITERATIONS)
    const warmup = toNumberEnv("LMX_COMPLEXITY_WARMUP", DEFAULT_WARMUP)
    const batchRepeats = toNumberEnv("LMX_COMPLEXITY_BATCH_REPEATS", DEFAULT_BATCH_REPEATS)
    const maxDoubleRatio = toNumberEnv("LMX_COMPLEXITY_MAX_DOUBLE_RATIO", DEFAULT_MAX_DOUBLE_RATIO)
    const maxX4Ratio = toNumberEnv("LMX_COMPLEXITY_MAX_X4_RATIO", DEFAULT_MAX_X4_RATIO)
    const hardCeilingP95 = toNumberEnv("LMX_COMPLEXITY_HARD_CEILING_MS", DEFAULT_HARD_CEILING_MS)

    const sizes = [500, 1000, 2000]
    const points: SizeSweepPoint[] = []

    for (const size of sizes) {
      const elements = makeSyntheticScene(size)
      const snapshot = makeSnapshot(elements)
      const indexes = buildSceneIndexes(snapshot)
      const expandedNodeIds = new Set<string>()

      const timings = await measureBatched(
        async () => {
          const tree = buildLayerTree(
            {
              elements,
              expandedNodeIds,
              groupFreedraw: true,
            },
            indexes,
          )

          if (tree.length === 0) {
            throw new Error("Unexpected empty tree in complexity sentinel")
          }
        },
        iterations,
        warmup,
        batchRepeats,
      )

      const p50 = percentile(timings, 0.5)
      const p95 = percentile(timings, 0.95)

      points.push({
        size,
        p50,
        p95,
      })

      expect(p95).toBeLessThanOrEqual(hardCeilingP95)
    }

    assertNearLinearTrend("tree", points, maxDoubleRatio, maxX4Ratio)
  })

  it("MOE-19 reorder planner+apply shows bounded growth trend across 500/1000/2000", async () => {
    const iterations = toNumberEnv("LMX_COMPLEXITY_ITERATIONS", DEFAULT_ITERATIONS)
    const warmup = toNumberEnv("LMX_COMPLEXITY_WARMUP", DEFAULT_WARMUP)
    const batchRepeats = toNumberEnv("LMX_COMPLEXITY_BATCH_REPEATS", DEFAULT_BATCH_REPEATS)
    const maxDoubleRatio = toNumberEnv("LMX_COMPLEXITY_MAX_DOUBLE_RATIO", DEFAULT_MAX_DOUBLE_RATIO)
    const maxX4Ratio = toNumberEnv("LMX_COMPLEXITY_MAX_X4_RATIO", DEFAULT_MAX_X4_RATIO)
    const hardCeilingP95 = toNumberEnv("LMX_COMPLEXITY_HARD_CEILING_MS", DEFAULT_HARD_CEILING_MS)

    const sizes = [500, 1000, 2000]
    const points: SizeSweepPoint[] = []

    for (const size of sizes) {
      const elements = makeSyntheticScene(size)
      const rawElements = elements.map(toRawElement)
      const movableIds = elements
        .filter((element) => element.type !== "frame")
        .map((element) => element.id)
      const movedCount = Math.max(50, Math.floor(size * 0.25))
      const orderedSubset = movableIds.slice(-movedCount).reverse()

      const timings = await measureBatched(
        async () => {
          const context = buildContext(elements)
          const planned = planReorder(context, {
            orderedElementIds: orderedSubset,
          })

          if (!planned.ok) {
            throw new Error(`Reorder complexity sentinel planning failed: ${planned.error}`)
          }

          const ea = makeBenchEa(rawElements)
          const outcome = await applyPatch(ea, planned.value)

          if (outcome.status !== "applied") {
            throw new Error(`Reorder complexity sentinel apply failed: ${outcome.status}`)
          }
        },
        iterations,
        warmup,
        batchRepeats,
      )

      const p50 = percentile(timings, 0.5)
      const p95 = percentile(timings, 0.95)

      points.push({
        size,
        p50,
        p95,
      })

      expect(p95).toBeLessThanOrEqual(hardCeilingP95)
    }

    assertNearLinearTrend("reorder", points, maxDoubleRatio, maxX4Ratio)
  })

  it("MOE-19 reparent planner+apply shows bounded growth trend across 500/1000/2000", async () => {
    const iterations = toNumberEnv("LMX_COMPLEXITY_ITERATIONS", DEFAULT_ITERATIONS)
    const warmup = toNumberEnv("LMX_COMPLEXITY_WARMUP", DEFAULT_WARMUP)
    const batchRepeats = toNumberEnv("LMX_COMPLEXITY_BATCH_REPEATS", DEFAULT_BATCH_REPEATS)
    const maxDoubleRatio = toNumberEnv("LMX_COMPLEXITY_MAX_DOUBLE_RATIO", DEFAULT_MAX_DOUBLE_RATIO)
    const maxX4Ratio = toNumberEnv("LMX_COMPLEXITY_MAX_X4_RATIO", DEFAULT_MAX_X4_RATIO)
    const hardCeilingP95 = toNumberEnv("LMX_COMPLEXITY_HARD_CEILING_MS", DEFAULT_HARD_CEILING_MS)

    const sizes = [500, 1000, 2000]
    const points: SizeSweepPoint[] = []

    for (const size of sizes) {
      const frameId = "frame-main"
      const sourceGroupId = "source-group"
      const elements: ElementDTO[] = [
        makeElement({
          id: frameId,
          type: "frame",
          zIndex: 0,
        }),
      ]

      const movedCount = Math.max(50, Math.floor(size * 0.25))
      const movedIds: string[] = []

      for (let index = 1; index < size; index += 1) {
        const isMoved = index <= movedCount
        const id = isMoved ? `moved-${index}` : `static-${index}`

        const groupIds = isMoved
          ? index % 2 === 0
            ? [`inner-${index % 12}`, sourceGroupId]
            : [sourceGroupId]
          : index % 9 === 0
            ? [`ambient-${Math.floor(index / 50)}`]
            : []

        elements.push(
          makeElement({
            id,
            zIndex: index,
            frameId,
            groupIds,
          }),
        )

        if (isMoved) {
          movedIds.push(id)
        }
      }

      const rawElements = elements.map(toRawElement)

      const timings = await measureBatched(
        async () => {
          const context = buildContext(elements)
          const planned = planReparentNode(context, {
            elementIds: movedIds,
            sourceGroupId,
            targetParentPath: ["target-outer", "target-inner"],
            targetFrameId: frameId,
          })

          if (!planned.ok) {
            throw new Error(`Reparent complexity sentinel planning failed: ${planned.error}`)
          }

          const ea = makeBenchEa(rawElements)
          const outcome = await applyPatch(ea, planned.value)

          if (outcome.status !== "applied") {
            throw new Error(`Reparent complexity sentinel apply failed: ${outcome.status}`)
          }
        },
        iterations,
        warmup,
        batchRepeats,
      )

      const p50 = percentile(timings, 0.5)
      const p95 = percentile(timings, 0.95)

      points.push({
        size,
        p50,
        p95,
      })

      expect(p95).toBeLessThanOrEqual(hardCeilingP95)
    }

    assertNearLinearTrend("reparent", points, maxDoubleRatio, maxX4Ratio)
  })
})
