import type { BlameLine, CommandLogEntry, ConflictFileContent, FileHistoryEntry, GitUserConfig, MergeQueueSnapshot, RebasePreview, RepositoryBranchTracking, RepositoryCommitStats, RepositoryComparison, RepositoryDiffLine, RepositoryFile, RepositorySnapshot } from '@branchline/git-models'

export type {
  BlameLine,
  CommandLogEntry,
  ConflictFileContent,
  FileHistoryEntry,
  GitUserConfig,
  MergeCandidate,
  MergeQueueSnapshot,
  RepositoryCommit,
  RepositoryBranchTracking,
  RepositoryCommitStats,
  RepositoryCommitTemplate,
  RepositoryDiffLine,
  RepositoryFile,
  RepositoryComparison,
  RepositorySnapshot,
  RepositoryOperationState,
  RepositoryOperationStep,
  RepositoryStash,
  RepositorySubmodule,
  RepositoryWorktree,
  RebasePreview,
} from '@branchline/git-models'

export async function loadGitUserConfig() {
  return invoke<GitUserConfig>('load_git_user_config', {})
}

export async function updateGitUserConfig(config: GitUserConfig) {
  return invoke<GitUserConfig>('update_git_user_config', config)
}

export async function updateRepositoryCommitTemplate(repositoryPath: string, content: string) {
  return invoke<RepositorySnapshot>('update_repository_commit_template', { repositoryPath, content })
}

export async function clearRepositoryCommitTemplate(repositoryPath: string) {
  return invoke<RepositorySnapshot>('clear_repository_commit_template', { repositoryPath })
}

export async function loadCommandLogs() {
  return invoke<CommandLogEntry[]>('load_command_logs', {})
}

export async function clearCommandLogs() {
  return invoke('clear_command_logs', {})
}

export function isTauriRuntime() {
  return '__TAURI_INTERNALS__' in window
}

async function invoke<T>(command: string, args: Record<string, unknown>) {
  if (!isTauriRuntime()) {
    throw new Error('本地仓库操作需要桌面版。请运行 pnpm desktop:dev。')
  }
  const { invoke: tauriInvoke } = await import('@tauri-apps/api/core')
  return tauriInvoke<T>(command, args)
}

export async function loadRepository(path: string) {
  return invoke<RepositorySnapshot>('load_repository', { path })
}

export async function loadRepositoryStateToken(repositoryPath: string) {
  return invoke<string>('load_repository_state_token', { repositoryPath })
}

export async function pickAndLoadRepository(): Promise<RepositorySnapshot | null> {
  if (!isTauriRuntime()) {
    throw new Error('打开本地仓库需要桌面版。请运行 pnpm desktop:dev。')
  }
  const { open } = await import('@tauri-apps/plugin-dialog')
  const selected = await open({ directory: true, multiple: false, title: '打开 Git 仓库' })
  const path = Array.isArray(selected) ? selected[0] : selected
  return path ? loadRepository(path) : null
}

export async function loadRepositoryFileDiff(repositoryPath: string, filePath: string) {
  return invoke<RepositoryDiffLine[]>('load_file_diff', { repositoryPath, filePath })
}

export async function loadRepositoryUnstagedFileDiff(repositoryPath: string, filePath: string) {
  return invoke<RepositoryDiffLine[]>('load_unstaged_file_diff', { repositoryPath, filePath })
}

export async function fetchRepository(repositoryPath: string) {
  return invoke<RepositorySnapshot>('fetch_repository', { repositoryPath })
}

export async function stageRepositoryFiles(repositoryPath: string, filePaths: string[], force = false) {
  return invoke<RepositoryFile[]>('stage_files', { repositoryPath, filePaths, force })
}

export async function stageRepositoryPatch(repositoryPath: string, patch: string) {
  return invoke<RepositoryFile[]>('stage_patch', { repositoryPath, patch })
}

export async function restoreRepositoryPatch(repositoryPath: string, patch: string) {
  return invoke<RepositoryFile[]>('restore_patch', { repositoryPath, patch })
}

export async function unstageRepositoryFiles(repositoryPath: string, filePaths: string[]) {
  return invoke<RepositoryFile[]>('unstage_files', { repositoryPath, filePaths })
}

export async function discardRepositoryFiles(repositoryPath: string, filePaths: string[]) {
  return invoke<RepositoryFile[]>('discard_worktree_files', { repositoryPath, filePaths })
}

