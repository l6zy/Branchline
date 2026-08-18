import type { RepositoryFile } from '../../repository'

export const WORKING_TREE_COMMIT_ID = '__branchline_working_tree__'

export type WorkingTreeCommit = {
  id: string
  lane: number
  color: string
  title: string
  message: string
  author: string
  avatar: string
  time: string
  status: 'working'
  parent?: string
  files: number
  additions: number
  deletions: number
}

export function createWorkingTreeCommit(files: RepositoryFile[], headHash?: string): WorkingTreeCommit | null {
  if (!files.length) return null
  return {
    id: WORKING_TREE_COMMIT_ID,
    lane: 0,
    color: '#faad14',
    title: '未提交的修改',
    message: `当前工作区有 ${files.length} 个未提交文件，这些修改尚未写入 Git 历史。`,
    author: '工作区',
    avatar: 'WT',
    time: new Date().toISOString(),
    status: 'working',
    parent: headHash,
    files: files.length,
    additions: files.reduce((total, file) => total + file.add, 0),
    deletions: files.reduce((total, file) => total + file.del, 0),
  }
}
