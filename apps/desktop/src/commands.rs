use crate::{
    git,
    models::{
        BlameLine, DiffLine, FileHistoryEntry, GitUserConfig, MergeQueueSnapshot,
        RepositoryCommitStats, RepositoryComparison, RepositoryFile, RepositorySnapshot,
    },
};
use std::path::Path;

fn task_error(action: &str, error: impl std::fmt::Display) -> String {
    format!("{action}失败：{error}")
}

fn operation_snapshot(
    repository_path: &str,
    result: Result<(), String>,
    action: &str,
) -> Result<RepositorySnapshot, String> {
    match result {
        Ok(()) => git::read_repository(repository_path),
        Err(error) => {
            let snapshot = git::read_repository(repository_path)?;
            if snapshot.operation.is_some() {
                Ok(snapshot)
            } else {
                Err(task_error(action, error))
            }
        }
    }
}

#[tauri::command]
pub async fn load_git_user_config() -> Result<GitUserConfig, String> {
    tauri::async_runtime::spawn_blocking(git::load_git_user_config)
        .await
        .map_err(|error| task_error("读取 Git 配置", error))
}

#[tauri::command]
pub async fn update_git_user_config(
    user_name: String,
    user_email: String,
    default_branch: String,
    autocrlf: String,
    pull_strategy: String,
    commit_template_content: String,
) -> Result<GitUserConfig, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::update_git_user_config(
            &user_name,
            &user_email,
            &default_branch,
            &autocrlf,
            &pull_strategy,
            &commit_template_content,
        )
    })
    .await
    .map_err(|error| task_error("保存 Git 配置", error))?
}

#[tauri::command]
pub async fn update_repository_commit_template(
    repository_path: String,
    content: String,
) -> Result<RepositorySnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::update_repository_commit_template(&repository_path, &content)
    })
    .await
    .map_err(|error| task_error("保存仓库提交模板", error))?
}

#[tauri::command]
pub async fn clear_repository_commit_template(
    repository_path: String,
) -> Result<RepositorySnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || git::clear_repository_commit_template(&repository_path))
        .await
        .map_err(|error| task_error("移除仓库提交模板", error))?
}

#[tauri::command]
pub async fn load_command_logs() -> Result<Vec<crate::models::CommandLogEntry>, String> {
    Ok(git::load_command_logs())
}

#[tauri::command]
pub async fn clear_command_logs() -> Result<(), String> {
    git::clear_command_logs();
    Ok(())
}

#[tauri::command]
pub async fn load_repository(path: String) -> Result<RepositorySnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || git::read_repository(&path))
        .await
        .map_err(|error| task_error("读取仓库", error))?
}

#[tauri::command]
pub async fn load_repository_state_token(repository_path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || git::repository_state_token(&repository_path))
        .await
        .map_err(|error| task_error("检查仓库状态", error))?
}

#[tauri::command]
pub async fn load_file_diff(
    repository_path: String,
    file_path: String,
) -> Result<Vec<DiffLine>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::parse_diff(Path::new(&repository_path), &file_path)
    })
    .await
    .map_err(|error| task_error("读取 Diff", error))?
}

#[tauri::command]
pub async fn load_unstaged_file_diff(
    repository_path: String,
    file_path: String,
) -> Result<Vec<DiffLine>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::parse_unstaged_diff(Path::new(&repository_path), &file_path)
    })
    .await
    .map_err(|error| task_error("读取未暂存 Diff", error))?
}

#[tauri::command]
pub async fn fetch_repository(repository_path: String) -> Result<RepositorySnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::fetch_repository(&repository_path)?;
        git::read_repository(&repository_path)
    })
    .await
    .map_err(|error| task_error("Fetch", error))?
}

#[tauri::command]
pub async fn stage_files(
    repository_path: String,
    file_paths: Vec<String>,
    force: bool,
) -> Result<Vec<RepositoryFile>, String> {
    tauri::async_runtime::spawn_blocking(move || git::stage_files(&repository_path, &file_paths, force))
        .await
        .map_err(|error| task_error("暂存文件", error))?
}

