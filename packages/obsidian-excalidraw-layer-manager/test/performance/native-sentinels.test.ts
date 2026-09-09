import { afterEach, describe, expect, it, vi } from "vitest"
// @ts-expect-error -- Pure JS helper is also tested across its native serialization boundary.
import { createStagingAudit } from "../../scripts/performance/native-sentinel-audit.js"
// @ts-expect-error -- Native fixture factory is independently serialized and runtime-tested.
import { createMixedFixture } from "../../scripts/performance/native-sentinel-fixture.js"
// @ts-expect-error -- Native browser program is serialized; these are synthetic negative preflight tests.
import * as sentinels from "../../scripts/performance/native-sentinels.js"

const { runNativeSentinels } = sentinels

// Execute only the actual fixture metadata loop; synthetic EA data, never native proof.
function decorateFixture(element: { customData?: Record<string, unknown> }, kind: string) {
  const source = createMixedFixture.toString()
  const start = source.indexOf("for (const [kind, id] of Object.entries(ids)) {")
  const end = source.indexOf("ea.getElement(ids.ordinary).name", start)
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  new Function("ea", "ids", source.slice(start, end))(
    { getElement: () => element },
    { [kind]: "fixture" },
  )
  return element.customData
}
describe("Given native fixture metadata construction (synthetic source-slice tests)", () => {
  it("When constructing the mixed fixture Then use a resident font and explicit native freehand defaults", async () => {
    const elements = new Map<string, Record<string, unknown>>()
    let serial = 0,
      textFont = 0
    const add = (type: string) => {
      const id = String(++serial)
      elements.set(id, { id, type })
      return id
    }
    const ea = {
      style: { fontFamily: 5 },
      addRect: () => add("rectangle"),
      addFrame: () => add("frame"),
      addLine: () => add("line"),
      addText: async () => {
        textFont = ea.style.fontFamily
        return add("text")
      },
      getElement: (id: string) => {
        const e = elements.get(id)
        if (!e) throw Error("fixture")
        return e
      },
      getElements: () => [...elements.values()],
    }
    const result = await createMixedFixture(ea)
    expect(textFont).toBe(2)
    expect(ea.style.fontFamily).toBe(5)
    expect(elements.get(result.ids.text)?.["labelPosition"]).toBeNull()
    expect(elements.get(result.ids.freehand)?.["strokeOptions"]).toEqual({
      variability: "variable",
      streamline: 0.5,
    })
    expect(result.authoredFixture).toHaveLength(6)
  })
  it("When EA already authored metadata Then frame colors and foreign/unknown fields survive sentinel decoration", () => {
    const colors = { stroke: "#112233", fill: "#445566", nameColor: "#778899" }
    const customData = {
      frameColor: colors,
      owner: "EA",
      foreign: { existing: true },
      lmx: { prior: "keep" },
    }
    const result = decorateFixture({ customData }, "frame")
    expect(result).toEqual({
      frameColor: colors,
      owner: "EA",
      foreign: { existing: true, sentinel: "foreign-frame" },
      lmx: { prior: "keep", unknownKey: "unknown-frame" },
    })
    expect(customData.foreign).toEqual({ existing: true })
  })
  it("When EA omitted frameColor Then the frame fixture authors explicit valid colors before insertion without decorating ordinary elements as frames", () => {
    expect(decorateFixture({}, "frame")).toEqual({
      frameColor: { stroke: "#D4D4D4", fill: "#ADADAD", nameColor: "#7A7A7A" },
      foreign: { sentinel: "foreign-frame" },
      lmx: { unknownKey: "unknown-frame" },
    })
    expect(decorateFixture({}, "ordinary")).toEqual({
      foreign: { sentinel: "foreign-ordinary" },
      lmx: { unknownKey: "unknown-ordinary" },
    })
  })
})

const originalElectron = Object.getOwnPropertyDescriptor(process.versions, "electron")
const serialize = () => (config: { output: string }) =>
  new Function(`return (${sentinels.buildNativeSentinelExpression(config)})`)()
