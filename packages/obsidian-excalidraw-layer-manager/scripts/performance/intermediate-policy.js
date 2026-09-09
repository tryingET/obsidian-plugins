// Exploratory sizing only: never admitted into the original v2 baseline aggregate.
import { RESOURCE_LIMITS } from "./native-safety.js"
export const INTERMEDIATE = Object.freeze({
  id: "ak5583-intermediate-v1",
  sizes: [2000, 5000],
  shapes: ["giant", "skewed"],
  seed: 558301,
  cycles: 10,
  fiveKMaxRssMiB: 4096,
  fiveKMaxOperationMs: 15000,
})
export function assertResources(snapshot) {
  if (
    !Number.isFinite(snapshot?.rssMiB) ||
    !Number.isFinite(snapshot?.availableMiB) ||
    snapshot.rssMiB <= 0 ||
    snapshot.rssMiB >= RESOURCE_LIMITS.rssMiB ||
    snapshot.availableMiB < RESOURCE_LIMITS.availableMiB
  )
    throw Error("diagnostic resource gate")
}
export function admitIntermediate(size, shape, previous = [], lockHash = "") {
  if (!INTERMEDIATE.sizes.includes(size) || !INTERMEDIATE.shapes.includes(shape))
    throw Error("unplanned diagnostic size/shape")
  if (size === 2000) return
  if (previous.length !== 2 || new Set(previous.map((r) => r.shape)).size !== 2)
    throw Error("complete 2k pair required")
  for (const shape of INTERMEDIATE.shapes) {
    const r = previous.find((r) => r.shape === shape)
    if (
      !r ||
      r.purpose !== INTERMEDIATE.id ||
      r.size !== 2000 ||
      r.status !== "passed" ||
      !/^[a-f0-9]{64}$/.test(lockHash) ||
      r.lockHash !== lockHash ||
      r.samples !== 90 ||
      r.cleanup?.status !== "stopped" ||
      r.failure !== null ||
      !Number.isFinite(r.peakRssMiB) ||
      r.peakRssMiB <= 0 ||
      r.peakRssMiB > INTERMEDIATE.fiveKMaxRssMiB ||
      !Number.isFinite(r.maxOperationMs) ||
      r.maxOperationMs <= 0 ||
      r.maxOperationMs > INTERMEDIATE.fiveKMaxOperationMs
    )
      throw Error("2k proof/headroom insufficient for useful bounded 5k bracketing")
  }
}
