mod commands;
mod git;
mod models;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::load_git_user_config,
            commands::update_git_user_config,
            commands::load_repository,
            commands::load_repository_state_token,
            commands::load_file_diff,
            commands::load_commit_stats,
            commands::load_commit_files,
            commands::fetch_repository,
            commands::stage_files,
            commands::unstage_files,
            commands::discard_worktree_files,
            commands::commit_repository,
            commands::resolve_gitlink_conflicts_local,
            commands::load_conflict_file,
            commands::resolve_conflict_file,
            commands::resolve_conflict_block,
            commands::launch_conflict_mergetool,
            commands::load_file_history,
            commands::load_file_commit_diff,
            commands::load_file_blame,
            commands::load_line_history,
            commands::preview_branch_prefix,
            commands::delete_branch_prefix,
            commands::switch_repository_branch,
            commands::create_repository_branch,
            commands::merge_repository_reference,
            commands::cherry_pick_repository_commit,
            commands::pull_repository_branch,
            commands::push_repository,
            commands::reset_repository_to_commit,
            commands::rebase_repository_onto,
            commands::preview_repository_rebase,
            commands::continue_repository_operation,
            commands::skip_repository_operation,
            commands::abort_repository_operation,
            commands::create_repository_tag,
            commands::delete_repository_branch,
            commands::compare_repository_refs,
            commands::load_compare_file_diff,
            commands::load_merge_queue,
            commands::create_repository_worktree,
            commands::remove_repository_worktree,
            commands::set_repository_worktree_lock,
            commands::prune_repository_worktrees,
            commands::initialize_repository_submodule,
            commands::update_repository_submodule,
            commands::sync_repository_submodules,
            commands::deinitialize_repository_submodule,
            commands::create_repository_stash,
            commands::create_scoped_repository_stash,
            commands::apply_repository_stash,
            commands::drop_repository_stash,
            commands::load_stash_files,
            commands::load_stash_file_diff,
        ])
        .run(tauri::generate_context!())
        .expect("启动 Branchline 失败");
}