afterEach(() => {
  vi.unstubAllGlobals()
  if (originalElectron) Object.defineProperty(process.versions, "electron", originalElectron)
  else Reflect.deleteProperty(process.versions, "electron")
})
function fakeNative() {
  Object.defineProperty(process.versions, "electron", {
    value: "synthetic-test",
    configurable: true,
  })
  const fs = {
    realpathSync: (path: string) => path,
    writeFileSync: vi.fn(),
    appendFileSync: vi.fn(),
  }
  vi.stubGlobal("require", () => fs)
  vi.stubGlobal("app", { vault: { adapter: { basePath: "/owned/run/vault" } } })
  return fs
}
describe("Given supplementary native sentinel preflight (synthetic tests, not native proof)", () => {
  it("When called in Node Then it refuses to label the proxy native", async () => {
    const result = await runNativeSentinels({ output: "/owned/run" })
    expect(result.status).toBe("failed")
    expect(result.error).toContain("native Electron")
  })
  it("When output is outside the verified disposable vault parent Then no evidence or fixture is written", async () => {
    const fs = fakeNative()
    const result = await serialize()({ output: "/foreign" })
    expect(result.status).toBe("failed")
    expect(result.error).toContain("output")
    expect(fs.writeFileSync).not.toHaveBeenCalled()
  })
  it("When an existing manager is present Then a serialized function refuses implicit adoption", async () => {
    const fs = fakeNative()
    vi.stubGlobal("excalidrawLayerManagerRuntime", {})
    const serialized = serialize()
    const result = await serialized({ output: "/owned/run" })
    expect(result.status).toBe("failed")
    expect(result.error).toContain("closed manager")
    expect(fs.writeFileSync).not.toHaveBeenCalled()
  })
  it("When a prior sentinel log already exists Then no mutation is replayed or appended", async () => {
    const fs = fakeNative()
    fs.writeFileSync.mockImplementation(() => {
      throw Object.assign(Error("existing attempt"), { code: "EEXIST" })
    })
    const result = await serialize()({ output: "/owned/run" })
    expect(result.status).toBe("failed")
    expect(result.error).toContain("existing attempt")
    expect(fs.appendFileSync).not.toHaveBeenCalled()
  })
})

// Evaluate literal production expressions without module-local bindings; no host contact.
describe("Given an explicit native expression builder (synthetic serialization tests)", () => {
  it("When config contains quoted source-like text Then the literal expression preserves it as data", async () => {
    const fs = fakeNative()
    const output = '/foreign/"), globalThis.injected = true, ("'
    const result = await serialize()({ output })
    expect(result.error).toContain("output")
    expect(fs.writeFileSync).not.toHaveBeenCalled()
    expect(Object.hasOwn(globalThis, "injected")).toBe(false)
  })
  it("When the literal expression is evaluated without module bindings Then native preflight still fails closed", async () => {
    expect(sentinels.buildNativeSentinelExpression).toBeTypeOf("function")
    const expression = sentinels.buildNativeSentinelExpression({ output: '/owned/"quoted"/run' })
    expect(expression).toContain("function createStagingAudit")
    expect(Object.hasOwn(runNativeSentinels, "toString")).toBe(false)
    const result = await new Function(`return (${expression})`)()
    expect(result.status).toBe("failed")
    expect(result.error).toContain("native Electron")
  })
  it("When the controller reads the trusted inventory Then critical staging, persistence and disposal checks are required", () => {
    expect(sentinels.requiredCheckNames).toEqual(
      expect.arrayContaining([
        "external A version advanced",
        "B rename after fresh external A with OLD A pending: exact native staging route",
        "When saved/reopened Then all mixed geometry, order, text/freehand, frame membership and metadata survive",
        "When navigating to testing.md Then the disposed manager does not resurrect",
      ]),
    )
    expect(new Set(sentinels.requiredCheckNames).size).toBe(sentinels.requiredCheckNames.length)
  })
})

