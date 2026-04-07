import { performance } from "node:perf_hooks"

import { describe, expect, it } from "vitest"

import type { EaLike, RawExcalidrawElement } from "../src/adapter/excalidraw-types.js"
import { applyPatch } from "../src/adapter/excalidrawAdapter.js"
import type { CommandContext } from "../src/commands/context.js"
import { planReorder } from "../src/commands/reorderNode.js"
import { planReparentNode } from "../src/commands/reparentNode.js"
import type { ElementDTO } from "../src/model/entities.js"
import { buildSceneIndexes } from "../src/model/indexes.js"
import { makeElement, makeSnapshot } from "./testFixtures.js"

const DEFAULT_ITERATIONS = 40
const DEFAULT_WARMUP = 6
const DEFAULT_TARGET_P95_MS = 40
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

const cloneRawElements = (elements: readonly RawExcalidrawElement[]): RawExcalidrawElement[] => {
  return elements.map((element) => ({
    ...element,
    groupIds: [...(element.groupIds ?? [])],
    customData: { ...(element.customData ?? {}) },
  }))
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

interface ReparentBenchFixture {
  readonly elements: readonly ElementDTO[]
  readonly rawElements: readonly RawExcalidrawElement[]
  readonly movedIds: readonly string[]
  readonly frameId: string
  readonly sourceGroupId: string
}

const makeReparentBenchFixture = (sceneSize: number, movedCount: number): ReparentBenchFixture => {
  const frameId = "frame-main"
  const sourceGroupId = "source-group"
  const elements: ElementDTO[] = [
    makeElement({
      id: frameId,
      type: "frame",
      zIndex: 0,
    }),
  ]

  const movedIds: string[] = []

  for (let index = 1; index < sceneSize; index += 1) {
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

  return {
    elements,
    rawElements: elements.map(toRawElement),
    movedIds,
    frameId,
    sourceGroupId,
  }
}

interface ReorderBenchFixture {
  readonly elements: readonly ElementDTO[]
  readonly rawElements: readonly RawExcalidrawElement[]
  readonly orderedSubset: readonly string[]
}

const makeReorderBenchFixture = (sceneSize: number, movedCount: number): ReorderBenchFixture => {
  const frameA = "frame-a"
  const frameB = "frame-b"

  const elements: ElementDTO[] = [
    makeElement({ id: frameA, type: "frame", zIndex: 0 }),
    makeElement({ id: frameB, type: "frame", zIndex: 1 }),
  ]

  for (let index = 2; index < sceneSize; index += 1) {
    const id = `el-${index}`
    const frameId = index % 5 === 0 ? frameB : frameA
    const groupIds =
      index % 14 === 0
        ? [`inner-${Math.floor(index / 28)}`, `outer-${Math.floor(index / 70)}`]
        : index % 11 === 0
          ? [`outer-${Math.floor(index / 70)}`]
          : []

    elements.push(
      makeElement({
        id,
        zIndex: index,
        frameId,
        groupIds,
      }),
    )
  }

  const subset = elements
    .slice(-movedCount)
    .map((element) => element.id)
    .reverse()

  return {
    elements,
    rawElements: elements.map(toRawElement),
    orderedSubset: subset,
  }
}

const buildContext = (elements: readonly ElementDTO[]): CommandContext => {
  const snapshot = makeSnapshot(elements)
  return {
    snapshot,
    indexes: buildSceneIndexes(snapshot),
  }
}

const runReparentPlanAndApply = async (fixture: ReparentBenchFixture): Promise<void> => {
  const context = buildContext(fixture.elements)

  const planned = planReparentNode(context, {
    elementIds: fixture.movedIds,
    sourceGroupId: fixture.sourceGroupId,
    targetParentPath: ["target-outer", "target-inner"],
    targetFrameId: fixture.frameId,
  })

  if (!planned.ok) {
    throw new Error(`Reparent benchmark planning failed: ${planned.error}`)
  }

  const ea = makeBenchEa(fixture.rawElements)
  const outcome = await applyPatch(ea, planned.value)

  if (outcome.status !== "applied") {
    throw new Error(`Reparent benchmark apply failed: ${outcome.status}`)
  }
}

const runReorderPlanAndApply = async (fixture: ReorderBenchFixture): Promise<void> => {
  const context = buildContext(fixture.elements)

  const planned = planReorder(context, {
    orderedElementIds: fixture.orderedSubset,
  })

  if (!planned.ok) {
    throw new Error(`Reorder benchmark planning failed: ${planned.error}`)
  }

  const ea = makeBenchEa(fixture.rawElements)
  const outcome = await applyPatch(ea, planned.value)

  if (outcome.status !== "applied") {
    throw new Error(`Reorder benchmark apply failed: ${outcome.status}`)
  }
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

describe("command planner+apply performance harness", () => {
  it("tracks p95 for reparent with 500 moved elements", async () => {
    const iterations = toNumberEnv("LMX_COMMAND_BENCH_ITERATIONS", DEFAULT_ITERATIONS)
    const warmup = toNumberEnv("LMX_COMMAND_BENCH_WARMUP", DEFAULT_WARMUP)
    const targetP95 = toNumberEnv("LMX_COMMAND_TARGET_P95_MS", DEFAULT_TARGET_P95_MS)
    const hardCeilingP95 = toNumberEnv("LMX_COMMAND_HARD_CEILING_MS", DEFAULT_HARD_CEILING_MS)
    const enforceTarget = process.env["LMX_ENFORCE_COMMAND_P95_BUDGET"] === "true"

    const fixture = makeReparentBenchFixture(2000, 500)
    const timings = await measureAsync(() => runReparentPlanAndApply(fixture), iterations, warmup)

    const p50 = percentile(timings, 0.5)
    const p95 = percentile(timings, 0.95)
    const max = Math.max(...timings)

    console.info(
      `[command-bench:reparent] size=2000 moved=500 iterations=${iterations} warmup=${warmup} p50=${p50.toFixed(2)}ms p95=${p95.toFixed(2)}ms max=${max.toFixed(2)}ms`,
    )

    expect(p95).toBeLessThanOrEqual(hardCeilingP95)

    if (enforceTarget) {
      expect(p95).toBeLessThanOrEqual(targetP95)
    }
  })

  it("tracks p95 for reorder with 500 moved elements", async () => {
    const iterations = toNumberEnv("LMX_COMMAND_BENCH_ITERATIONS", DEFAULT_ITERATIONS)
    const warmup = toNumberEnv("LMX_COMMAND_BENCH_WARMUP", DEFAULT_WARMUP)
    const targetP95 = toNumberEnv("LMX_COMMAND_TARGET_P95_MS", DEFAULT_TARGET_P95_MS)
    const hardCeilingP95 = toNumberEnv("LMX_COMMAND_HARD_CEILING_MS", DEFAULT_HARD_CEILING_MS)
    const enforceTarget = process.env["LMX_ENFORCE_COMMAND_P95_BUDGET"] === "true"

    const fixture = makeReorderBenchFixture(2000, 500)
    const timings = await measureAsync(() => runReorderPlanAndApply(fixture), iterations, warmup)

    const p50 = percentile(timings, 0.5)
    const p95 = percentile(timings, 0.95)
    const max = Math.max(...timings)

    console.info(
      `[command-bench:reorder] size=2000 moved=500 iterations=${iterations} warmup=${warmup} p50=${p50.toFixed(2)}ms p95=${p95.toFixed(2)}ms max=${max.toFixed(2)}ms`,
    )

    expect(p95).toBeLessThanOrEqual(hardCeilingP95)

    if (enforceTarget) {
      expect(p95).toBeLessThanOrEqual(targetP95)
    }
  })
})
