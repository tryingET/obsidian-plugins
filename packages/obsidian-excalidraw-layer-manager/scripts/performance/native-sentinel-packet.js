// Required names come from the independently frozen contract, never the received result.
export function validateSentinelReceipt(result, required) {
  if (
    !Array.isArray(required) ||
    required.length === 0 ||
    new Set(required).size !== required.length ||
    !required.every((name) => typeof name === "string" && name.length > 0)
  )
    throw Error("required sentinel inventory invalid")
  if (result?.status !== "passed" || result.native !== true || !Array.isArray(result.checks))
    throw Error("native sentinel failure")
  if (
    !result.checks.every(
      (check) => typeof check.name === "string" && check.name.length > 0 && check.pass === true,
    )
  )
    throw Error("failed or malformed sentinel check")
  for (const name of required)
    if (result.checks.filter((check) => check.name === name).length !== 1)
      throw Error(`required sentinel proof missing/duplicated: ${name}`)
  return result
}
