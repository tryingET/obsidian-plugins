// Pure staging instrumentation; embedded explicitly by buildNativeSentinelExpression.
export function createStagingAudit() {
  const same = (a, b) =>
    a === b ||
    (!!a &&
      !!b &&
      ["value", "get", "set", "writable", "enumerable", "configurable"].every((k) => a[k] === b[k]))
  const restore = (entries) => {
    const conflicts = []
    for (const entry of [...entries].reverse()) {
      if (!entry.attempted) continue
      try {
        const current = Object.getOwnPropertyDescriptor(entry.object, entry.key)
        if (same(current, entry.before)) continue
        if (!same(current, entry.installed)) throw Error("ownership conflict")
        if (entry.before) Object.defineProperty(entry.object, entry.key, entry.before)
        else if (!Reflect.deleteProperty(entry.object, entry.key)) throw Error("delete refused")
        if (!same(Object.getOwnPropertyDescriptor(entry.object, entry.key), entry.before))
          throw Error("restore mismatch")
      } catch (error) {
        conflicts.push({ key: entry.key, error: String(error) })
      }
    }
    return { status: conflicts.length ? "unresolved" : "restored", conflicts }
  }
  return {
    slots(entries) {
      const planned = entries.map((entry) => {
        const before = Object.getOwnPropertyDescriptor(entry.object, entry.key)
        if (before && (!("value" in before) || !before.configurable || !before.writable))
          throw Error("staging slot is not ordinary writable data")
        return {
          ...entry,
          before,
          installed: {
            ...(before ?? { writable: true, configurable: true, enumerable: true }),
            value: entry.value,
          },
          attempted: false,
        }
      })
      return {
        install() {
          for (const entry of planned) {
            entry.attempted = true
            Object.defineProperty(entry.object, entry.key, entry.installed)
          }
        },
        restore: () => restore(planned),
      }
    },
    async command(proto, targets, action, pinnedEA, pending, expectedPlannerError) {
      const key = "copyViewElementsToEAforEditing",
        before = Object.getOwnPropertyDescriptor(proto, key)
      if (!before || typeof before.value !== "function" || !before.writable)
        throw Error("staging audit: unsupported observer descriptor")
      if (pending && !pending.check())
        throw Error("staging audit: pending sentinels absent before dispatch")
      const calls = []
      const wrapper = function (...args) {
        calls.push({
          ea: this,
          ids: Array.isArray(args[0]) ? args[0].map((e) => e?.id) : null,
          argCount: args.length,
          isolated: pending
            ? this.elementsDict !== pending.elements && this.imagesDict !== pending.images
            : null,
        })
        return before.value.apply(this, args)
      }
      const entry = {
        object: proto,
        key,
        before,
        installed: { ...before, value: wrapper },
        attempted: true,
      }
      let outcome, failure, cleanup
      try {
        Object.defineProperty(proto, key, entry.installed)
        outcome = await action()
      } catch (error) {
        failure = String(error)
      } finally {
        cleanup = restore([entry])
      }
      const proof = {
        copyCalls: calls.length,
        targets,
        matchedEA: calls.length === 1 && (!pinnedEA || calls[0].ea === pinnedEA),
        observed: calls.map(({ ids, argCount, isolated }) => ({ ids, argCount, isolated })),
        pendingAtDispatch: !!pending,
        outcome,
        cleanup,
      }
      if (expectedPlannerError !== undefined) {
        if (
          failure ||
          cleanup.status !== "restored" ||
          calls.length !== 0 ||
          outcome?.status !== "plannerError" ||
          outcome.error !== expectedPlannerError
        )
          throw Object.assign(Error("staging audit: expected rejection before any native copy"), {
            audit: proof,
          })
        return { outcome, ea: null, proof }
      }
      if (
        failure ||
        cleanup.status !== "restored" ||
        !proof.matchedEA ||
        calls[0]?.argCount !== 1 ||
        (pending && calls[0]?.isolated !== true) ||
        JSON.stringify(calls[0]?.ids) !== JSON.stringify(targets)
      )
        throw Object.assign(
          Error(`staging audit: ${failure ?? "observation or restoration mismatch"}`),
          { audit: proof },
        )
      return { outcome, ea: calls[0].ea, proof }
    },
  }
}

