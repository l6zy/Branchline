use crate::errors::ApplicationError;
use crate::{
    git,
    models::{
        BlameLine, DiffLine, FileHistoryEntry, GitUserConfig, MergeQueueSnapshot,
        RepositoryCommitStats, RepositoryComparison, RepositoryFile, RepositorySnapshot,
    },
};
use std::path::Path;

fn task_error(action: &str, error: impl std::fmt::Display) -> ApplicationError {
    ApplicationError::native(error).context(format!("task.{action}"))
}

#[tauri::command]
pub async fn load_repository_details(
    repository_path: String,
) -> Result<crate::repository_management::RepositoryDetails, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::repository_management::load_repository_details(&repository_path)
    })
    .await
    .map_err(|error| task_error("load_repository_details", error))?
}

#[tauri::command]
pub async fn load_repository_readme(
    repository_path: String,
) -> Result<Option<crate::repository_management::RepositoryReadme>, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::repository_management::load_repository_readme(&repository_path)
    })
    .await
    .map_err(|error| task_error("load_repository_readme", error))?
}

#[tauri::command]
pub async fn create_repository(
    destination: String,
    source: Option<String>,
) -> Result<crate::repository_management::RepositoryDetails, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::repository_management::create_repository(&destination, source.as_deref())
    })
    .await
    .map_err(|error| task_error("create_repository", error))?
}

#[tauri::command]
pub async fn open_repository_in_vscode(repository_path: String) -> Result<(), ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::repository_management::open_repository_in_vscode(&repository_path)
    })
    .await
    .map_err(|error| task_error("open_repository_in_vscode", error))?
}

fn operation_snapshot(
    repository_path: &str,
    result: Result<(), ApplicationError>,
    action: &str,
) -> Result<RepositorySnapshot, ApplicationError> {
    match result {
        Ok(()) => git::read_repository(repository_path),
        Err(error) => {
            let snapshot = git::read_repository(repository_path)?;
            if snapshot.operation.is_some() {
                Ok(snapshot)
            } else {
                Err(error.context(format!("task.{action}")))
            }
        }
    }
}

#[tauri::command]
pub async fn load_git_user_config() -> Result<GitUserConfig, ApplicationError> {
    tauri::async_runtime::spawn_blocking(git::load_git_user_config)
        .await
        .map_err(|error| task_error("load_git_user_config", error))
}

#[tauri::command]
pub async fn update_git_user_config(
    user_name: String,
    user_email: String,
    default_branch: String,
    autocrlf: String,
    pull_strategy: String,
    commit_template_content: String,
) -> Result<GitUserConfig, ApplicationError> {
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
    .map_err(|error| task_error("update_git_user_config", error))?
}

#[tauri::command]
pub async fn update_repository_commit_template(
    repository_path: String,
    content: String,
) -> Result<RepositorySnapshot, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::update_repository_commit_template(&repository_path, &content)
    })
    .await
    .map_err(|error| task_error("update_repository_commit_template", error))?
}

#[tauri::command]
pub async fn clear_repository_commit_template(
    repository_path: String,
) -> Result<RepositorySnapshot, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::clear_repository_commit_template(&repository_path)
    })
    .await
    .map_err(|error| task_error("clear_repository_commit_template", error))?
}

#[tauri::command]
pub async fn load_command_logs() -> Result<Vec<crate::models::CommandLogEntry>, ApplicationError> {
    Ok(git::load_command_logs())
}

#[tauri::command]
pub async fn clear_command_logs() -> Result<(), ApplicationError> {
    git::clear_command_logs();
    Ok(())
}

#[tauri::command]
pub async fn load_repository(path: String) -> Result<RepositorySnapshot, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || git::read_repository(&path))
        .await
        .map_err(|error| task_error("load_repository", error))?
}

#[tauri::command]
pub async fn load_repository_history(
    path: String,
    commit_limit: usize,
) -> Result<RepositorySnapshot, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::read_repository_with_commit_limit(&path, commit_limit)
    })
    .await
    .map_err(|error| task_error("load_repository_history", error))?
}