#[tauri::command]
pub async fn stage_patch(
    repository_path: String,
    patch: String,
) -> Result<Vec<RepositoryFile>, String> {
    tauri::async_runtime::spawn_blocking(move || git::stage_patch(&repository_path, &patch))
        .await
        .map_err(|error| task_error("暂存修改块", error))?
}

#[tauri::command]
pub async fn restore_patch(
    repository_path: String,
    patch: String,
) -> Result<Vec<RepositoryFile>, String> {
    tauri::async_runtime::spawn_blocking(move || git::restore_patch(&repository_path, &patch))
        .await
        .map_err(|error| task_error("还原修改块", error))?
}

#[tauri::command]
pub async fn unstage_files(
    repository_path: String,
    file_paths: Vec<String>,
) -> Result<Vec<RepositoryFile>, String> {
    tauri::async_runtime::spawn_blocking(move || git::unstage_files(&repository_path, &file_paths))
        .await
        .map_err(|error| task_error("取消暂存", error))?
}

#[tauri::command]
pub async fn discard_worktree_files(
    repository_path: String,
    file_paths: Vec<String>,
) -> Result<Vec<RepositoryFile>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::discard_worktree_files(&repository_path, &file_paths)
    })
    .await
    .map_err(|error| task_error("丢弃改动", error))?
}

#[tauri::command]
pub async fn load_commit_stats(
    repository_path: String,
    commit: String,
) -> Result<RepositoryCommitStats, String> {
    tauri::async_runtime::spawn_blocking(move || git::load_commit_stats(&repository_path, &commit))
        .await
        .map_err(|error| task_error("读取提交统计", error))?
}

#[tauri::command]
pub async fn load_commit_files(
    repository_path: String,
    commit: String,
) -> Result<Vec<RepositoryFile>, String> {
    tauri::async_runtime::spawn_blocking(move || git::load_commit_files(&repository_path, &commit))
        .await
        .map_err(|error| task_error("读取提交文件", error))?
}

#[tauri::command]
pub async fn commit_repository(
    repository_path: String,
    message: String,
    amend: bool,
    sign: bool,
) -> Result<RepositorySnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::commit_repository(&repository_path, &message, amend, sign)?;
        git::read_repository(&repository_path)
    })
    .await
    .map_err(|error| task_error("提交", error))?
}

#[tauri::command]
pub async fn resolve_gitlink_conflicts_local(repository_path: String) -> Result<usize, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::resolve_gitlink_conflicts_local(&repository_path)
    })
    .await
    .map_err(|error| task_error("解决 Gitlink 冲突", error))?
}

#[tauri::command]
pub async fn load_conflict_file(
    repository_path: String,
    file_path: String,
) -> Result<crate::models::ConflictFileContent, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::load_conflict_file(&repository_path, &file_path)
    })
    .await
    .map_err(|error| task_error("读取冲突文件", error))?
}

#[tauri::command]
pub async fn resolve_conflict_file(
    repository_path: String,
    file_path: String,
    strategy: String,
    content: Option<String>,
) -> Result<RepositorySnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::resolve_conflict_file(&repository_path, &file_path, &strategy, content.as_deref())?;
        git::read_repository(&repository_path)
    })
    .await
    .map_err(|error| task_error("保存冲突解决结果", error))?
}

#[tauri::command]
pub async fn resolve_conflict_block(
    repository_path: String,
    file_path: String,
    block_index: usize,
    strategy: String,
) -> Result<RepositorySnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::resolve_conflict_block(&repository_path, &file_path, block_index, &strategy)?;
        git::read_repository(&repository_path)
    })
    .await
    .map_err(|error| task_error("解决冲突块", error))?
}

