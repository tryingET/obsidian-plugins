// Native EA input construction, independent of the LayerManager subject.
export async function createMixedFixture(ea) {
  const addStableText = async () => {
    const before = ea.style.fontFamily
    try {
      ea.style.fontFamily = 2
      return await ea.addText(300, 20, "AK5583 text sentinel")
    } finally {
      ea.style.fontFamily = before
    }
  }
  const ids = {
    ordinary: ea.addRect(20, 20, 40, 30),
    other: ea.addRect(90, 20, 40, 30),
    frame: ea.addFrame(0, 180, 240, 160, "Frame original"),
    child: ea.addRect(20, 210, 40, 30),
    text: await addStableText(),
    freehand: ea.addLine([
      [300, 100],
      [312, 108],
      [321, 96],
      [333, 111],
    ]),
  }
  ea.getElement(ids.child).frameId = ids.frame
  ea.getElement(ids.text).labelPosition = null
  const freehand = ea.getElement(ids.freehand)
  freehand.type = "freedraw"
  freehand.pressures = []
  freehand.simulatePressure = true
  freehand.lastCommittedPoint = null
  freehand.strokeOptions = { variability: "variable", streamline: 0.5 }
  for (const key of ["startBinding", "endBinding", "startArrowhead", "endArrowhead", "elbowed"])
    delete freehand[key]
  for (const [kind, id] of Object.entries(ids)) {
    const element = ea.getElement(id),
      prior = element.customData ?? {}
    element.customData = {
      ...prior,
      foreign: { ...prior.foreign, sentinel: `foreign-${kind}` },
      lmx: { ...prior.lmx, unknownKey: `unknown-${kind}` },
    }
    // Author frame colors before insertion; preserve EA colors when already present.
    if (kind === "frame")
      element.customData.frameColor ??= {
        stroke: "#D4D4D4",
        fill: "#ADADAD",
        nameColor: "#7A7A7A",
      }
  }
  ea.getElement(ids.ordinary).name = "Legacy ordinary"
  ea.getElement(ids.ordinary).customData.lmx.label = "Ordinary initial"
  ea.getElement(ids.frame).customData.lmx.label = "Legacy frame label"
  return { ids, authoredFixture: structuredClone(ea.getElements()) }
}
