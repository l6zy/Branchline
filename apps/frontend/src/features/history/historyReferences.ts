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
  return upstream && remoteBranches.has(upstream) && references.includes(upstream) ? upstream : null
}

export function visibleCommitReferences(
  references: string[],
  remoteBranches: Set<string>,
  branchTracking: BranchTrackingMap,
) {
  const referencesOnCommit = new Set(references)
  const hiddenRemotes = new Set<string>()

  Object.entries(branchTracking).forEach(([localBranch, tracking]) => {
    const upstream = tracking.upstream
    if (!upstream || !referencesOnCommit.has(localBranch) || !referencesOnCommit.has(upstream)) return
    if (remoteBranches.has(upstream)) hiddenRemotes.add(upstream)
  })

  return references.filter((reference) => !hiddenRemotes.has(reference))
}
