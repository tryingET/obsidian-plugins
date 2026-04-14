import { describe, expect, it, vi } from "vitest"

import type {
  LastQuickMoveDestination,
  SidepanelQuickMovePersistenceService,
} from "../src/ui/sidepanel/quickmove/quickMovePersistenceService.js"
import { createRememberedDestinationReconcileActor } from "../src/ui/sidepanel/quickmove/rememberedDestinationReconcileMachine.js"

const flushAsync = async (turns = 6): Promise<void> => {
  for (let turn = 0; turn < turns; turn += 1) {
    await Promise.resolve()
  }
}

type RememberedDestinationCandidate = Parameters<
  SidepanelQuickMovePersistenceService["previewReboundRememberedDestinations"]
>[0]

type RememberedDestinationPreview = ReturnType<
  SidepanelQuickMovePersistenceService["previewReboundRememberedDestinations"]
>

type RememberedDestinationRebindOutcome = Awaited<
  ReturnType<SidepanelQuickMovePersistenceService["rebindRememberedDestinations"]>
>

type ReconcileServiceStub = Pick<
  SidepanelQuickMovePersistenceService,
  | "previewReboundRememberedDestinations"
  | "shouldSuppressRememberedDestinationRebind"
  | "rebindRememberedDestinations"
>

const makePresetDestination = (label: string): LastQuickMoveDestination => ({
  kind: "preset",
  preset: {
    key: `preset:${label}`,
    label,
    targetParentPath: [label],
    targetFrameId: null,
  },
})

const makeCandidate = (label: string): RememberedDestinationCandidate => {
  const destination = makePresetDestination(label)
  return {
    lastQuickMoveDestination: destination,
    recentQuickMoveDestinations: [destination],
  }
}

const makePreview = (
  candidate: RememberedDestinationCandidate,
  changed = true,
): RememberedDestinationPreview => ({
  ...candidate,
  changed,
})

describe("remembered destination reconcile machine", () => {
  it("notifies when reconciliation reverts because persistence fails", async () => {
    const notify = vi.fn<(message: string) => void>()
    const candidate = makeCandidate("Alpha")

    const service = {
      previewReboundRememberedDestinations: vi.fn((nextCandidate: RememberedDestinationCandidate) =>
        makePreview(nextCandidate),
      ),
      shouldSuppressRememberedDestinationRebind: vi.fn(() => false),
      rebindRememberedDestinations: vi.fn(
        async (): Promise<RememberedDestinationRebindOutcome> => ({
          status: "reconciled",
          persisted: false,
          revertedTo: {
            lastQuickMoveDestination: null,
            recentQuickMoveDestinations: [],
          },
        }),
      ),
    } satisfies ReconcileServiceStub

    const actor = createRememberedDestinationReconcileActor({
      service: service as unknown as SidepanelQuickMovePersistenceService,
      notify,
    })

    actor.start()
    actor.send({ type: "PROJECTION_UPDATED", candidate })
    await flushAsync()

    expect(service.rebindRememberedDestinations).toHaveBeenCalledOnce()
    expect(notify).toHaveBeenCalledWith(
      "Remembered last-move destination reverted because reconciliation could not persist.",
    )

    actor.stop()
  })

  it("skips reconciliation when the candidate is unchanged", async () => {
    const candidate = makeCandidate("Alpha")

    const service = {
      previewReboundRememberedDestinations: vi.fn((nextCandidate: RememberedDestinationCandidate) =>
        makePreview(nextCandidate, false),
      ),
      shouldSuppressRememberedDestinationRebind: vi.fn(() => false),
      rebindRememberedDestinations: vi.fn(),
    } satisfies ReconcileServiceStub

    const actor = createRememberedDestinationReconcileActor({
      service: service as unknown as SidepanelQuickMovePersistenceService,
      notify: vi.fn(),
    })

    actor.start()
    actor.send({ type: "PROJECTION_UPDATED", candidate })
    await flushAsync()

    expect(service.rebindRememberedDestinations).not.toHaveBeenCalled()
    actor.stop()
  })

  it("skips reconciliation when the service suppresses the candidate", async () => {
    const candidate = makeCandidate("Alpha")

    const service = {
      previewReboundRememberedDestinations: vi.fn((nextCandidate: RememberedDestinationCandidate) =>
        makePreview(nextCandidate),
      ),
      shouldSuppressRememberedDestinationRebind: vi.fn(() => true),
      rebindRememberedDestinations: vi.fn(),
    } satisfies ReconcileServiceStub

    const actor = createRememberedDestinationReconcileActor({
      service: service as unknown as SidepanelQuickMovePersistenceService,
      notify: vi.fn(),
    })

    actor.start()
    actor.send({ type: "PROJECTION_UPDATED", candidate })
    await flushAsync()

    expect(service.rebindRememberedDestinations).not.toHaveBeenCalled()
    actor.stop()
  })
})