export async function loadRepositoryCommitStats(repositoryPath: string, commit: string) {
  return invoke<RepositoryCommitStats>('load_commit_stats', { repositoryPath, commit })
}

export async function loadRepositoryCommitFiles(repositoryPath: string, commit: string) {
  return invoke<RepositoryFile[]>('load_commit_files', { repositoryPath, commit })
}

export async function commitRepository(repositoryPath: string, message: string, amend = false, sign = false) {
  return invoke<RepositorySnapshot>('commit_repository', { repositoryPath, message, amend, sign })
}

export async function resolveGitlinkConflictsLocal(repositoryPath: string) {
  return invoke<number>('resolve_gitlink_conflicts_local', { repositoryPath })
}

export async function loadConflictFile(repositoryPath: string, filePath: string) {
  return invoke<ConflictFileContent>('load_conflict_file', { repositoryPath, filePath })
}

export async function resolveConflictFile(repositoryPath: string, filePath: string, strategy: 'current' | 'incoming' | 'both' | 'delete' | 'result', content?: string) {
  return invoke<RepositorySnapshot>('resolve_conflict_file', { repositoryPath, filePath, strategy, content })
}

export async function resolveConflictBlock(repositoryPath: string, filePath: string, blockIndex: number, strategy: 'current' | 'incoming' | 'both') {
  return invoke<RepositorySnapshot>('resolve_conflict_block', { repositoryPath, filePath, blockIndex, strategy })
}

export async function launchConflictMergetool(repositoryPath: string, filePath: string) {
  return invoke<RepositorySnapshot>('launch_conflict_mergetool', { repositoryPath, filePath })
}

export async function continueRepositoryOperation(repositoryPath: string) {
  return invoke<RepositorySnapshot>('continue_repository_operation', { repositoryPath })
}

export async function skipRepositoryOperation(repositoryPath: string) {
  return invoke<RepositorySnapshot>('skip_repository_operation', { repositoryPath })
}

export async function abortRepositoryOperation(repositoryPath: string) {
  return invoke<RepositorySnapshot>('abort_repository_operation', { repositoryPath })
}

export async function previewRepositoryRebase(repositoryPath: string, onto: string) {
  return invoke<RebasePreview>('preview_repository_rebase', { repositoryPath, onto })
}

export async function loadFileHistory(repositoryPath: string, filePath: string) {
  return invoke<FileHistoryEntry[]>('load_file_history', { repositoryPath, filePath })
}

export async function loadFileCommitDiff(repositoryPath: string, commit: string, filePath: string) {
  return invoke<RepositoryDiffLine[]>('load_file_commit_diff', { repositoryPath, commit, filePath })
}

export async function loadFileBlame(repositoryPath: string, filePath: string, revision?: string) {
  return invoke<BlameLine[]>('load_file_blame', { repositoryPath, filePath, revision })
}

export async function loadLineHistory(repositoryPath: string, filePath: string, line: number, revision?: string) {
  return invoke<FileHistoryEntry[]>('load_line_history', { repositoryPath, filePath, line, revision })
}

export async function previewBranchPrefix(repositoryPath: string, prefix: string) {
  return invoke<string[]>('preview_branch_prefix', { repositoryPath, prefix })
}

export async function deleteBranchPrefix(repositoryPath: string, prefix: string, branches: string[]) {
  return invoke<RepositorySnapshot>('delete_branch_prefix', { repositoryPath, prefix, branches })
}

export async function switchRepositoryBranch(repositoryPath: string, branch: string) {
  return invoke<RepositorySnapshot>('switch_repository_branch', { repositoryPath, branch })
}

export async function createRepositoryBranch(repositoryPath: string, branch: string) {
  return invoke<RepositorySnapshot>('create_repository_branch', { repositoryPath, branch })
}

export async function mergeRepositoryReference(repositoryPath: string, reference: string) {
  return invoke<RepositorySnapshot>('merge_repository_reference', { repositoryPath, reference })
}

export async function cherryPickRepositoryCommit(repositoryPath: string, commit: string) {
  return invoke<RepositorySnapshot>('cherry_pick_repository_commit', { repositoryPath, commit })
}

export async function pullRepositoryBranch(repositoryPath: string, branch: string) {
  return invoke<RepositorySnapshot>('pull_repository_branch', { repositoryPath, branch })
}

