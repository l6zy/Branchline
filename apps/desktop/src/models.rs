use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryCommit {
    pub id: String,
    pub full_hash: String,
    pub parent: Option<String>,
    pub parents: Vec<String>,
    pub lane: usize,
    pub color: String,
    pub title: String,
    pub message: String,
    pub author: String,
    pub email: String,
    pub committer: String,
    pub committer_email: String,
    pub avatar: String,
    pub time: String,
    pub author_time: String,
    pub commit_time: String,
    pub branches: Vec<String>,
    pub status: Option<String>,
    pub files: usize,
    pub additions: usize,
    pub deletions: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryCommitStats {
    pub hash: String,
    pub files: usize,
    pub additions: usize,
    pub deletions: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryFile {
    pub path: String,
    pub r#type: String,
    pub add: usize,
    pub del: usize,
    pub staged: bool,
    pub unstaged: bool,
    pub incoming: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryOperationStep {
    pub hash: String,
    pub short_hash: String,
    pub title: String,
    pub author: String,
    pub status: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryOperationState {
    pub kind: String,
    pub label: String,
    pub original_branch: Option<String>,
    pub onto: Option<String>,
    pub current_step: usize,
    pub total_steps: usize,
    pub current_commit: Option<String>,
    pub message: Option<String>,
    pub conflicts: Vec<String>,
    pub steps: Vec<RepositoryOperationStep>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictFileContent {
    pub path: String,
    pub base: Option<String>,
    pub current: Option<String>,
    pub incoming: Option<String>,
    pub result: String,
    pub current_label: String,
    pub incoming_label: String,
    pub binary: bool,
    pub gitlink: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RebasePreview {
    pub branch: String,
    pub onto: String,
    pub onto_short_hash: String,
    pub merge_base: String,
    pub steps: Vec<RepositoryOperationStep>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitUserConfig {
    pub user_name: String,
    pub user_email: String,
    pub default_branch: String,
    pub autocrlf: String,
    pub pull_strategy: String,
}

#[derive(Serialize)]
pub struct DiffLine {
    pub old: Option<usize>,
    pub next: Option<usize>,
    pub kind: String,
    pub code: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileHistoryEntry {
    pub hash: String,
    pub short_hash: String,
    pub parents: Vec<String>,
    pub author: String,
    pub email: String,
    pub committer: String,
    pub committer_email: String,
    pub time: String,
    pub commit_time: String,
    pub title: String,
    pub message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BlameLine {
    pub line: usize,
    pub original_line: usize,
    pub hash: String,
    pub short_hash: String,
    pub author: String,
    pub email: String,
    pub time: String,
    pub content: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryWorktree {
    pub path: String,
    pub branch: Option<String>,
    pub head: Option<String>,
    pub bare: bool,
    pub locked: Option<String>,
    pub prunable: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositorySubmodule {
    pub path: String,
    pub hash: String,
    pub status: String,
    pub branch: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryStash {
    pub reference: String,
    pub message: String,
    pub author: String,
    pub time: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryCommitTemplate {
    pub path: String,
    pub content: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryComparison {
    pub base: String,
    pub target: String,
    pub ahead: usize,
    pub behind: usize,
    pub files: Vec<RepositoryFile>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeCandidate {
    pub branch: String,
    pub ahead: usize,
    pub behind: usize,
    pub merged: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeQueueSnapshot {
    pub current_branch: String,
    pub conflicts: Vec<String>,
    pub candidates: Vec<MergeCandidate>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositorySnapshot {
    pub name: String,
    pub path: String,
    pub branch: String,
    pub remote: Option<String>,
    pub ahead: usize,
    pub behind: usize,
    pub worktree_count: usize,
    pub submodule_count: usize,
    pub commits: Vec<RepositoryCommit>,
    pub files: Vec<RepositoryFile>,
    pub worktrees: Vec<RepositoryWorktree>,
    pub submodules: Vec<RepositorySubmodule>,
    pub branches: Vec<String>,
    pub remote_branches: Vec<String>,
    pub tags: Vec<String>,
    pub stashes: Vec<RepositoryStash>,
    pub commit_template: Option<RepositoryCommitTemplate>,
    pub operation: Option<RepositoryOperationState>,
}