function auditFactory() {
  const source = createStagingAudit.toString()
  expect(sentinels.buildNativeSentinelExpression({ output: "/owned/run" })).toContain(source)
  return new Function(`return (${source})`)()()
}
function prototypeFixture() {
  // Deliberately pure: these instances are not a native host.
  const proto = { copyViewElementsToEAforEditing(_elements: { id: string }[]) {} }
  const descriptor = Object.getOwnPropertyDescriptor(proto, "copyViewElementsToEAforEditing")
  const a = { elementsDict: {}, imagesDict: {} },
    b = { elementsDict: {}, imagesDict: {} }
  return { proto, descriptor, a, b }
}
describe("Given target-specific native command-EA staging observation (synthetic helper tests)", () => {
  it("When a cross-frame move is rejected by contract Then require exact planner error and ZERO native copies", async () => {
    const w = prototypeFixture(),
      audit = createStagingAudit(),
      error = "Cross-frame moves are not supported."
    const result = await audit.command(
      w.proto,
      ["A"],
      async () => ({ status: "plannerError", error }),
      w.a,
      undefined,
      error,
    )
    expect(result.outcome).toEqual({ status: "plannerError", error })
    expect(result.proof.copyCalls).toBe(0)
    await expect(
      audit.command(
        w.proto,
        ["A"],
        async () => {
          w.proto.copyViewElementsToEAforEditing.call(w.a, [{ id: "A" }])
          return { status: "plannerError", error }
        },
        w.a,
        undefined,
        error,
      ),
    ).rejects.toThrow()
    await expect(
      audit.command(w.proto, ["A"], async () => ({ status: "applied" }), w.a, undefined, error),
    ).rejects.toThrow()
    expect(Object.getOwnPropertyDescriptor(w.proto, "copyViewElementsToEAforEditing")).toEqual(
      w.descriptor,
    )
  })
  it("When the pinned EA temporarily isolates both dictionaries Then exact copying and restored pending state are observable", async () => {
    const w = prototypeFixture(),
      audit = auditFactory()
    const elements = w.a.elementsDict,
      images = w.a.imagesDict
    const pending = {
      elements,
      images,
      check: () => w.a.elementsDict === elements && w.a.imagesDict === images,
    }
    const result = await audit.command(
      w.proto,
      ["B"],
      async () => {
        w.a.elementsDict = {}
        w.a.imagesDict = {}
        try {
          w.proto.copyViewElementsToEAforEditing.call(w.a, [{ id: "B" }])
          return { status: "applied" }
        } finally {
          w.a.elementsDict = elements
          w.a.imagesDict = images
        }
      },
      w.a,
      pending,
    )
    expect(result.proof).toMatchObject({
      matchedEA: true,
      pendingAtDispatch: true,
      observed: [{ ids: ["B"], isolated: true, argCount: 1 }],
      cleanup: { status: "restored" },
    })
    expect(pending.check()).toBe(true)
  })
  it("When a pending dictionary is used directly during copying Then isolation cannot be reported as passed", async () => {
    const w = prototypeFixture(),
      audit = auditFactory()
    const pending = { elements: w.a.elementsDict, images: w.a.imagesDict, check: () => true }
    await expect(
      audit.command(
        w.proto,
        ["B"],
        async () => {
          w.proto.copyViewElementsToEAforEditing.call(w.a, [{ id: "B" }])
        },
        w.a,
        pending,
      ),
    ).rejects.toThrow("staging audit")
    expect(Object.getOwnPropertyDescriptor(w.proto, "copyViewElementsToEAforEditing")).toEqual(
      w.descriptor,
    )
  })
  it("When pending sentinels are absent before dispatch Then no native command is called", async () => {
    const w = prototypeFixture(),
      audit = auditFactory(),
      action = vi.fn()
    await expect(
      audit.command(w.proto, ["B"], action, w.a, { check: () => false }),
    ).rejects.toThrow("pending sentinels absent")
    expect(action).not.toHaveBeenCalled()
  })
  it("When B is copied on the intended EA Then the target/instance proof and descriptor restoration are exact", async () => {
    const w = prototypeFixture(),
      audit = auditFactory()
    const result = await audit.command(
      w.proto,
      ["B"],
      async () => {
        w.proto.copyViewElementsToEAforEditing.call(w.a, [{ id: "B" }])
        return { status: "applied" }
      },
      w.a,
    )
    expect(result.ea).toBe(w.a)
    expect(result.proof).toMatchObject({ copyCalls: 1, targets: ["B"], matchedEA: true })
    expect(Object.getOwnPropertyDescriptor(w.proto, "copyViewElementsToEAforEditing")).toEqual(
      w.descriptor,
    )
  })
  it("When B is copied on another EA or A is copied incidentally Then an idle staging dictionary cannot pass", async () => {
    for (const wrong of ["instance", "target"]) {
      const w = prototypeFixture(),
        audit = auditFactory()
      await expect(
        audit.command(
          w.proto,
          ["B"],
          async () => {
            w.proto.copyViewElementsToEAforEditing.call(wrong === "instance" ? w.b : w.a, [
              { id: wrong === "target" ? "A" : "B" },
            ])
          },
          w.a,
        ),
      ).rejects.toThrow("staging audit")
      expect(Object.getOwnPropertyDescriptor(w.proto, "copyViewElementsToEAforEditing")).toEqual(
        w.descriptor,
      )
    }
  })
  it("When incidental or multiple-instance copying occurs Then initial capture rejects ambiguity", async () => {
    const w = prototypeFixture(),
      audit = auditFactory()
    await expect(
      audit.command(w.proto, ["A"], async () => {
        w.proto.copyViewElementsToEAforEditing.call(w.a, [{ id: "A" }])
        w.proto.copyViewElementsToEAforEditing.call(w.b, [{ id: "A" }])
      }),
    ).rejects.toThrow("staging audit")
  })
  it("When a native command rejects Then the whole observer descriptor is still restored", async () => {
    const w = prototypeFixture(),
      audit = auditFactory()
    await expect(
      audit.command(
        w.proto,
        ["A"],
        async () => {
          w.proto.copyViewElementsToEAforEditing.call(w.a, [{ id: "A" }])
          throw Error("command rejected")
        },
        w.a,
      ),
    ).rejects.toThrow("command rejected")
    expect(Object.getOwnPropertyDescriptor(w.proto, "copyViewElementsToEAforEditing")).toEqual(
      w.descriptor,
    )
  })
  it("When another writer replaces the observer Then restoration reports unresolved rather than overwriting it", async () => {
    const w = prototypeFixture(),
      audit = auditFactory(),
      replacement = () => {}
    await expect(
      audit.command(
        w.proto,
        ["A"],
        async () => {
          w.proto.copyViewElementsToEAforEditing.call(w.a, [{ id: "A" }])
          w.proto.copyViewElementsToEAforEditing = replacement
        },
        w.a,
      ),
    ).rejects.toMatchObject({ audit: { cleanup: { status: "unresolved" } } })
    expect(w.proto.copyViewElementsToEAforEditing).toBe(replacement)
  })
  it("When a later sentinel insertion fails Then already-armed rollback restores prior descriptors and removes earlier inserts", () => {
    const audit = auditFactory(),
      old = { id: "old" },
      stale = { id: "A" },
      dict: Record<string, unknown> = {}
    Object.defineProperty(dict, "A", {
      value: old,
      writable: true,
      configurable: true,
      enumerable: false,
    })
    const original = Object.getOwnPropertyDescriptor(dict, "A")
    const failing = new Proxy(
      {},
      {
        defineProperty() {
          throw Error("partial insertion")
        },
      },
    )
    const staged = audit.slots([
      { object: dict, key: "A", value: stale },
      { object: dict, key: "absent", value: {} },
      { object: failing, key: "image", value: {} },
    ])
    const rollback = () => staged.restore() // armed before install
    expect(() => staged.install()).toThrow("partial insertion")
    expect(rollback().status).toBe("restored")
    expect(Object.getOwnPropertyDescriptor(dict, "A")).toEqual(original)
    expect(Object.hasOwn(dict, "absent")).toBe(false)
  })
  it("When a command rejects with sentinels pending Then finally cleanup restores the exact old A slot", async () => {
    const w = prototypeFixture(),
      audit = auditFactory(),
      dict: Record<string, unknown> = { A: { id: "prior" } },
      prior = dict["A"]
    const staged = audit.slots([{ object: dict, key: "A", value: { id: "stale-A" } }])
    staged.install()
    try {
      await expect(
        audit.command(
          w.proto,
          ["B"],
          async () => {
            throw Error("command rejected")
          },
          w.a,
        ),
      ).rejects.toThrow("command rejected")
    } finally {
      expect(staged.restore().status).toBe("restored")
    }
    expect(dict["A"]).toBe(prior)
  })
  it("When a staged slot is changed by another writer Then rollback records unresolved and preserves the foreign value", () => {
    const audit = auditFactory(),
      dict: Record<string, unknown> = {},
      staged = audit.slots([{ object: dict, key: "A", value: { id: "stale" } }])
    staged.install()
    const foreign = { id: "foreign" }
    dict["A"] = foreign
    expect(staged.restore().status).toBe("unresolved")
    expect(dict["A"]).toBe(foreign)
  })
})
