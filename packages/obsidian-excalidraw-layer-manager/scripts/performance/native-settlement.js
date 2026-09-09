// Synchronization only: never dispatches/replays an action. All times share one origin.
export async function settleUntilStable(observe, deadline) {
  let attempts = 0
  while (observe.now() < deadline) {
    attempts++
    if (!observe.ready()) {
      await observe.frame()
      continue
    }
    const identity = observe.identity(),
      settlement = observe.now(),
      opportunities = []
    for (let i = 0; i < 2; i++) {
      await observe.frame()
      opportunities.push(observe.now())
      if (observe.identity() !== identity || !observe.ready()) break
    }
    if (
      opportunities.length === 2 &&
      observe.now() < deadline &&
      observe.identity() === identity &&
      observe.ready()
    )
      return { settlement, opportunities, attempts, identity }
  }
  throw Error(
    "settlement timeout: semantic state and identity did not stabilize across two render opportunities",
  )
}