#[tauri::command]
pub async fn load_repository_state_token(
    repository_path: String,
) -> Result<String, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || git::repository_state_token(&repository_path))
        .await
        .map_err(|error| task_error("load_repository_state_token", error))?
}

#[tauri::command]
pub async fn load_file_diff(
    repository_path: String,
    file_path: String,
    show_whitespace: bool,
) -> Result<Vec<DiffLine>, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::parse_diff(Path::new(&repository_path), &file_path, show_whitespace)
    })
    .await
    .map_err(|error| task_error("load_file_diff", error))?
}

#[tauri::command]
pub async fn load_unstaged_file_diff(
    repository_path: String,
    file_path: String,
    show_whitespace: bool,
) -> Result<Vec<DiffLine>, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::parse_unstaged_diff(Path::new(&repository_path), &file_path, show_whitespace)
    })
    .await
    .map_err(|error| task_error("load_unstaged_file_diff", error))?
}

#[tauri::command]
pub async fn load_staged_file_diff(
    repository_path: String,
    file_path: String,
    show_whitespace: bool,
) -> Result<Vec<DiffLine>, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::parse_staged_diff(Path::new(&repository_path), &file_path, show_whitespace)
    })
    .await
    .map_err(|error| task_error("load_staged_file_diff", error))?
}

#[tauri::command]
pub async fn fetch_repository(
    repository_path: String,
) -> Result<RepositorySnapshot, ApplicationError> {
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
) -> Result<Vec<RepositoryFile>, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::stage_files(&repository_path, &file_paths, force)
    })
    .await
    .map_err(|error| task_error("stage_files", error))?
}

#[tauri::command]
pub async fn stage_patch(
    repository_path: String,
    patch: String,
) -> Result<Vec<RepositoryFile>, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || git::stage_patch(&repository_path, &patch))
        .await
        .map_err(|error| task_error("stage_patch", error))?
}

#[tauri::command]
pub async fn restore_patch(
    repository_path: String,
    patch: String,
) -> Result<Vec<RepositoryFile>, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || git::restore_patch(&repository_path, &patch))
        .await
        .map_err(|error| task_error("restore_patch", error))?
}

#[tauri::command]
pub async fn unstage_patch(
    repository_path: String,
    patch: String,
) -> Result<Vec<RepositoryFile>, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || git::unstage_patch(&repository_path, &patch))
        .await
        .map_err(|error| task_error("unstage_patch", error))?
}

#[tauri::command]
pub async fn unstage_files(
    repository_path: String,
    file_paths: Vec<String>,
) -> Result<Vec<RepositoryFile>, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || git::unstage_files(&repository_path, &file_paths))
        .await
        .map_err(|error| task_error("unstage_files", error))?
}

#[tauri::command]
pub async fn discard_worktree_files(
    repository_path: String,
    file_paths: Vec<String>,
) -> Result<Vec<RepositoryFile>, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::discard_worktree_files(&repository_path, &file_paths)
    })
    .await
    .map_err(|error| task_error("discard_worktree_files", error))?
}

#[tauri::command]
pub async fn load_commit_stats(
    repository_path: String,
    commit: String,
) -> Result<RepositoryCommitStats, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || git::load_commit_stats(&repository_path, &commit))
        .await
        .map_err(|error| task_error("load_commit_stats", error))?
}

#[tauri::command]
pub async fn load_commit_files(
    repository_path: String,
    commit: String,
) -> Result<Vec<RepositoryFile>, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || git::load_commit_files(&repository_path, &commit))
        .await
        .map_err(|error| task_error("load_commit_files", error))?
}

#[tauri::command]
pub async fn load_commit_tree_files(
    repository_path: String,
    commit: String,
) -> Result<Vec<String>, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::load_commit_tree_files(&repository_path, &commit)
    })
    .await
    .map_err(|error| task_error("load_commit_tree_files", error))?
}

#[tauri::command]
pub async fn load_commit_file_content(
    repository_path: String,
    commit: String,
    file_path: String,
) -> Result<String, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::load_commit_file_content(&repository_path, &commit, &file_path)
    })
    .await
    .map_err(|error| task_error("load_commit_file_content", error))?
}