export async function pushRepository(repositoryPath: string) {
  return invoke<RepositorySnapshot>('push_repository', { repositoryPath })
}

export async function resetRepositoryToCommit(repositoryPath: string, commit: string) {
  return invoke<RepositorySnapshot>('reset_repository_to_commit', { repositoryPath, commit })
}

export async function rebaseRepositoryOnto(repositoryPath: string, commit: string) {
  return invoke<RepositorySnapshot>('rebase_repository_onto', { repositoryPath, commit })
}

export async function createRepositoryTag(repositoryPath: string, tag: string, commit: string) {
  return invoke<RepositorySnapshot>('create_repository_tag', { repositoryPath, tag, commit })
}

export async function deleteRepositoryBranch(repositoryPath: string, branch: string) {
  return invoke<RepositorySnapshot>('delete_repository_branch', { repositoryPath, branch })
}

export async function compareRepositoryRefs(repositoryPath: string, base: string, target: string) {
  return invoke<RepositoryComparison>('compare_repository_refs', { repositoryPath, base, target })
}

export async function loadRepositoryCompareFileDiff(repositoryPath: string, base: string, target: string, filePath: string) {
  return invoke<RepositoryDiffLine[]>('load_compare_file_diff', { repositoryPath, base, target, filePath })
}

export async function loadMergeQueue(repositoryPath: string) {
  return invoke<MergeQueueSnapshot>('load_merge_queue', { repositoryPath })
}

export async function createRepositoryWorktree(repositoryPath: string, worktreePath: string, branch: string, createBranch: boolean) {
  return invoke<RepositorySnapshot>('create_repository_worktree', { repositoryPath, worktreePath, branch, createBranch })
}

export async function removeRepositoryWorktree(repositoryPath: string, worktreePath: string) {
  return invoke<RepositorySnapshot>('remove_repository_worktree', { repositoryPath, worktreePath })
}

export async function setRepositoryWorktreeLock(repositoryPath: string, worktreePath: string, locked: boolean) {
  return invoke<RepositorySnapshot>('set_repository_worktree_lock', { repositoryPath, worktreePath, locked })
}

export async function pruneRepositoryWorktrees(repositoryPath: string) {
  return invoke<RepositorySnapshot>('prune_repository_worktrees', { repositoryPath })
}

export async function initializeRepositorySubmodule(repositoryPath: string, submodulePath: string) {
  return invoke<RepositorySnapshot>('initialize_repository_submodule', { repositoryPath, submodulePath })
}

export async function updateRepositorySubmodule(repositoryPath: string, submodulePath?: string) {
  return invoke<RepositorySnapshot>('update_repository_submodule', { repositoryPath, submodulePath })
}

export async function syncRepositorySubmodules(repositoryPath: string) {
  return invoke<RepositorySnapshot>('sync_repository_submodules', { repositoryPath })
}

export async function deinitializeRepositorySubmodule(repositoryPath: string, submodulePath: string) {
  return invoke<RepositorySnapshot>('deinitialize_repository_submodule', { repositoryPath, submodulePath })
}

export async function createRepositoryStash(repositoryPath: string, message: string, includeUntracked: boolean) {
  return invoke<RepositorySnapshot>('create_repository_stash', { repositoryPath, message, includeUntracked })
}

export async function createScopedRepositoryStash(repositoryPath: string, scope: 'staged' | 'unstaged', message: string) {
  return invoke<RepositorySnapshot>('create_scoped_repository_stash', { repositoryPath, scope, message })
}

export async function applyRepositoryStash(repositoryPath: string, reference: string, pop: boolean) {
  return invoke<RepositorySnapshot>('apply_repository_stash', { repositoryPath, reference, pop })
}

export async function dropRepositoryStash(repositoryPath: string, reference: string) {
  return invoke<RepositorySnapshot>('drop_repository_stash', { repositoryPath, reference })
}

export async function loadRepositoryStashFiles(repositoryPath: string, reference: string) {
  return invoke<import('@branchline/git-models').RepositoryFile[]>('load_stash_files', { repositoryPath, reference })
}

export async function loadRepositoryStashFileDiff(repositoryPath: string, reference: string, filePath: string) {
  return invoke<RepositoryDiffLine[]>('load_stash_file_diff', { repositoryPath, reference, filePath })
}
