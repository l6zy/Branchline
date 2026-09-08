export type BranchTrackingMap = Record<string, {
  upstream?: string
  ahead: number
  behind: number
}>

export function trackedRemoteReference(
  reference: string,
  references: string[],
  remoteBranches: Set<string>,
  branchTracking: BranchTrackingMap,
) {
  const upstream = branchTracking[reference]?.upstream
  if (upstream && remoteBranches.has(upstream) && references.includes(upstream)) return upstream
  return remoteBranches.has(`origin/${reference}`) && references.includes(`origin/${reference}`)
    ? `origin/${reference}`
    : null
}

export function visibleCommitReferences(
  references: string[],
  remoteBranches: Set<string>,
  branchTracking: BranchTrackingMap,
) {
  const hiddenRemotes = new Set<string>()

  references.forEach((reference) => {
    if (remoteBranches.has(reference)) return
    const remote = trackedRemoteReference(reference, references, remoteBranches, branchTracking)
    if (remote) hiddenRemotes.add(remote)
  })

  return references.filter((reference) => !hiddenRemotes.has(reference))
}