#[tauri::command]
pub async fn launch_conflict_mergetool(
    repository_path: String,
    file_path: String,
) -> Result<RepositorySnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::launch_conflict_mergetool(&repository_path, &file_path)?;
        git::read_repository(&repository_path)
    })
    .await
    .map_err(|error| task_error("打开外部合并工具", error))?
}

#[tauri::command]
pub async fn load_file_history(
    repository_path: String,
    file_path: String,
) -> Result<Vec<FileHistoryEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::load_file_history(&repository_path, &file_path)
    })
    .await
    .map_err(|error| task_error("读取文件历史", error))?
}

#[tauri::command]
pub async fn load_file_commit_diff(
    repository_path: String,
    commit: String,
    file_path: String,
) -> Result<Vec<DiffLine>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::load_file_commit_diff(&repository_path, &commit, &file_path)
    })
    .await
    .map_err(|error| task_error("读取文件提交 Diff", error))?
}

#[tauri::command]
pub async fn load_file_blame(
    repository_path: String,
    file_path: String,
    revision: Option<String>,
) -> Result<Vec<BlameLine>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::load_file_blame(&repository_path, &file_path, revision.as_deref())
    })
    .await
    .map_err(|error| task_error("读取逐行归属", error))?
}

#[tauri::command]
pub async fn load_line_history(
    repository_path: String,
    file_path: String,
    line: usize,
    revision: Option<String>,
) -> Result<Vec<FileHistoryEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::load_line_history(&repository_path, &file_path, line, revision.as_deref())
    })
    .await
    .map_err(|error| task_error("读取指定行历史", error))?
}

#[tauri::command]
pub async fn preview_branch_prefix(
    repository_path: String,
    prefix: String,
) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::preview_branch_prefix(&repository_path, &prefix)
    })
    .await
    .map_err(|error| task_error("读取分支前缀", error))?
}

#[tauri::command]
pub async fn delete_branch_prefix(
    repository_path: String,
    prefix: String,
    branches: Vec<String>,
) -> Result<RepositorySnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::delete_branch_prefix(&repository_path, &prefix, &branches)?;
        git::read_repository(&repository_path)
    })
    .await
    .map_err(|error| task_error("删除分支前缀", error))?
}

#[tauri::command]
pub async fn switch_repository_branch(
    repository_path: String,
    branch: String,
) -> Result<RepositorySnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::switch_repository_branch(&repository_path, &branch)?;
        git::read_repository(&repository_path)
    })
    .await
    .map_err(|error| task_error("切换分支", error))?
}

#[tauri::command]
pub async fn create_repository_branch(
    repository_path: String,
    branch: String,
) -> Result<RepositorySnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::create_repository_branch(&repository_path, &branch)?;
        git::read_repository(&repository_path)
    })
    .await
    .map_err(|error| task_error("创建分支", error))?
}

#[tauri::command]
pub async fn merge_repository_reference(
    repository_path: String,
    reference: String,
) -> Result<RepositorySnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        operation_snapshot(
            &repository_path,
            git::merge_repository_reference(&repository_path, &reference),
            "合并",
        )
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn cherry_pick_repository_commit(
    repository_path: String,
    commit: String,
) -> Result<RepositorySnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        operation_snapshot(
            &repository_path,
            git::cherry_pick_repository_commit(&repository_path, &commit),
            "Cherry-pick",
        )
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn pull_repository_branch(
    repository_path: String,
    branch: String,
) -> Result<RepositorySnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::pull_repository_branch(&repository_path, &branch)?;
        git::read_repository(&repository_path)
    })
    .await
    .map_err(|error| task_error("拉取分支", error))?
}

#[tauri::command]
pub async fn push_repository(repository_path: String) -> Result<RepositorySnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::push_repository(&repository_path)?;
        git::read_repository(&repository_path)
    })
    .await
    .map_err(|error| task_error("推送分支", error))?
}

#[tauri::command]
pub async fn reset_repository_to_commit(
    repository_path: String,
    commit: String,
) -> Result<RepositorySnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::reset_repository_to_commit(&repository_path, &commit)?;
        git::read_repository(&repository_path)
    })
    .await
    .map_err(|error| task_error("回退提交", error))?
}

