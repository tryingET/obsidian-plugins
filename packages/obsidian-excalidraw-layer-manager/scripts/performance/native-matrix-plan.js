import { NATIVE_POLICY as policy } from "./native-policy.js"
export function buildMatrixPlan() {
  const cases = []
  for (const size of policy.sizes) {
    const cells = policy.trainingSeeds.flatMap((seed) =>
      policy.shapes.map((shape) => ({ size, seed, shape })),
    )
    let state = 5583 + size
    for (let i = cells.length - 1; i > 0; i--) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      const j = state % (i + 1)
      ;[cells[i], cells[j]] = [cells[j], cells[i]]
    }
    for (const cell of cells) {
      const pass = policy.trainingSeeds.indexOf(cell.seed)
      // Counterbalance which unchanged role goes first while retaining adjacent seed pairing.
      const roles = pass % 2 ? ["calibration", "baseline"] : ["baseline", "calibration"]
      for (const role of roles)
        cases.push({
          ...cell,
          pass,
          role,
          id: `${size}-${cell.shape}-${cell.seed}-${role}-${pass}`,
          status: "pending",
        })
    }
    for (const seed of policy.holdoutSeeds)
      for (const shape of policy.shapes)
        cases.push({
          size,
          seed,
          shape,
          pass: 0,
          role: "holdout",
          id: `${size}-${shape}-${seed}-holdout-0`,
          status: "pending",
        })
  }
  return cases
}