#[tauri::command]
pub async fn commit_repository(
    repository_path: String,
    message: String,
    amend: bool,
    sign: bool,
) -> Result<RepositorySnapshot, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::commit_repository(&repository_path, &message, amend, sign)?;
        git::read_repository(&repository_path)
    })
    .await
    .map_err(|error| task_error("commit_repository", error))?
}

#[tauri::command]
pub async fn resolve_gitlink_conflicts_local(
    repository_path: String,
) -> Result<usize, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::resolve_gitlink_conflicts_local(&repository_path)
    })
    .await
    .map_err(|error| task_error("resolve_gitlink_conflicts_local", error))?
}

#[tauri::command]
pub async fn load_conflict_file(
    repository_path: String,
    file_path: String,
) -> Result<crate::models::ConflictFileContent, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::load_conflict_file(&repository_path, &file_path)
    })
    .await
    .map_err(|error| task_error("load_conflict_file", error))?
}

#[tauri::command]
pub async fn resolve_conflict_file(
    repository_path: String,
    file_path: String,
    strategy: String,
    content: Option<String>,
) -> Result<RepositorySnapshot, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::resolve_conflict_file(&repository_path, &file_path, &strategy, content.as_deref())?;
        git::read_repository(&repository_path)
    })
    .await
    .map_err(|error| task_error("resolve_conflict_file", error))?
}

#[tauri::command]
pub async fn resolve_conflict_block(
    repository_path: String,
    file_path: String,
    block_index: usize,
    strategy: String,
) -> Result<String, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::resolve_conflict_block(&repository_path, &file_path, block_index, &strategy)
    })
    .await
    .map_err(|error| task_error("resolve_conflict_block", error))?
}

#[tauri::command]
pub async fn launch_conflict_mergetool(
    repository_path: String,
    file_path: String,
) -> Result<RepositorySnapshot, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::launch_conflict_mergetool(&repository_path, &file_path)?;
        git::read_repository(&repository_path)
    })
    .await
    .map_err(|error| task_error("launch_conflict_mergetool", error))?
}

#[tauri::command]
pub async fn load_file_history(
    repository_path: String,
    file_path: String,
) -> Result<Vec<FileHistoryEntry>, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::load_file_history(&repository_path, &file_path)
    })
    .await
    .map_err(|error| task_error("load_file_history", error))?
}

#[tauri::command]
pub async fn load_file_commit_diff(
    repository_path: String,
    commit: String,
    file_path: String,
    show_whitespace: bool,
) -> Result<Vec<DiffLine>, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::load_file_commit_diff(&repository_path, &commit, &file_path, show_whitespace)
    })
    .await
    .map_err(|error| task_error("load_file_commit_diff", error))?
}

#[tauri::command]
pub async fn load_file_blame(
    repository_path: String,
    file_path: String,
    revision: Option<String>,
) -> Result<Vec<BlameLine>, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::load_file_blame(&repository_path, &file_path, revision.as_deref())
    })
    .await
    .map_err(|error| task_error("load_file_blame", error))?
}

#[tauri::command]
pub async fn load_line_history(
    repository_path: String,
    file_path: String,
    line: usize,
    revision: Option<String>,
) -> Result<Vec<FileHistoryEntry>, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::load_line_history(&repository_path, &file_path, line, revision.as_deref())
    })
    .await
    .map_err(|error| task_error("load_line_history", error))?
}

#[tauri::command]
pub async fn preview_branch_prefix(
    repository_path: String,
    prefix: String,
) -> Result<Vec<String>, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::preview_branch_prefix(&repository_path, &prefix)
    })
    .await
    .map_err(|error| task_error("preview_branch_prefix", error))?
}

#[tauri::command]
pub async fn delete_branch_prefix(
    repository_path: String,
    prefix: String,
    branches: Vec<String>,
) -> Result<RepositorySnapshot, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::delete_branch_prefix(&repository_path, &prefix, &branches)?;
        git::read_repository(&repository_path)
    })
    .await
    .map_err(|error| task_error("delete_branch_prefix", error))?
}

