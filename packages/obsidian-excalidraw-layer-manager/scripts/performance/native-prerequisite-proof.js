// Corroboration from the controller's observed child exit, not the child's semantic result.
export function assertNativePrerequisite(closeout, receipt, expected) {
  if (
    closeout?.failure !== null ||
    !["stopped", "already-absent"].includes(closeout.cleanup?.status)
  )
    throw Error("prerequisite has failed/incomplete closeout")
  if (
    receipt?.schema !== "ak5583-prerequisite-exit-v1" ||
    receipt.kind !== expected.kind ||
    receipt.output !== expected.output ||
    receipt.code !== 0 ||
    receipt.signal !== null ||
    !Number.isSafeInteger(receipt.pid) ||
    receipt.pid <= 0
  )
    throw Error("successful controller-observed prerequisite exit required")
}
