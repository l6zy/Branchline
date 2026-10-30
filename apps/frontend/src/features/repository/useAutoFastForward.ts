import { useEffect, useRef, useState } from 'react'
import { fastForwardRepositoryBranch, type RepositorySnapshot } from '../../repository'
import { getAutoFastForwardBranches } from './branchSwitch'
import { sameRepositoryPath } from './repositoryPaths'

type Options = {
  repository: RepositorySnapshot | null
  configuredBranches: readonly string[]
  fetchCompletion: { snapshot: RepositorySnapshot } | null
  busy: boolean
  onSnapshot: (snapshot: RepositorySnapshot) => void
  onNotice: (message: string) => void
  onBranchPulling: (branch: string, pulling: boolean) => void
  onRunningChange: (branch: string | null) => void
}

export function useAutoFastForward(options: Options) {
  const latest = useRef(options)
  latest.current = options
  const processed = useRef<Options['fetchCompletion']>(null)
  const lifecycle = useRef(0)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    lifecycle.current += 1
    return () => { lifecycle.current += 1 }
  }, [])

  useEffect(() => {
    const completion = options.fetchCompletion
    if (!completion || processed.current === completion || running || options.busy) return
    processed.current = completion
    const initial = latest.current
    let snapshot = completion.snapshot
    const version = lifecycle.current
    const stillActive = () => lifecycle.current === version
      && sameRepositoryPath(latest.current.repository?.path, snapshot.path)
      && latest.current.repository?.branch === completion.snapshot.branch
    if (!stillActive() || initial.repository?.operation) return
    const branches = getAutoFastForwardBranches(snapshot, initial.configuredBranches)
    if (!branches.length) return

    setRunning(true)
    const run = async () => {
      try {
        for (const branch of branches) {
          if (!stillActive()) break
          const current = latest.current
          if (!current.repository || current.repository.operation) break
          const eligible = getAutoFastForwardBranches({
            ...snapshot,
            branch: current.repository.branch,
            branches: current.repository.branches,
            worktrees: current.repository.worktrees,
          }, current.configuredBranches)
          if (!eligible.includes(branch)) continue
          current.onBranchPulling(branch, true)
          current.onRunningChange(branch)
          try {
            const updated = await fastForwardRepositoryBranch(snapshot.path, branch)
            if (!stillActive() || updated.branch !== current.repository.branch) break
            snapshot = updated
            latest.current.onSnapshot(updated)
          } catch (error) {
            if (stillActive()) current.onNotice(`自动快进 ${branch} 失败：${error instanceof Error ? error.message : String(error)}`)
          } finally {
            current.onBranchPulling(branch, false)
          }
        }
      } finally {
        initial.onRunningChange(null)
        setRunning(false)
      }
    }
    void run()
  }, [options.fetchCompletion, options.busy, running])
}