#[tauri::command]
pub async fn switch_repository_branch(
    repository_path: String,
    branch: String,
) -> Result<RepositorySnapshot, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::switch_repository_branch(&repository_path, &branch)?;
        git::read_repository(&repository_path)
    })
    .await
    .map_err(|error| task_error("switch_repository_branch", error))?
}

#[tauri::command]
pub async fn create_repository_branch(
    repository_path: String,
    branch: String,
) -> Result<RepositorySnapshot, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::create_repository_branch(&repository_path, &branch)?;
        git::read_repository(&repository_path)
    })
    .await
    .map_err(|error| task_error("create_repository_branch", error))?
}

#[tauri::command]
pub async fn merge_repository_reference(
    repository_path: String,
    reference: String,
) -> Result<RepositorySnapshot, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        operation_snapshot(
            &repository_path,
            git::merge_repository_reference(&repository_path, &reference),
            "merge_repository_reference",
        )
    })
    .await
    .map_err(ApplicationError::native)?
}

#[tauri::command]
pub async fn cherry_pick_repository_commit(
    repository_path: String,
    commit: String,
    mainline: Option<usize>,
) -> Result<RepositorySnapshot, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        let result = match mainline {
            Some(mainline) => git::cherry_pick_repository_commit_with_mainline(
                &repository_path,
                &commit,
                Some(mainline),
            ),
            None => git::cherry_pick_repository_commit(&repository_path, &commit),
        };
        operation_snapshot(&repository_path, result, "Cherry-pick")
    })
    .await
    .map_err(ApplicationError::native)?
}

#[tauri::command]
pub async fn pull_repository_branch(
    repository_path: String,
    branch: String,
) -> Result<RepositorySnapshot, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::pull_repository_branch(&repository_path, &branch)?;
        git::read_repository(&repository_path)
    })
    .await
    .map_err(|error| task_error("pull_repository_branch", error))?
}

#[tauri::command]
pub async fn fast_forward_repository_branch(
    repository_path: String,
    branch: String,
) -> Result<RepositorySnapshot, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::fast_forward_repository_branch(&repository_path, &branch)?;
        git::read_repository(&repository_path)
    })
    .await
    .map_err(|error| task_error("fast_forward_repository_branch", error))?
}

#[tauri::command]
pub async fn push_repository(
    repository_path: String,
) -> Result<RepositorySnapshot, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::push_repository(&repository_path)?;
        git::read_repository(&repository_path)
    })
    .await
    .map_err(|error| task_error("push_repository", error))?
}

#[tauri::command]
pub async fn reset_repository_to_commit(
    repository_path: String,
    commit: String,
) -> Result<RepositorySnapshot, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::reset_repository_to_commit(&repository_path, &commit)?;
        git::read_repository(&repository_path)
    })
    .await
    .map_err(|error| task_error("reset_repository_to_commit", error))?
}

#[tauri::command]
pub async fn undo_last_commit(
    repository_path: String,
) -> Result<RepositorySnapshot, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        let message = git::undo_last_commit(&repository_path)?;
        let mut snapshot = git::read_repository(&repository_path)?;
        snapshot.undo_commit_message = Some(message);
        Ok(snapshot)
    })
    .await
    .map_err(|error| task_error("undo_last_commit", error))?
}

#[tauri::command]
pub async fn revert_repository_commit(
    repository_path: String,
    commit: String,
    mainline: Option<usize>,
) -> Result<RepositorySnapshot, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        operation_snapshot(
            &repository_path,
            git::revert_repository_commit(&repository_path, &commit, mainline),
            "revert_repository_commit",
        )
    })
    .await
    .map_err(ApplicationError::native)?
}

#[tauri::command]
pub async fn rebase_repository_onto(
    repository_path: String,
    commit: String,
) -> Result<RepositorySnapshot, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        operation_snapshot(
            &repository_path,
            git::rebase_repository_onto(&repository_path, &commit),
            "rebase_repository_onto",
        )
    })
    .await
    .map_err(ApplicationError::native)?
}