#[tauri::command]
pub async fn undo_last_commit(repository_path: String) -> Result<RepositorySnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let message = git::undo_last_commit(&repository_path)?;
        let mut snapshot = git::read_repository(&repository_path)?;
        snapshot.undo_commit_message = Some(message);
        Ok(snapshot)
    })
    .await
    .map_err(|error| task_error("撤回上一次提交", error))?
}

#[tauri::command]
pub async fn rebase_repository_onto(
    repository_path: String,
    commit: String,
) -> Result<RepositorySnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        operation_snapshot(
            &repository_path,
            git::rebase_repository_onto(&repository_path, &commit),
            "变基",
        )
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn preview_repository_rebase(
    repository_path: String,
    onto: String,
) -> Result<crate::models::RebasePreview, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::preview_repository_rebase(&repository_path, &onto)
    })
    .await
    .map_err(|error| task_error("预览变基", error))?
}

#[tauri::command]
pub async fn continue_repository_operation(
    repository_path: String,
) -> Result<RepositorySnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        operation_snapshot(
            &repository_path,
            git::continue_repository_operation(&repository_path),
            "继续 Git 操作",
        )
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn skip_repository_operation(
    repository_path: String,
) -> Result<RepositorySnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        operation_snapshot(
            &repository_path,
            git::skip_repository_operation(&repository_path),
            "跳过当前提交",
        )
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn abort_repository_operation(
    repository_path: String,
) -> Result<RepositorySnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        operation_snapshot(
            &repository_path,
            git::abort_repository_operation(&repository_path),
            "中止 Git 操作",
        )
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn create_repository_tag(
    repository_path: String,
    tag: String,
    commit: String,
) -> Result<RepositorySnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::create_repository_tag(&repository_path, &tag, &commit)?;
        git::read_repository(&repository_path)
    })
    .await
    .map_err(|error| task_error("创建标签", error))?
}

#[tauri::command]
pub async fn delete_repository_branch(
    repository_path: String,
    branch: String,
) -> Result<RepositorySnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::delete_repository_branch(&repository_path, &branch)?;
        git::read_repository(&repository_path)
    })
    .await
    .map_err(|error| task_error("删除分支", error))?
}

#[tauri::command]
pub async fn compare_repository_refs(
    repository_path: String,
    base: String,
    target: String,
) -> Result<RepositoryComparison, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::compare_repository_refs(&repository_path, &base, &target)
    })
    .await
    .map_err(|error| task_error("比较分支", error))?
}

#[tauri::command]
pub async fn load_compare_file_diff(
    repository_path: String,
    base: String,
    target: String,
    file_path: String,
) -> Result<Vec<DiffLine>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::parse_compare_diff(&repository_path, &base, &target, &file_path)
    })
    .await
    .map_err(|error| task_error("读取比较 Diff", error))?
}

#[tauri::command]
pub async fn load_merge_queue(repository_path: String) -> Result<MergeQueueSnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || git::load_merge_queue(&repository_path))
        .await
        .map_err(|error| task_error("读取合并队列", error))?
}

#[tauri::command]
pub async fn create_repository_worktree(
    repository_path: String,
    worktree_path: String,
    branch: String,
    create_branch: bool,
) -> Result<RepositorySnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::create_repository_worktree(&repository_path, &worktree_path, &branch, create_branch)?;
        git::read_repository(&repository_path)
    })
    .await
    .map_err(|error| task_error("创建 Worktree", error))?
}

#[tauri::command]
pub async fn remove_repository_worktree(
    repository_path: String,
    worktree_path: String,
) -> Result<RepositorySnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::remove_repository_worktree(&repository_path, &worktree_path)?;
        git::read_repository(&repository_path)
    })
    .await
    .map_err(|error| task_error("移除 Worktree", error))?
}

