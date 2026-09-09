// Native admission policy; checks identity, not authenticity of caller-supplied data.
export const RESOURCE_LIMITS = Object.freeze({
  rssMiB: 8192,
  availableMiB: 4096,
  operationMs: 120000,
  startupMs: 120000,
})

export function assertHostIdentity(owned, observed) {
  for (const key of ["vault", "profile", "pid", "start", "targetId", "nonce", "scriptHash"]) {
    if (owned[key] === undefined || owned[key] !== observed[key])
      throw Error(`host identity mismatch: ${key}`)
  }
  if (observed.url !== "app://obsidian.md/index.html" || observed.native !== true)
    throw Error("not native Obsidian")
}

export function admitSize(size, state) {
  const sizes = [1000, 10000, 50000, 100000]
  const index = sizes.indexOf(size)
  if (index < 0) throw Error("unfrozen size")
  if (state.effect !== "settled")
    throw Error("effects indeterminate: reconcile before any further work")
  if (
    !Number.isFinite(state.rssMiB) ||
    !Number.isFinite(state.availableMiB) ||
    state.rssMiB >= RESOURCE_LIMITS.rssMiB ||
    state.availableMiB < RESOURCE_LIMITS.availableMiB
  )
    throw Error("resource gate")
  if (
    index > 0 &&
    (!state.pilotPassed || !sizes.slice(0, index).every((n) => state.completedSizes.includes(n)))
  )
    throw Error("pilot/predecessor proof missing")
}