#[tauri::command]
pub async fn preview_repository_rebase(
    repository_path: String,
    onto: String,
) -> Result<crate::models::RebasePreview, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::preview_repository_rebase(&repository_path, &onto)
    })
    .await
    .map_err(|error| task_error("preview_repository_rebase", error))?
}

#[tauri::command]
pub async fn continue_repository_operation(
    repository_path: String,
) -> Result<RepositorySnapshot, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        operation_snapshot(
            &repository_path,
            git::continue_repository_operation(&repository_path),
            "continue_repository_operation",
        )
    })
    .await
    .map_err(ApplicationError::native)?
}

#[tauri::command]
pub async fn skip_repository_operation(
    repository_path: String,
) -> Result<RepositorySnapshot, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        operation_snapshot(
            &repository_path,
            git::skip_repository_operation(&repository_path),
            "skip_repository_operation",
        )
    })
    .await
    .map_err(ApplicationError::native)?
}

#[tauri::command]
pub async fn abort_repository_operation(
    repository_path: String,
) -> Result<RepositorySnapshot, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        operation_snapshot(
            &repository_path,
            git::abort_repository_operation(&repository_path),
            "abort_repository_operation",
        )
    })
    .await
    .map_err(ApplicationError::native)?
}

#[tauri::command]
pub async fn create_repository_tag(
    repository_path: String,
    tag: String,
    commit: String,
) -> Result<RepositorySnapshot, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::create_repository_tag(&repository_path, &tag, &commit)?;
        git::read_repository(&repository_path)
    })
    .await
    .map_err(|error| task_error("create_repository_tag", error))?
}

#[tauri::command]
pub async fn delete_repository_branch(
    repository_path: String,
    branch: String,
) -> Result<RepositorySnapshot, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::delete_repository_branch(&repository_path, &branch)?;
        git::read_repository(&repository_path)
    })
    .await
    .map_err(|error| task_error("delete_repository_branch", error))?
}

#[tauri::command]
pub async fn compare_repository_refs(
    repository_path: String,
    base: String,
    target: String,
) -> Result<RepositoryComparison, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::compare_repository_refs(&repository_path, &base, &target)
    })
    .await
    .map_err(|error| task_error("compare_repository_refs", error))?
}

#[tauri::command]
pub async fn load_compare_file_diff(
    repository_path: String,
    base: String,
    target: String,
    file_path: String,
    show_whitespace: bool,
) -> Result<Vec<DiffLine>, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::parse_compare_diff(
            &repository_path,
            &base,
            &target,
            &file_path,
            show_whitespace,
        )
    })
    .await
    .map_err(|error| task_error("load_compare_file_diff", error))?
}

#[tauri::command]
pub async fn load_merge_queue(
    repository_path: String,
) -> Result<MergeQueueSnapshot, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || git::load_merge_queue(&repository_path))
        .await
        .map_err(|error| task_error("load_merge_queue", error))?
}

#[tauri::command]
pub async fn create_repository_worktree(
    repository_path: String,
    worktree_path: String,
    branch: String,
    create_branch: bool,
) -> Result<RepositorySnapshot, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::create_repository_worktree(&repository_path, &worktree_path, &branch, create_branch)?;
        git::read_repository(&repository_path)
    })
    .await
    .map_err(|error| task_error("create_repository_worktree", error))?
}

#[tauri::command]
pub async fn remove_repository_worktree(
    repository_path: String,
    worktree_path: String,
) -> Result<RepositorySnapshot, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::remove_repository_worktree(&repository_path, &worktree_path)?;
        git::read_repository(&repository_path)
    })
    .await
    .map_err(|error| task_error("remove_repository_worktree", error))?
}

#[tauri::command]
pub async fn set_repository_worktree_lock(
    repository_path: String,
    worktree_path: String,
    locked: bool,
) -> Result<RepositorySnapshot, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::set_repository_worktree_lock(&repository_path, &worktree_path, locked)?;
        git::read_repository(&repository_path)
    })
    .await
    .map_err(|error| {
        task_error(
            if locked {
                "set_repository_worktree_lock"
            } else {
                "set_repository_worktree_lock"
            },
            error,
        )
    })?
}