#[tauri::command]
pub async fn set_repository_worktree_lock(
    repository_path: String,
    worktree_path: String,
    locked: bool,
) -> Result<RepositorySnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::set_repository_worktree_lock(&repository_path, &worktree_path, locked)?;
        git::read_repository(&repository_path)
    })
    .await
    .map_err(|error| task_error(if locked { "锁定 Worktree" } else { "解锁 Worktree" }, error))?
}

#[tauri::command]
pub async fn prune_repository_worktrees(repository_path: String) -> Result<RepositorySnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::prune_repository_worktrees(&repository_path)?;
        git::read_repository(&repository_path)
    })
    .await
    .map_err(|error| task_error("清理 Worktree", error))?
}

#[tauri::command]
pub async fn initialize_repository_submodule(
    repository_path: String,
    submodule_path: String,
) -> Result<RepositorySnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::initialize_repository_submodule(&repository_path, &submodule_path)?;
        git::read_repository(&repository_path)
    })
    .await
    .map_err(|error| task_error("初始化 Submodule", error))?
}

#[tauri::command]
pub async fn update_repository_submodule(
    repository_path: String,
    submodule_path: Option<String>,
) -> Result<RepositorySnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::update_repository_submodule(&repository_path, submodule_path.as_deref())?;
        git::read_repository(&repository_path)
    })
    .await
    .map_err(|error| task_error("更新 Submodule", error))?
}

#[tauri::command]
pub async fn sync_repository_submodules(repository_path: String) -> Result<RepositorySnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::sync_repository_submodules(&repository_path)?;
        git::read_repository(&repository_path)
    })
    .await
    .map_err(|error| task_error("同步 Submodule URL", error))?
}

#[tauri::command]
pub async fn deinitialize_repository_submodule(
    repository_path: String,
    submodule_path: String,
) -> Result<RepositorySnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::deinitialize_repository_submodule(&repository_path, &submodule_path)?;
        git::read_repository(&repository_path)
    })
    .await
    .map_err(|error| task_error("取消初始化 Submodule", error))?
}

#[tauri::command]
pub async fn create_repository_stash(
    repository_path: String,
    message: String,
    include_untracked: bool,
) -> Result<RepositorySnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::create_repository_stash(&repository_path, &message, include_untracked)?;
        git::read_repository(&repository_path)
    })
    .await
    .map_err(|error| task_error("创建 Stash", error))?
}

#[tauri::command]
pub async fn create_scoped_repository_stash(
    repository_path: String,
    scope: String,
    message: String,
) -> Result<RepositorySnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::create_scoped_repository_stash(&repository_path, &scope, &message)?;
        git::read_repository(&repository_path)
    })
    .await
    .map_err(|error| task_error("快速 Stash", error))?
}

#[tauri::command]
pub async fn apply_repository_stash(
    repository_path: String,
    reference: String,
    pop: bool,
) -> Result<RepositorySnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        operation_snapshot(
            &repository_path,
            git::apply_repository_stash(&repository_path, &reference, pop),
            "应用 Stash",
        )
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn drop_repository_stash(
    repository_path: String,
    reference: String,
) -> Result<RepositorySnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::drop_repository_stash(&repository_path, &reference)?;
        git::read_repository(&repository_path)
    })
    .await
    .map_err(|error| task_error("删除 Stash", error))?
}

#[tauri::command]
pub async fn load_stash_files(
    repository_path: String,
    reference: String,
) -> Result<Vec<crate::models::RepositoryFile>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::load_stash_files(&repository_path, &reference)
    })
    .await
    .map_err(|error| task_error("读取 Stash 文件", error))?
}

#[tauri::command]
pub async fn load_stash_file_diff(
    repository_path: String,
    reference: String,
    file_path: String,
) -> Result<Vec<DiffLine>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::load_stash_file_diff(&repository_path, &reference, &file_path)
    })
    .await
    .map_err(|error| task_error("读取 Stash Diff", error))?
}