// Trusted critical-check inventory, never inferred from an untrusted run result.
// Additional diagnostic checks are allowed; these exact names must all pass.
export const requiredCheckNames = Object.freeze([
  "Given the verified host When native sentinels start Then the pinned plugin is present",
  "Given native EA fixtures When inserted Then exact mixed geometry and foreign metadata survive",
  "When opened Then exactly one native manager is live",
  "When manager opens Then full mixed native scene and normalized runtime agree",
  "ordinary capture rename: exact native staging route",
  "ordinary capture rename: command applied",
  "ordinary capture rename: exact scene, order, geometry and metadata",
  "external A edit: exact native geometry/color/metadata and event-driven runtime cache",
  "external A version advanced",
  "B rename after fresh external A with OLD A pending: exact native staging route",
  "B rename after fresh external A with OLD A pending: command applied",
  "B rename after fresh external A with OLD A pending: exact scene, order, geometry and metadata",
  "B rename after fresh external A with OLD A pending: pending staging preserved",
  "When B is renamed Then its native version advances and fresh A is not replayed",
  "Given synthetic undo keys Then a real focused native canvas exists",
  "When native undo handles synthetic keys Then only the last rename is reverted",
  "When native redo handles synthetic keys Then the exact rename is reapplied",
  "When undo/redo completes Then foreign staging is unchanged",
  "ordinary final rename: exact native staging route",
  "ordinary final rename: command applied",
  "ordinary final rename: exact scene, order, geometry and metadata",
  "ordinary final rename: pending staging preserved",
  "frame rename: exact native staging route",
  "frame rename: command applied",
  "frame rename: exact scene, order, geometry and metadata",
  "frame rename: pending staging preserved",
  "hide: exact native staging route",
  "hide: command applied",
  "hide: exact scene, order, geometry and metadata",
  "hide: pending staging preserved",
  "show: exact native staging route",
  "show: command applied",
  "show: exact scene, order, geometry and metadata",
  "show: pending staging preserved",
  "lock: exact native staging route",
  "lock: command applied",
  "lock: exact scene, order, geometry and metadata",
  "lock: pending staging preserved",
  "unlock: exact native staging route",
  "unlock: command applied",
  "unlock: exact scene, order, geometry and metadata",
  "unlock: pending staging preserved",
  "create exact group: exact native staging route",
  "create exact group: command applied",
  "create exact group: exact scene, order, geometry and metadata",
  "create exact group: pending staging preserved",
  "When grouping Then exact native/runtime selection identifies both members",
  "Cross-frame move: exact rejection before native copy",
  "Cross-frame rejection: exact scene and frame membership",
  "Cross-frame rejection: pending staging preserved",
  "reparent within root: exact native staging route",
  "reparent within root: command applied",
  "reparent within root: exact scene, order, geometry and metadata",
  "reparent within root: pending staging preserved",
  "When all facade mutations finish Then complete actual staging dictionaries are preserved",
  "When test staging is removed Then original dictionaries/descriptors are restored exactly",
  "Given disposable navigation fixtures Then neither path already exists",
  "When opening as markdown Then the same live runtime clears its scene",
  "When reopened Then the native view/API are new and the same runtime has advanced",
  "When saved/reopened Then all mixed geometry, order, text/freehand, frame membership and metadata survive",
  "Given disposal Then the exact native manager tab exists",
  "When the native tab closes Then the runtime and roots stay disposed",
  "When navigating to AK5583_sentinel_plain.md Then the disposed manager does not resurrect",
  "When navigating to AK5583_sentinel_second.md Then the disposed manager does not resurrect",
  "When navigating to testing.md Then the disposed manager does not resurrect",
])