#[tauri::command]
pub async fn prune_repository_worktrees(
    repository_path: String,
) -> Result<RepositorySnapshot, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::prune_repository_worktrees(&repository_path)?;
        git::read_repository(&repository_path)
    })
    .await
    .map_err(|error| task_error("prune_repository_worktrees", error))?
}

#[tauri::command]
pub async fn initialize_repository_submodule(
    repository_path: String,
    submodule_path: String,
) -> Result<RepositorySnapshot, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::initialize_repository_submodule(&repository_path, &submodule_path)?;
        git::read_repository(&repository_path)
    })
    .await
    .map_err(|error| task_error("initialize_repository_submodule", error))?
}

#[tauri::command]
pub async fn update_repository_submodule(
    repository_path: String,
    submodule_path: Option<String>,
) -> Result<RepositorySnapshot, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::update_repository_submodule(&repository_path, submodule_path.as_deref())?;
        git::read_repository(&repository_path)
    })
    .await
    .map_err(|error| task_error("update_repository_submodule", error))?
}

#[tauri::command]
pub async fn sync_repository_submodules(
    repository_path: String,
) -> Result<RepositorySnapshot, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::sync_repository_submodules(&repository_path)?;
        git::read_repository(&repository_path)
    })
    .await
    .map_err(|error| task_error("sync_repository_submodules", error))?
}

#[tauri::command]
pub async fn deinitialize_repository_submodule(
    repository_path: String,
    submodule_path: String,
) -> Result<RepositorySnapshot, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::deinitialize_repository_submodule(&repository_path, &submodule_path)?;
        git::read_repository(&repository_path)
    })
    .await
    .map_err(|error| task_error("deinitialize_repository_submodule", error))?
}

#[tauri::command]
pub async fn create_repository_stash(
    repository_path: String,
    message: String,
    include_untracked: bool,
) -> Result<RepositorySnapshot, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::create_repository_stash(&repository_path, &message, include_untracked)?;
        git::read_repository(&repository_path)
    })
    .await
    .map_err(|error| task_error("create_repository_stash", error))?
}

#[tauri::command]
pub async fn create_scoped_repository_stash(
    repository_path: String,
    scope: String,
    message: String,
) -> Result<RepositorySnapshot, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::create_scoped_repository_stash(&repository_path, &scope, &message)?;
        git::read_repository(&repository_path)
    })
    .await
    .map_err(|error| task_error("create_scoped_repository_stash", error))?
}

#[tauri::command]
pub async fn apply_repository_stash(
    repository_path: String,
    reference: String,
    pop: bool,
) -> Result<RepositorySnapshot, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        operation_snapshot(
            &repository_path,
            git::apply_repository_stash(&repository_path, &reference, pop),
            "apply_repository_stash",
        )
    })
    .await
    .map_err(ApplicationError::native)?
}

#[tauri::command]
pub async fn drop_repository_stash(
    repository_path: String,
    reference: String,
) -> Result<RepositorySnapshot, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::drop_repository_stash(&repository_path, &reference)?;
        git::read_repository(&repository_path)
    })
    .await
    .map_err(|error| task_error("drop_repository_stash", error))?
}

#[tauri::command]
pub async fn load_stash_files(
    repository_path: String,
    reference: String,
) -> Result<Vec<crate::models::RepositoryFile>, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::load_stash_files(&repository_path, &reference)
    })
    .await
    .map_err(|error| task_error("load_stash_files", error))?
}

#[tauri::command]
pub async fn load_stash_file_diff(
    repository_path: String,
    reference: String,
    file_path: String,
    show_whitespace: bool,
) -> Result<Vec<DiffLine>, ApplicationError> {
    tauri::async_runtime::spawn_blocking(move || {
        git::load_stash_file_diff(&repository_path, &reference, &file_path, show_whitespace)
    })
    .await
    .map_err(|error| task_error("load_stash_file_diff", error))?
}
