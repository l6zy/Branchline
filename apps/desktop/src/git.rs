use crate::models::{
    BlameLine, CommandLogEntry, ConflictFileContent, DiffLine, FileHistoryEntry, GitUserConfig, MergeCandidate,
    MergeQueueSnapshot, RebasePreview, RepositoryBranchTracking, RepositoryCommit,
    RepositoryCommitStats, RepositoryCommitTemplate, RepositoryComparison, RepositoryFile,
    RepositoryOperationState, RepositoryOperationStep, RepositorySnapshot, RepositoryStash,
    RepositorySubmodule, RepositoryWorktree,
};
use std::{
    collections::{HashMap, HashSet},
    ffi::OsStr,
    fs,
    hash::{Hash, Hasher},
    path::{Path, PathBuf},
    io::Write,
    process::{Command, Stdio},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use std::sync::{Mutex, OnceLock};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const LANE_COLORS: [&str; 6] = [
    "#36cfc9", "#9254de", "#fa8c16", "#52c41a", "#f759ab", "#597ef7",
];

static COMMAND_LOGS: OnceLock<Mutex<Vec<CommandLogEntry>>> = OnceLock::new();
static COMMAND_LOG_ID: OnceLock<Mutex<u64>> = OnceLock::new();

fn command_logs() -> &'static Mutex<Vec<CommandLogEntry>> {
    COMMAND_LOGS.get_or_init(|| Mutex::new(Vec::new()))
}

fn next_command_log_id() -> u64 {
    let mut id = COMMAND_LOG_ID.get_or_init(|| Mutex::new(0)).lock().expect("command log id lock");
    *id += 1;
    *id
}

fn sanitize_command(args: &[String]) -> String {
    let mut redact_next = false;
    args.iter().map(|part| {
        let value = if redact_next { "[redacted]".to_string() } else {
            let shortened: String = part.chars().take(180).collect();
            if shortened.chars().count() < part.chars().count() { format!("{shortened}…") } else { shortened }
        };
        redact_next = matches!(part.as_str(), "-m" | "--message" | "user.email" | "user.name");
        value
    }).collect::<Vec<_>>().join(" ")
}

fn limit_log_output(value: String) -> String {
    let shortened: String = value.chars().take(20_000).collect();
    if shortened.chars().count() < value.chars().count() { format!("{shortened}\n… 输出已截断") } else { shortened }
}

fn record_command(path: &Path, args: &[String], output: &std::process::Output, started: SystemTime) {
    let stdout = limit_log_output(String::from_utf8_lossy(&output.stdout).trim().to_string());
    let stderr = limit_log_output(String::from_utf8_lossy(&output.stderr).trim().to_string());
    let entry = CommandLogEntry {
        id: next_command_log_id(),
        started_at: started.duration_since(UNIX_EPOCH).unwrap_or_default().as_millis(),
        duration_ms: started.elapsed().unwrap_or(Duration::ZERO).as_millis(),
        command: if path.as_os_str().is_empty() { format!("git {}", sanitize_command(args)) } else { format!("git -C {} {}", path.display(), sanitize_command(args)) },
        working_directory: path.to_string_lossy().to_string(),
        success: output.status.success(),
        exit_code: output.status.code(),
        stdout,
        stderr,
    };
    if let Ok(mut logs) = command_logs().lock() {
        logs.push(entry);
        if logs.len() > 500 { let excess = logs.len() - 500; logs.drain(0..excess); }
    }
}

pub fn load_command_logs() -> Vec<CommandLogEntry> {
    command_logs().lock().map(|logs| logs.clone()).unwrap_or_default()
}

pub fn clear_command_logs() {
    if let Ok(mut logs) = command_logs().lock() { logs.clear(); }
}

fn command_output<I, S>(path: &Path, args: I) -> Result<String, String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let args: Vec<String> = args.into_iter().map(|value| value.as_ref().to_string_lossy().to_string()).collect();
    let started = SystemTime::now();
    let mut command = Command::new("git");
    command.arg("-C").arg(path).args(&args);
    #[cfg(target_os = "windows")]
    command.creation_flags(0x08000000);
    let output = command
        .output()
        .map_err(|error| format!("无法启动 Git：{error}"))?;
    record_command(path, &args, &output, started);
    if !output.status.success() {
        let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if message.is_empty() {
            "Git 命令执行失败".into()
        } else {
            message
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn command_output_bytes<I, S>(path: &Path, args: I) -> Result<Vec<u8>, String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let args: Vec<String> = args.into_iter().map(|value| value.as_ref().to_string_lossy().to_string()).collect();
    let started = SystemTime::now();
    let mut command = Command::new("git");
    command.arg("-C").arg(path).args(&args);
    #[cfg(target_os = "windows")]
    command.creation_flags(0x08000000);
    let output = command
        .output()
        .map_err(|error| format!("无法启动 Git：{error}"))?;
    record_command(path, &args, &output, started);
    if !output.status.success() {
        let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if message.is_empty() {
            "Git 命令执行失败".into()
        } else {
            message
        });
    }
    Ok(output.stdout)
}

pub fn git_output(path: &Path, args: &[&str]) -> Result<String, String> {
    command_output(path, args)
}

fn optional_git_output(path: &Path, args: &[&str]) -> String {
    git_output(path, args).unwrap_or_default()
}

fn global_git_output(args: &[&str]) -> Result<String, String> {
    let args: Vec<String> = args.iter().map(|value| (*value).to_string()).collect();
    let started = SystemTime::now();
    let mut command = Command::new("git");
    command.args(&args);
    #[cfg(target_os = "windows")]
    command.creation_flags(0x08000000);
    let output = command
        .output()
        .map_err(|error| format!("无法启动 Git：{error}"))?;
    record_command(Path::new(""), &args, &output, started);
    if !output.status.success() {
        let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if message.is_empty() {
            "Git 命令执行失败".into()
        } else {
            message
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn global_git_config_value(key: &str) -> String {
    global_git_output(&["config", "--global", "--get", key]).unwrap_or_default()
}

fn unset_global_git_config(key: &str) {
    let _ = global_git_output(&["config", "--global", "--unset-all", key]);
}

fn configured_global_commit_template_path() -> Option<PathBuf> {
    let value = global_git_output(&["config", "--global", "--path", "--get", "commit.template"])
        .ok()?
        .trim()
        .to_string();
    (!value.is_empty()).then(|| PathBuf::from(value))
}

fn default_global_commit_template_path() -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    let base = std::env::var_os("APPDATA")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from);
    #[cfg(not(target_os = "windows"))]
    let base = std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|value| PathBuf::from(value).join(".config")));
    base.map(|path| path.join("Branchline").join("commit-template.txt"))
        .ok_or_else(|| "无法确定用户配置目录".into())
}

fn resolved_git_path(root: &Path, name: &str) -> Result<PathBuf, String> {
    let value = git_output(root, &["rev-parse", "--git-path", name])?;
    let path = PathBuf::from(value.trim());
    Ok(if path.is_absolute() { path } else { root.join(path) })
}

pub fn load_git_user_config() -> GitUserConfig {
    let autocrlf = match global_git_config_value("core.autocrlf").as_str() {
        "true" => "true",
        "input" => "input",
        _ => "false",
    };
    let pull_strategy = if global_git_config_value("pull.ff") == "only" {
        "ff-only"
    } else if matches!(
        global_git_config_value("pull.rebase").as_str(),
        "true" | "merges" | "interactive"
    ) {
        "rebase"
    } else {
        "merge"
    };
    GitUserConfig {
        user_name: global_git_config_value("user.name"),
        user_email: global_git_config_value("user.email"),
        default_branch: {
            let configured = global_git_config_value("init.defaultBranch");
            if configured.is_empty() {
                "main".into()
            } else {
                configured
            }
        },
        autocrlf: autocrlf.into(),
        pull_strategy: pull_strategy.into(),
        commit_template_path: configured_global_commit_template_path()
            .map(|path| path.to_string_lossy().to_string()),
        commit_template_content: configured_global_commit_template_path()
            .and_then(|path| fs::read_to_string(path).ok())
            .unwrap_or_default(),
    }
}

pub fn update_git_user_config(
    user_name: &str,
    user_email: &str,
    default_branch: &str,
    autocrlf: &str,
    pull_strategy: &str,
    commit_template_content: &str,
) -> Result<GitUserConfig, String> {
    let user_name = user_name.trim();
    let user_email = user_email.trim();
    let default_branch = default_branch.trim();
    if user_name.is_empty() {
        return Err("Git 用户名不能为空".into());
    }
    if user_email.is_empty() || !user_email.contains('@') {
        return Err("请输入有效的 Git 邮箱".into());
    }
    if !matches!(autocrlf, "true" | "input" | "false") {
        return Err("无效的换行符策略".into());
    }
    if !matches!(pull_strategy, "merge" | "rebase" | "ff-only") {
        return Err("无效的拉取策略".into());
    }
    global_git_output(&["check-ref-format", "--branch", default_branch])?;
    global_git_output(&["config", "--global", "user.name", user_name])?;
    global_git_output(&["config", "--global", "user.email", user_email])?;
    global_git_output(&["config", "--global", "init.defaultBranch", default_branch])?;
    global_git_output(&["config", "--global", "core.autocrlf", autocrlf])?;
    match pull_strategy {
        "rebase" => {
            global_git_output(&["config", "--global", "pull.rebase", "true"])?;
            unset_global_git_config("pull.ff");
        }
        "ff-only" => {
            global_git_output(&["config", "--global", "pull.rebase", "false"])?;
            global_git_output(&["config", "--global", "pull.ff", "only"])?;
        }
        _ => {
            global_git_output(&["config", "--global", "pull.rebase", "false"])?;
            unset_global_git_config("pull.ff");
        }
    }
    let template_content = commit_template_content.replace("\r\n", "\n");
    if template_content.trim().is_empty() {
        unset_global_git_config("commit.template");
    } else {
        let template_path = configured_global_commit_template_path()
            .unwrap_or(default_global_commit_template_path()?);
        if let Some(parent) = template_path.parent() {
            fs::create_dir_all(parent).map_err(|error| format!("创建全局模板目录失败：{error}"))?;
        }
        fs::write(&template_path, template_content.as_bytes())
            .map_err(|error| format!("写入全局提交模板失败：{error}"))?;
        let template_path = template_path.to_string_lossy().to_string();
        global_git_output(&["config", "--global", "commit.template", &template_path])?;
    }
    Ok(load_git_user_config())
}

pub fn update_repository_commit_template(
    repository_path: &str,
    content: &str,
) -> Result<RepositorySnapshot, String> {
    let root = repository_root(repository_path)?;
    let template_path = resolved_git_path(&root, "branchline-commit-template.txt")?;
    let template_content = content.replace("\r\n", "\n");
    if template_content.trim().is_empty() {
        let _ = git_output(&root, &["config", "--local", "--unset-all", "commit.template"]);
        let _ = fs::remove_file(&template_path);
    } else {
        if let Some(parent) = template_path.parent() {
            fs::create_dir_all(parent).map_err(|error| format!("创建仓库模板目录失败：{error}"))?;
        }
        fs::write(&template_path, template_content.as_bytes())
            .map_err(|error| format!("写入仓库提交模板失败：{error}"))?;
        let template_path = template_path.to_string_lossy().to_string();
        git_output(&root, &["config", "--local", "commit.template", &template_path])?;
    }
    read_repository(repository_path)
}

pub fn clear_repository_commit_template(repository_path: &str) -> Result<RepositorySnapshot, String> {
    update_repository_commit_template(repository_path, "")
}

pub fn git_output_owned(path: &Path, args: &[String]) -> Result<String, String> {
    command_output(path, args)
}

fn git_apply_cached(path: &Path, patch: &str) -> Result<(), String> {
    let mut command = Command::new("git");
    command.arg("-C").arg(path).args([
        "apply",
        "--cached",
        "--recount",
        "--whitespace=nowarn",
        "-",
    ]);
    #[cfg(target_os = "windows")]
    command.creation_flags(0x08000000);
    let mut child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("无法启动 Git：{error}"))?;
    child
        .stdin
        .take()
        .ok_or_else(|| "无法写入 Git patch".to_string())?
        .write_all(patch.as_bytes())
        .map_err(|error| format!("无法写入 Git patch：{error}"))?;
    let output = child
        .wait_with_output()
        .map_err(|error| format!("等待 Git 完成失败：{error}"))?;
    if output.status.success() {
        Ok(())
    } else {
        let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if message.is_empty() {
            "Git 无法应用所选修改块".into()
        } else {
            message
        })
    }
}

fn git_apply_reverse(path: &Path, patch: &str) -> Result<(), String> {
    let mut command = Command::new("git");
    command.arg("-C").arg(path).args([
        "apply",
        "--reverse",
        "--recount",
        "--whitespace=nowarn",
        "-",
    ]);
    #[cfg(target_os = "windows")]
    command.creation_flags(0x08000000);
    let mut child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("无法启动 Git：{error}"))?;
    child
        .stdin
        .take()
        .ok_or_else(|| "无法写入 Git patch".to_string())?
        .write_all(patch.as_bytes())
        .map_err(|error| format!("无法写入 Git patch：{error}"))?;
    let output = child
        .wait_with_output()
        .map_err(|error| format!("等待 Git 完成失败：{error}"))?;
    if output.status.success() {
        Ok(())
    } else {
        let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if message.is_empty() {
            "Git 无法还原所选修改块".into()
        } else {
            message
        })
    }
}

fn git_success(path: &Path, args: &[&str]) -> bool {
    let mut command = Command::new("git");
    command.arg("-C").arg(path).args(args);
    #[cfg(target_os = "windows")]
    command.creation_flags(0x08000000);
    command.status().is_ok_and(|status| status.success())
}

fn initials(author: &str) -> String {
    let parts: Vec<&str> = author
        .split_whitespace()
        .filter(|part| !part.is_empty())
        .collect();
    if parts.len() >= 2 {
        return format!(
            "{}{}",
            parts[0].chars().next().unwrap_or('G'),
            parts[1].chars().next().unwrap_or('T')
        )
        .to_uppercase();
    }
    author.chars().take(2).collect::<String>().to_uppercase()
}

fn decorations(value: &str) -> Vec<String> {
    value
        .split(',')
        .filter_map(|item| {
            let mut label = item.trim();
            if let Some((_, branch)) = label.split_once(" -> ") {
                label = branch.trim();
            }
            label = label.strip_prefix("tag: ").unwrap_or(label);
            if label.is_empty() || label.contains("/HEAD") {
                None
            } else {
                Some(label.to_string())
            }
        })
        .collect()
}

fn assign_lanes(commits: &mut [RepositoryCommit]) {
    let known: HashSet<String> = commits
        .iter()
        .map(|commit| commit.full_hash.clone())
        .collect();
    let mut active: HashMap<String, usize> = HashMap::new();
    for commit in commits.iter_mut() {
        let occupied: HashSet<usize> = active.values().copied().collect();
        let lane = active.remove(&commit.full_hash).unwrap_or_else(|| {
            (0..)
                .find(|candidate| !occupied.contains(candidate))
                .unwrap_or(0)
        });
        commit.lane = lane;
        commit.color = LANE_COLORS[lane % LANE_COLORS.len()].into();

        let mut reserved: HashSet<usize> = active.values().copied().collect();
        for (index, parent) in commit
            .parents
            .iter()
            .filter(|parent| known.contains(*parent))
            .enumerate()
        {
            if active.contains_key(parent) {
                continue;
            }
            let parent_lane = if index == 0 && !reserved.contains(&lane) {
                lane
            } else {
                (0..)
                    .find(|candidate| !reserved.contains(candidate))
                    .unwrap_or(0)
            };
            active.insert(parent.clone(), parent_lane);
            reserved.insert(parent_lane);
        }
    }
}

fn parse_commits(path: &Path) -> Vec<RepositoryCommit> {
    let output = optional_git_output(
        path,
        &[
            "-c",
            "core.quotepath=false",
            "log",
            "--all",
            // Keep parents below their children while otherwise preferring
            // commit-date order. Unlike --topo-order, this does not move an
            // older side-branch commit ahead of a newer independent merge.
            "--date-order",
            "--max-count=500",
            "--date=iso-strict",
            "--pretty=format:%x1e%H%x1f%P%x1f%an%x1f%ae%x1f%cn%x1f%ce%x1f%aI%x1f%cI%x1f%D%x1f%B",
        ],
    );

    let mut commits: Vec<RepositoryCommit> = output
        .split('\x1e')
        .filter_map(|record| {
            let record = record.trim_matches(&['\r', '\n'][..]);
            if record.is_empty() {
                return None;
            }
            let fields: Vec<&str> = record.split('\x1f').collect();
            if fields.len() < 10 {
                return None;
            }
            let full_hash = fields[0].to_string();
            let parents: Vec<String> = fields[1]
                .split_whitespace()
                .map(ToString::to_string)
                .collect();
            let message = fields[9].trim().to_string();
            let title = message.lines().next().unwrap_or("无提交信息").to_string();
            let branches = decorations(fields[8]);
            let is_stash = branches.iter().any(|reference| reference == "refs/stash");
            Some(RepositoryCommit {
                id: full_hash.chars().take(7).collect(),
                full_hash,
                parent: parents.first().cloned(),
                parents: parents.clone(),
                lane: 0,
                color: LANE_COLORS[0].into(),
                title,
                message,
                author: fields[2].to_string(),
                email: fields[3].to_string(),
                committer: fields[4].to_string(),
                committer_email: fields[5].to_string(),
                avatar: initials(fields[2]),
                time: fields[7].to_string(),
                author_time: fields[6].to_string(),
                commit_time: fields[7].to_string(),
                branches,
                status: if is_stash {
                    Some("stash".into())
                } else if parents.len() > 1 {
                    Some("merge".into())
                } else {
                    None
                },
                files: 0,
                additions: 0,
                deletions: 0,
            })
        })
        .collect();
    let stash_helper_parents: HashSet<String> = commits
        .iter()
        .filter(|commit| commit.status.as_deref() == Some("stash"))
        .flat_map(|commit| commit.parents.iter().skip(1).cloned())
        .collect();
    commits.retain(|commit| {
        !stash_helper_parents.contains(&commit.full_hash) || !commit.branches.is_empty()
    });
    assign_lanes(&mut commits);
    commits
}

fn collect_numstat(path: &Path, args: &[&str], stats: &mut HashMap<String, (usize, usize)>) {
    for line in optional_git_output(path, args).lines() {
        let columns: Vec<&str> = line.splitn(3, '\t').collect();
        if columns.len() != 3 {
            continue;
        }
        let value = stats.entry(columns[2].to_string()).or_default();
        value.0 += columns[0].parse().unwrap_or(0);
        value.1 += columns[1].parse().unwrap_or(0);
    }
}

fn porcelain_file_type(code: &str) -> &'static str {
    if matches!(code, "DD" | "AU" | "UD" | "UA" | "DU" | "AA" | "UU") {
        "U"
    } else if code == "??" || code.contains('A') {
        "A"
    } else if code.contains('D') {
        "D"
    } else if code.contains('R') {
        "R"
    } else {
        "M"
    }
}

fn parse_changed_files(path: &Path) -> Vec<RepositoryFile> {
    let mut stats: HashMap<String, (usize, usize)> = HashMap::new();
    collect_numstat(
        path,
        &["-c", "core.quotepath=false", "diff", "--numstat", "--"],
        &mut stats,
    );
    collect_numstat(
        path,
        &[
            "-c",
            "core.quotepath=false",
            "diff",
            "--cached",
            "--numstat",
            "--",
        ],
        &mut stats,
    );

    let status = optional_git_output(
        path,
        &[
            "-c",
            "core.quotepath=false",
            "status",
            "--porcelain=v1",
            "--untracked-files=all",
        ],
    );
    status
        .lines()
        .filter_map(|line| {
            if line.len() < 3 {
                return None;
            }
            let code = &line[..2];
            let raw_path = line[3..].trim();
            let file_path = raw_path
                .rsplit_once(" -> ")
                .map(|(_, next)| next)
                .unwrap_or(raw_path)
                .trim_matches('"')
                .to_string();
            let file_type = porcelain_file_type(code);
            let bytes = code.as_bytes();
            let staged = code != "??" && bytes.first().is_some_and(|value| *value != b' ');
            let unstaged = code == "??" || bytes.get(1).is_some_and(|value| *value != b' ');
            let (add, del) = stats.get(&file_path).copied().unwrap_or((0, 0));
            Some(RepositoryFile {
                path: file_path,
                r#type: file_type.into(),
                add,
                del,
                staged,
                unstaged,
                incoming: false,
            })
        })
        .collect()
}

fn incoming_changed_paths(path: &Path) -> HashSet<String> {
    optional_git_output(
        path,
        &[
            "-c",
            "core.quotepath=false",
            "diff",
            "--name-only",
            "--no-renames",
            "HEAD...@{upstream}",
            "--",
        ],
    )
    .lines()
    .map(str::trim)
    .filter(|line| !line.is_empty())
    .map(|line| line.trim_matches('"').to_string())
    .collect()
}

fn index_entries(
    path: &Path,
) -> (
    HashMap<String, (String, String)>,
    HashSet<String>,
    HashSet<String>,
) {
    let mut entries = HashMap::new();
    let mut gitlinks = HashSet::new();
    let mut conflicts = HashSet::new();
    for line in optional_git_output(
        path,
        &["-c", "core.quotepath=false", "ls-files", "--stage", "--"],
    )
    .lines()
    {
        let Some((metadata, file_path)) = line.split_once('\t') else {
            continue;
        };
        let fields: Vec<&str> = metadata.split_whitespace().collect();
        if fields.len() < 3 {
            continue;
        }
        let file_path = file_path.trim_matches('"').to_string();
        if fields[0] == "160000" {
            gitlinks.insert(file_path.clone());
        }
        if fields[2] == "0" {
            entries.insert(file_path, (fields[0].to_string(), fields[1].to_string()));
        } else {
            conflicts.insert(file_path);
        }
    }
    (entries, gitlinks, conflicts)
}

fn head_gitlink_paths(path: &Path) -> HashSet<String> {
    optional_git_output(
        path,
        &[
            "-c",
            "core.quotepath=false",
            "ls-tree",
            "-r",
            "--full-tree",
            "HEAD",
        ],
    )
    .lines()
    .filter_map(|line| {
        let (metadata, file_path) = line.split_once('\t')?;
        metadata
            .starts_with("160000 ")
            .then(|| file_path.trim_matches('"').to_string())
    })
    .collect()
}

fn gitlink_paths(path: &Path) -> HashSet<String> {
    let (_, mut gitlinks, _) = index_entries(path);
    gitlinks.extend(head_gitlink_paths(path));
    gitlinks
}

fn stashable_changed_paths(path: &Path) -> Vec<String> {
    let gitlinks = gitlink_paths(path);
    parse_changed_files(path)
        .into_iter()
        .filter(|file| !gitlinks.contains(&file.path))
        .map(|file| file.path)
        .collect()
}

fn with_gitlinks_excluded_from_stash<T>(
    path: &Path,
    action: impl FnOnce() -> Result<T, String>,
) -> Result<T, String> {
    let changed: HashSet<String> = parse_changed_files(path)
        .into_iter()
        .map(|file| file.path)
        .collect();
    let (index, index_gitlinks, conflicts) = index_entries(path);
    let mut gitlinks = head_gitlink_paths(path);
    gitlinks.extend(index_gitlinks);
    let changed_gitlinks: Vec<String> = gitlinks
        .into_iter()
        .filter(|file_path| changed.contains(file_path))
        .collect();
    if changed_gitlinks
        .iter()
        .any(|file_path| conflicts.contains(file_path))
    {
        return Err("Gitlink 存在未解决冲突，无法安全创建 Stash".into());
    }
    if changed_gitlinks.is_empty() {
        return action();
    }

    let states: Vec<(String, Option<(String, String)>)> = changed_gitlinks
        .iter()
        .map(|file_path| (file_path.clone(), index.get(file_path).cloned()))
        .collect();
    let mut reset_args = vec!["reset".to_string(), "-q".into(), "HEAD".into(), "--".into()];
    reset_args.extend(changed_gitlinks);
    git_output_owned(path, &reset_args)?;
    let result = action();

    let mut restore_error = None;
    for (file_path, state) in states {
        let restored = if let Some((mode, hash)) = state {
            git_output_owned(
                path,
                &[
                    "update-index".into(),
                    "--add".into(),
                    "--cacheinfo".into(),
                    mode,
                    hash,
                    file_path,
                ],
            )
        } else {
            git_output_owned(
                path,
                &[
                    "update-index".into(),
                    "--force-remove".into(),
                    "--".into(),
                    file_path,
                ],
            )
        };
        if let Err(error) = restored {
            restore_error = Some(error);
            break;
        }
    }
    match (result, restore_error) {
        (Ok(value), None) => Ok(value),
        (Err(error), None) => Err(error),
        (Ok(_), Some(error)) => Err(format!(
            "Stash 已创建，但恢复 Gitlink 索引状态失败：{error}"
        )),
        (Err(error), Some(restore_error)) => Err(format!(
            "{error}\n同时恢复 Gitlink 索引状态失败：{restore_error}"
        )),
    }
}

fn hunk_start(header: &str, marker: char) -> Option<usize> {
    header
        .split_whitespace()
        .find(|part| part.starts_with(marker))
        .and_then(|part| part.trim_start_matches(marker).split(',').next())
        .and_then(|value| value.parse::<usize>().ok())
}

fn parse_diff_text(diff: &str) -> Vec<DiffLine> {
    let mut rows = Vec::new();
    let mut old_line = 0usize;
    let mut next_line = 0usize;
    let mut in_hunk = false;
    for line in diff.lines() {
        if line.starts_with("@@") {
            old_line = hunk_start(line, '-').unwrap_or(1);
            next_line = hunk_start(line, '+').unwrap_or(1);
            in_hunk = true;
            continue;
        }
        if !in_hunk || line.starts_with("\\ No newline") {
            continue;
        }
        let mut chars = line.chars();
        let prefix = chars.next().unwrap_or(' ');
        let code = chars.collect::<String>();
        match prefix {
            '+' => {
                rows.push(DiffLine {
                    old: None,
                    next: Some(next_line),
                    kind: "add".into(),
                    code,
                });
                next_line += 1;
            }
            '-' => {
                rows.push(DiffLine {
                    old: Some(old_line),
                    next: None,
                    kind: "del".into(),
                    code,
                });
                old_line += 1;
            }
            ' ' => {
                rows.push(DiffLine {
                    old: Some(old_line),
                    next: Some(next_line),
                    kind: "same".into(),
                    code,
                });
                old_line += 1;
                next_line += 1;
            }
            _ => {}
        }
    }

    rows
}

pub fn parse_diff(path: &Path, file_path: &str) -> Result<Vec<DiffLine>, String> {
    let diff = optional_git_output(
        path,
        &[
            "-c",
            "core.quotepath=false",
            "diff",
            "--no-color",
            "--unified=100000",
            "HEAD",
            "--",
            file_path,
        ],
    );
    let mut rows = parse_diff_text(&diff);
    if rows.is_empty() {
        let root = path
            .canonicalize()
            .map_err(|error| format!("无法访问仓库：{error}"))?;
        let candidate = path.join(file_path);
        if candidate.exists() {
            let resolved = candidate
                .canonicalize()
                .map_err(|error| format!("无法访问文件：{error}"))?;
            if !resolved.starts_with(&root) {
                return Err("文件路径超出仓库范围".into());
            }
            let content = std::fs::read_to_string(&resolved)
                .map_err(|_| "暂不支持预览二进制文件".to_string())?;
            rows = content
                .lines()
                .enumerate()
                .map(|(index, code)| DiffLine {
                    old: None,
                    next: Some(index + 1),
                    kind: "add".into(),
                    code: code.to_string(),
                })
                .collect();
        }
    }
    Ok(rows)
}

pub fn parse_unstaged_diff(path: &Path, file_path: &str) -> Result<Vec<DiffLine>, String> {
    let file_path = validated_file_path(file_path)?;
    let diff = optional_git_output(
        path,
        &[
            "-c",
            "core.quotepath=false",
            "diff",
            "--no-color",
            "--unified=100000",
            "--",
            &file_path,
        ],
    );
    let mut rows = parse_diff_text(&diff);
    if rows.is_empty() {
        let root = path
            .canonicalize()
            .map_err(|error| format!("无法访问仓库：{error}"))?;
        let candidate = root.join(&file_path);
        if candidate.exists() {
            let resolved = candidate
                .canonicalize()
                .map_err(|error| format!("无法访问文件：{error}"))?;
            if !resolved.starts_with(&root) {
                return Err("文件路径超出仓库范围".into());
            }
            let content = std::fs::read_to_string(&resolved)
                .map_err(|_| "暂不支持预览二进制文件".to_string())?;
            rows = content
                .lines()
                .enumerate()
                .map(|(index, code)| DiffLine {
                    old: None,
                    next: Some(index + 1),
                    kind: "add".into(),
                    code: code.to_string(),
                })
                .collect();
        }
    }
    Ok(rows)
}

fn resolve_commit(path: &Path, reference: &str) -> Result<String, String> {
    let object = git_output_owned(
        path,
        &[
            "rev-parse".into(),
            "--verify".into(),
            "--end-of-options".into(),
            reference.into(),
        ],
    )?
    .trim()
    .to_string();
    if object.len() != 40 || !object.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(format!("无效的提交或分支：{reference}"));
    }
    let commit = git_output_owned(
        path,
        &[
            "rev-parse".into(),
            "--verify".into(),
            format!("{object}^{{commit}}"),
        ],
    )?
    .trim()
    .to_string();
    if commit.len() != 40 || !commit.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(format!("无效的提交或分支：{reference}"));
    }
    Ok(commit)
}

pub fn parse_compare_diff(
    repository_path: &str,
    base: &str,
    target: &str,
    file_path: &str,
) -> Result<Vec<DiffLine>, String> {
    let root = repository_root(repository_path)?;
    let file_path = validated_file_path(file_path)?;
    let base_hash = resolve_commit(&root, base)?;
    let target_hash = resolve_commit(&root, target)?;
    let range = format!("{base_hash}..{target_hash}");
    let diff = git_output_owned(
        &root,
        &[
            "-c".into(),
            "core.quotepath=false".into(),
            "diff".into(),
            "--no-color".into(),
            "--unified=100000".into(),
            range,
            "--".into(),
            file_path,
        ],
    )?;
    Ok(parse_diff_text(&diff))
}

fn parse_worktrees(path: &Path) -> Vec<RepositoryWorktree> {
    optional_git_output(path, &["worktree", "list", "--porcelain"])
        .split("\n\n")
        .filter_map(|record| {
            let mut worktree = RepositoryWorktree {
                path: String::new(),
                branch: None,
                head: None,
                bare: false,
                locked: None,
                prunable: None,
            };
            for line in record.lines() {
                if let Some(value) = line.strip_prefix("worktree ") {
                    worktree.path = value.to_string();
                } else if let Some(value) = line.strip_prefix("HEAD ") {
                    worktree.head = Some(value.to_string());
                } else if let Some(value) = line.strip_prefix("branch ") {
                    worktree.branch = Some(
                        value
                            .strip_prefix("refs/heads/")
                            .unwrap_or(value)
                            .to_string(),
                    );
                } else if line == "bare" {
                    worktree.bare = true;
                } else if let Some(value) = line.strip_prefix("locked") {
                    worktree.locked = Some(value.trim().to_string());
                } else if let Some(value) = line.strip_prefix("prunable") {
                    worktree.prunable = Some(value.trim().to_string());
                }
            }
            (!worktree.path.is_empty()).then_some(worktree)
        })
        .collect()
}

fn parse_submodules(path: &Path) -> Vec<RepositorySubmodule> {
    optional_git_output(path, &["submodule", "status", "--recursive"])
        .lines()
        .filter_map(|line| {
            let marker = line.chars().next()?;
            let fields: Vec<&str> = line[marker.len_utf8()..].split_whitespace().collect();
            if fields.len() < 2 {
                return None;
            }
            let status = match marker {
                ' ' => "ok",
                '+' => "modified",
                '-' => "uninitialized",
                'U' => "missing",
                _ => "unknown",
            };
            let branch = fields
                .get(2)
                .map(|value| value.trim_matches(&['(', ')'][..]).to_string());
            Some(RepositorySubmodule {
                path: fields[1].to_string(),
                hash: fields[0].to_string(),
                status: status.into(),
                branch,
            })
        })
        .collect()
}

fn normalized_path_key(path: &Path) -> String {
    path.to_string_lossy()
        .replace('\\', "/")
        .trim_end_matches('/')
        .to_ascii_lowercase()
}

fn worktree_entry<'a>(root: &Path, requested_path: &str, worktrees: &'a [RepositoryWorktree]) -> Result<&'a RepositoryWorktree, String> {
    let requested = PathBuf::from(requested_path.trim());
    let requested = if requested.is_absolute() { requested } else { root.join(requested) };
    let key = normalized_path_key(&requested);
    worktrees
        .iter()
        .find(|worktree| normalized_path_key(Path::new(&worktree.path)) == key)
        .ok_or_else(|| format!("Worktree 不存在：{}", requested.display()))
}

fn validated_submodule_path(root: &Path, requested_path: &str) -> Result<String, String> {
    let requested = requested_path
        .trim()
        .replace('\\', "/")
        .trim_matches('/')
        .to_string();
    if requested.is_empty() {
        return Err("Submodule 路径不能为空".into());
    }
    parse_submodules(root)
        .into_iter()
        .find(|submodule| submodule.path.replace('\\', "/") == requested)
        .map(|submodule| submodule.path)
        .ok_or_else(|| format!("Submodule 不存在：{requested}"))
}

pub fn create_repository_worktree(
    repository_path: &str,
    worktree_path: &str,
    branch: &str,
    create_branch: bool,
) -> Result<(), String> {
    let root = repository_root(repository_path)?;
    let requested = worktree_path.trim();
    if requested.is_empty() {
        return Err("Worktree 目录不能为空".into());
    }
    let destination = PathBuf::from(requested);
    let destination = if destination.is_absolute() { destination } else { root.join(destination) };
    if parse_worktrees(&root).iter().any(|worktree| {
        normalized_path_key(Path::new(&worktree.path)) == normalized_path_key(&destination)
    }) {
        return Err(format!("该目录已经是 Worktree：{}", destination.display()));
    }

    let branch = branch.trim();
    if branch.is_empty() {
        return Err("Worktree 分支不能为空".into());
    }
    git_output_owned(
        &root,
        &["check-ref-format".into(), "--branch".into(), branch.into()],
    )?;
    let branch_exists = parse_local_branches(&root).iter().any(|item| item == branch);
    if create_branch && branch_exists {
        return Err(format!("分支已存在：{branch}"));
    }
    if !create_branch && !branch_exists {
        return Err(format!("本地分支不存在：{branch}"));
    }

    let mut args = vec!["worktree".into(), "add".into()];
    if create_branch {
        args.extend(["-b".into(), branch.into()]);
    }
    args.push(destination.to_string_lossy().to_string());
    args.push(if create_branch { "HEAD".into() } else { branch.into() });
    git_output_owned(&root, &args).map(|_| ())
}

pub fn remove_repository_worktree(repository_path: &str, worktree_path: &str) -> Result<(), String> {
    let root = repository_root(repository_path)?;
    let worktrees = parse_worktrees(&root);
    let worktree = worktree_entry(&root, worktree_path, &worktrees)?;
    if normalized_path_key(Path::new(&worktree.path)) == normalized_path_key(&root) {
        return Err("不能移除当前 Worktree".into());
    }
    git_output_owned(
        &root,
        &["worktree".into(), "remove".into(), worktree.path.clone()],
    )
    .map(|_| ())
}

pub fn set_repository_worktree_lock(repository_path: &str, worktree_path: &str, locked: bool) -> Result<(), String> {
    let root = repository_root(repository_path)?;
    let worktrees = parse_worktrees(&root);
    let worktree = worktree_entry(&root, worktree_path, &worktrees)?;
    let args = if locked {
        vec![
            "worktree".into(),
            "lock".into(),
            "--reason".into(),
            "Branchline".into(),
            worktree.path.clone(),
        ]
    } else {
        vec!["worktree".into(), "unlock".into(), worktree.path.clone()]
    };
    git_output_owned(&root, &args).map(|_| ())
}

pub fn prune_repository_worktrees(repository_path: &str) -> Result<(), String> {
    let root = repository_root(repository_path)?;
    git_output(&root, &["worktree", "prune"]).map(|_| ())
}

pub fn initialize_repository_submodule(repository_path: &str, submodule_path: &str) -> Result<(), String> {
    let root = repository_root(repository_path)?;
    let submodule = validated_submodule_path(&root, submodule_path)?;
    git_output_owned(
        &root,
        &["submodule".into(), "init".into(), "--".into(), submodule],
    )
    .map(|_| ())
}

pub fn update_repository_submodule(repository_path: &str, submodule_path: Option<&str>) -> Result<(), String> {
    let root = repository_root(repository_path)?;
    let mut args = vec![
        "submodule".into(),
        "update".into(),
        "--init".into(),
        "--recursive".into(),
    ];
    if let Some(submodule_path) = submodule_path {
        args.extend(["--".into(), validated_submodule_path(&root, submodule_path)?]);
    }
    git_output_owned(&root, &args).map(|_| ())
}

pub fn sync_repository_submodules(repository_path: &str) -> Result<(), String> {
    let root = repository_root(repository_path)?;
    git_output(&root, &["submodule", "sync", "--recursive"]).map(|_| ())
}

pub fn deinitialize_repository_submodule(repository_path: &str, submodule_path: &str) -> Result<(), String> {
    let root = repository_root(repository_path)?;
    let submodule = validated_submodule_path(&root, submodule_path)?;
    git_output_owned(
        &root,
        &["submodule".into(), "deinit".into(), "--".into(), submodule],
    )
    .map(|_| ())
}

fn parse_branches(path: &Path) -> Vec<String> {
    let mut branches: Vec<String> = optional_git_output(
        path,
        &[
            "for-each-ref",
            "--format=%(refname:short)",
            "refs/heads",
            "refs/remotes",
        ],
    )
    .lines()
    .map(str::trim)
    .filter(|branch| !branch.is_empty() && !branch.ends_with("/HEAD"))
    .map(ToString::to_string)
    .collect();
    branches.sort();
    branches.dedup();
    branches
}

fn parse_remote_branches(path: &Path) -> Vec<String> {
    optional_git_output(
        path,
        &["for-each-ref", "--format=%(refname:short)", "refs/remotes"],
    )
    .lines()
    .map(str::trim)
    .filter(|branch| !branch.is_empty() && !branch.ends_with("/HEAD"))
    .map(ToString::to_string)
    .collect()
}

fn parse_local_branches(path: &Path) -> Vec<String> {
    optional_git_output(
        path,
        &["for-each-ref", "--format=%(refname:short)", "refs/heads"],
    )
    .lines()
    .map(str::trim)
    .filter(|branch| !branch.is_empty())
    .map(ToString::to_string)
    .collect()
}

fn parse_branch_tracking(path: &Path) -> HashMap<String, RepositoryBranchTracking> {
    let mut result = HashMap::new();
    let refs = optional_git_output(
        path,
        &[
            "for-each-ref",
            "--format=%(refname:short)\t%(upstream:short)",
            "refs/heads",
        ],
    );
    for record in refs.lines() {
        let Some((branch, upstream)) = record.split_once('\t') else {
            continue;
        };
        let branch = branch.trim();
        let upstream = upstream.trim();
        if branch.is_empty() {
            continue;
        }
        let (ahead, behind) = if upstream.is_empty() {
            (0, 0)
        } else {
            let range = format!("{branch}...{upstream}");
            let counts = git_output_owned(
                path,
                &[
                    "rev-list".into(),
                    "--left-right".into(),
                    "--count".into(),
                    range,
                ],
            )
            .unwrap_or_default();
            let values: Vec<usize> = counts
                .split_whitespace()
                .take(2)
                .map(|value| value.parse().unwrap_or(0))
                .collect();
            (
                values.first().copied().unwrap_or(0),
                values.get(1).copied().unwrap_or(0),
            )
        };
        result.insert(
            branch.to_string(),
            RepositoryBranchTracking {
                upstream: (!upstream.is_empty()).then_some(upstream.to_string()),
                ahead,
                behind,
            },
        );
    }
    result
}

fn parse_tags(path: &Path) -> Vec<String> {
    optional_git_output(path, &["tag", "--list", "--sort=-creatordate"])
        .lines()
        .map(str::trim)
        .filter(|tag| !tag.is_empty())
        .map(ToString::to_string)
        .collect()
}

fn parse_stashes(path: &Path) -> Vec<RepositoryStash> {
    optional_git_output(
        path,
        &[
            "stash",
            "list",
            "--pretty=format:%x1e%gd%x1f%gs%x1f%an%x1f%aI",
        ],
    )
    .split('\x1e')
    .filter_map(|record| {
        let fields: Vec<&str> = record.trim().split('\x1f').collect();
        (fields.len() >= 4).then(|| RepositoryStash {
            reference: fields[0].to_string(),
            message: fields[1].to_string(),
            author: fields[2].to_string(),
            time: fields[3].to_string(),
        })
    })
    .collect()
}

fn parse_commit_template(path: &Path) -> Option<RepositoryCommitTemplate> {
    let configured = optional_git_output(path, &["config", "--path", "--get", "commit.template"])
        .trim()
        .to_string();
    if configured.is_empty() {
        return None;
    }
    let configured_path = PathBuf::from(&configured);
    let resolved = if configured_path.is_absolute() {
        configured_path
    } else {
        path.join(configured_path)
    };
    Some(RepositoryCommitTemplate {
        path: resolved.to_string_lossy().to_string(),
        content: std::fs::read_to_string(&resolved).unwrap_or_default(),
    })
}

fn superproject_working_tree(path: &Path) -> Option<String> {
    let value = optional_git_output(path, &["rev-parse", "--show-superproject-working-tree"])
        .trim()
        .to_string();
    if value.is_empty() {
        return None;
    }
    let resolved = std::fs::canonicalize(&value).unwrap_or_else(|_| PathBuf::from(value));
    Some(resolved.to_string_lossy().to_string())
}

pub fn repository_root(selected_path: &str) -> Result<PathBuf, String> {
    let selected = Path::new(selected_path);
    if !selected.exists() || !selected.is_dir() {
        return Err("选择的目录不存在".into());
    }
    let root_output = git_output(selected, &["rev-parse", "--show-toplevel"])
        .map_err(|_| "该目录不是 Git 仓库，也不在 Git Worktree 中".to_string())?;
    Ok(PathBuf::from(root_output.trim()))
}

fn git_internal_path(root: &Path, name: &str) -> PathBuf {
    let value = optional_git_output(root, &["rev-parse", "--git-path", name])
        .trim()
        .to_string();
    let path = PathBuf::from(value);
    if path.is_absolute() {
        path
    } else {
        root.join(path)
    }
}

fn read_trimmed(path: &Path) -> Option<String> {
    std::fs::read_to_string(path)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn operation_steps(root: &Path, range: &str, current_step: usize) -> Vec<RepositoryOperationStep> {
    let output = optional_git_output(
        root,
        &[
            "log",
            "--reverse",
            "--topo-order",
            "--no-merges",
            "--format=%H%x1f%h%x1f%s%x1f%an%x1e",
            range,
        ],
    );
    output
        .split('\x1e')
        .enumerate()
        .filter_map(|(index, record)| {
            let fields: Vec<&str> = record.trim().split('\x1f').collect();
            if fields.len() < 4 || fields[0].is_empty() {
                return None;
            }
            Some(RepositoryOperationStep {
                hash: fields[0].into(),
                short_hash: fields[1].into(),
                title: fields[2].into(),
                author: fields[3].into(),
                status: if index + 1 < current_step {
                    "applied".into()
                } else if index + 1 == current_step {
                    "current".into()
                } else {
                    "pending".into()
                },
            })
        })
        .collect()
}

fn unresolved_paths(root: &Path) -> Vec<String> {
    optional_git_output(
        root,
        &[
            "-c",
            "core.quotepath=false",
            "diff",
            "--name-only",
            "--diff-filter=U",
        ],
    )
    .lines()
    .map(str::trim)
    .filter(|path| !path.is_empty())
    .map(ToString::to_string)
    .collect()
}

fn repository_operation(root: &Path) -> Option<RepositoryOperationState> {
    let conflicts = unresolved_paths(root);
    let merge_head = git_internal_path(root, "MERGE_HEAD");
    let cherry_pick_head = git_internal_path(root, "CHERRY_PICK_HEAD");
    let rebase_merge = git_internal_path(root, "rebase-merge");
    let rebase_apply = git_internal_path(root, "rebase-apply");
    let (kind, current_step, total_steps, original_branch, onto, current_commit, message, steps) =
        if rebase_merge.is_dir() || rebase_apply.is_dir() {
            let directory = if rebase_merge.is_dir() {
                rebase_merge
            } else {
                rebase_apply
            };
            let current_step = read_trimmed(&directory.join("msgnum"))
                .or_else(|| read_trimmed(&directory.join("next")))
                .and_then(|value| value.parse().ok())
                .unwrap_or(1);
            let total_steps = read_trimmed(&directory.join("end"))
                .or_else(|| read_trimmed(&directory.join("last")))
                .and_then(|value| value.parse().ok())
                .unwrap_or(current_step);
            let onto = read_trimmed(&directory.join("onto"));
            let original_head = read_trimmed(&directory.join("orig-head"))
                .or_else(|| read_trimmed(&git_internal_path(root, "ORIG_HEAD")));
            let original_branch = read_trimmed(&directory.join("head-name"))
                .map(|value| value.trim_start_matches("refs/heads/").to_string());
            let range = match (&onto, &original_head) {
                (Some(onto), Some(head)) => format!("{onto}..{head}"),
                _ => "HEAD".into(),
            };
            let current_commit = read_trimmed(&git_internal_path(root, "REBASE_HEAD"));
            let message = current_commit.as_ref().and_then(|hash| {
                git_output_owned(
                    root,
                    &[
                        "show".into(),
                        "-s".into(),
                        "--format=%s".into(),
                        hash.clone(),
                    ],
                )
                .ok()
                .map(|value| value.trim().to_string())
            });
            (
                "rebase",
                current_step,
                total_steps,
                original_branch,
                onto,
                current_commit,
                message,
                operation_steps(root, &range, current_step),
            )
        } else if merge_head.is_file() {
            let current_commit = read_trimmed(&merge_head);
            let message = read_trimmed(&git_internal_path(root, "MERGE_MSG"));
            (
                "merge",
                1,
                1,
                None,
                None,
                current_commit,
                message,
                Vec::new(),
            )
        } else if cherry_pick_head.is_file() {
            let current_commit = read_trimmed(&cherry_pick_head);
            let message = current_commit.as_ref().and_then(|hash| {
                git_output_owned(
                    root,
                    &[
                        "show".into(),
                        "-s".into(),
                        "--format=%s".into(),
                        hash.clone(),
                    ],
                )
                .ok()
                .map(|value| value.trim().to_string())
            });
            (
                "cherry-pick",
                1,
                1,
                None,
                None,
                current_commit,
                message,
                Vec::new(),
            )
        } else if !conflicts.is_empty() {
            (
                "conflict",
                0,
                0,
                None,
                None,
                None,
                Some("工作区存在未解决冲突".into()),
                Vec::new(),
            )
        } else {
            return None;
        };
    Some(RepositoryOperationState {
        kind: kind.into(),
        label: match kind {
            "rebase" => "变基进行中",
            "merge" => "合并进行中",
            "cherry-pick" => "Cherry-pick 进行中",
            _ => "冲突待处理",
        }
        .into(),
        original_branch,
        onto,
        current_step,
        total_steps,
        current_commit,
        message,
        conflicts,
        steps,
    })
}

pub fn repository_state_token(selected_path: &str) -> Result<String, String> {
    let root = repository_root(selected_path)?;
    let status = command_output_bytes(
        &root,
        [
            "status",
            "--porcelain=v1",
            "--branch",
            "-z",
            "--untracked-files=all",
        ],
    )?;
    let references = command_output_bytes(
        &root,
        [
            "for-each-ref",
            "--format=%(refname):%(objectname)",
            "refs/heads",
            "refs/remotes",
            "refs/tags",
            "refs/stash",
        ],
    )?;
    let worktrees = command_output_bytes(&root, ["worktree", "list", "--porcelain"])?;
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    status.hash(&mut hasher);
    references.hash(&mut hasher);
    worktrees.hash(&mut hasher);

    for record in status.split(|byte| *byte == 0).filter(|record| record.len() > 3) {
        let relative_path = String::from_utf8_lossy(&record[3..]);
        let path = root.join(relative_path.as_ref());
        path.hash(&mut hasher);
        if let Ok(metadata) = fs::metadata(path) {
            metadata.len().hash(&mut hasher);
            if let Ok(modified) = metadata.modified() {
                if let Ok(elapsed) = modified.duration_since(UNIX_EPOCH) {
                    elapsed.as_nanos().hash(&mut hasher);
                }
            }
        }
    }
    Ok(format!("{:016x}", hasher.finish()))
}

pub fn read_repository(selected_path: &str) -> Result<RepositorySnapshot, String> {
    let root = repository_root(selected_path)?;
    let root_path = root.as_path();
    let root_text = root.to_string_lossy();
    let name = root_path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or(&root_text)
        .to_string();

    let (metadata, commits, files, structure, refs, stashes, commit_template) =
        std::thread::scope(|scope| {
            let metadata = scope.spawn(|| {
                let mut branch =
                    optional_git_output(root_path, &["symbolic-ref", "--short", "-q", "HEAD"])
                        .trim()
                        .to_string();
                if branch.is_empty() {
                    let short_hash =
                        optional_git_output(root_path, &["rev-parse", "--short", "HEAD"])
                            .trim()
                            .to_string();
                    branch = if short_hash.is_empty() {
                        "无提交".into()
                    } else {
                        format!("Detached @ {short_hash}")
                    };
                }
                let remote = optional_git_output(root_path, &["remote", "get-url", "origin"])
                    .trim()
                    .to_string();
                let counts = optional_git_output(
                    root_path,
                    &["rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
                );
                let values: Vec<&str> = counts.split_whitespace().collect();
                let (ahead, behind) = values
                    .get(0..2)
                    .map(|values| {
                        (
                            values[0].parse().unwrap_or(0),
                            values[1].parse().unwrap_or(0),
                        )
                    })
                    .unwrap_or((0, 0));
                let superproject_path = superproject_working_tree(root_path);
                (branch, remote, ahead, behind, superproject_path)
            });
            let commits = scope.spawn(|| parse_commits(root_path));
            let files = scope.spawn(|| {
                let incoming = incoming_changed_paths(root_path);
                let mut files = parse_changed_files(root_path);
                files.iter_mut().for_each(|file| {
                    file.incoming = incoming.contains(&file.path);
                });
                files
            });
            let structure =
                scope.spawn(|| (parse_worktrees(root_path), parse_submodules(root_path)));
            let refs = scope.spawn(|| {
                (
                    parse_branches(root_path),
                    parse_remote_branches(root_path),
                    parse_branch_tracking(root_path),
                    parse_tags(root_path),
                )
            });
            let stashes = scope.spawn(|| parse_stashes(root_path));
            let commit_template = scope.spawn(|| parse_commit_template(root_path));
            (
                metadata.join().expect("repository metadata task panicked"),
                commits.join().expect("commit loading task panicked"),
                files.join().expect("working tree task panicked"),
                structure
                    .join()
                    .expect("repository structure task panicked"),
                refs.join().expect("repository refs task panicked"),
                stashes.join().expect("stash loading task panicked"),
                commit_template
                    .join()
                    .expect("commit template task panicked"),
            )
        });
    let (branch, remote_text, ahead, behind, superproject_path) = metadata;
    let (worktrees, submodules) = structure;
    let (branches, remote_branches, branch_tracking, tags) = refs;

    Ok(RepositorySnapshot {
        name,
        path: root_text.to_string(),
        superproject_path,
        branch,
        remote: (!remote_text.is_empty()).then_some(remote_text),
        ahead,
        behind,
        worktree_count: worktrees.len(),
        submodule_count: submodules.len(),
        commits,
        files,
        worktrees,
        submodules,
        branches,
        remote_branches,
        branch_tracking,
        tags,
        stashes,
        commit_template,
        undo_commit_message: None,
        operation: repository_operation(root_path),
    })
}

pub fn switch_repository_branch(repository_path: &str, branch: &str) -> Result<(), String> {
    let root = repository_root(repository_path)?;
    let branch = branch.trim();
    if branch.is_empty() || !parse_branches(&root).iter().any(|item| item == branch) {
        return Err(format!("分支不存在：{branch}"));
    }

    let locals = parse_local_branches(&root);
    if locals.iter().any(|item| item == branch) {
        return git_output_owned(&root, &["switch".into(), "--".into(), branch.into()]).map(|_| ());
    }

    let local_name = branch
        .split_once('/')
        .map(|(_, value)| value)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| format!("无法从远程分支创建本地分支：{branch}"))?;
    if locals.iter().any(|item| item == local_name) {
        git_output_owned(
            &root,
            &["switch".into(), "--".into(), local_name.to_string()],
        )
        .map(|_| ())
    } else {
        git_output_owned(
            &root,
            &[
                "switch".into(),
                "--track".into(),
                "-c".into(),
                local_name.to_string(),
                branch.into(),
            ],
        )
        .map(|_| ())
    }
}

pub fn create_repository_branch(repository_path: &str, branch: &str) -> Result<(), String> {
    let root = repository_root(repository_path)?;
    let branch = branch.trim();
    if branch.is_empty() {
        return Err("分支名不能为空".into());
    }
    git_output_owned(
        &root,
        &["check-ref-format".into(), "--branch".into(), branch.into()],
    )?;
    if parse_branches(&root).iter().any(|item| item == branch) {
        return Err(format!("分支已存在：{branch}"));
    }
    git_output_owned(
        &root,
        &["branch".into(), "--".into(), branch.into(), "HEAD".into()],
    )
    .map(|_| ())
}

fn ensure_clean_worktree(root: &Path, action: &str) -> Result<(), String> {
    if git_output(root, &["status", "--porcelain"])?
        .trim()
        .is_empty()
    {
        Ok(())
    } else {
        Err(format!(
            "工作区存在未提交变更，请先提交或 Stash 后再{action}"
        ))
    }
}

pub fn merge_repository_reference(repository_path: &str, reference: &str) -> Result<(), String> {
    let root = repository_root(repository_path)?;
    let reference = reference.trim();
    resolve_commit(&root, reference)?;
    let merge_result = git_output_owned(
        &root,
        &[
            "merge".into(),
            "--no-edit".into(),
            "--".into(),
            reference.into(),
        ],
    );
    // Git treats submodule pointers as unmerged index entries. Resolve only
    // those entries automatically; regular file conflicts remain for review.
    let gitlink_result = resolve_gitlink_conflicts_local(repository_path);
    match (merge_result, gitlink_result) {
        (Ok(_), Ok(_)) => Ok(()),
        (Err(error), Ok(_)) => Err(error),
        (Ok(_), Err(error)) | (Err(_), Err(error)) => Err(error),
    }
}

pub fn cherry_pick_repository_commit(repository_path: &str, commit: &str) -> Result<(), String> {
    let root = repository_root(repository_path)?;
    let commit = resolve_commit(&root, commit.trim())?;
    ensure_clean_worktree(&root, "Cherry-pick")?;
    git_output_owned(&root, &["cherry-pick".into(), "--".into(), commit]).map(|_| ())
}

pub fn pull_repository_branch(repository_path: &str, branch: &str) -> Result<(), String> {
    let root = repository_root(repository_path)?;
    let branch = branch.trim();
    if branch.is_empty() || !parse_branches(&root).iter().any(|item| item == branch) {
        return Err(format!("分支不存在：{branch}"));
    }

    let locals = parse_local_branches(&root);
    if !locals.iter().any(|item| item == branch) {
        let (remote, remote_branch) = branch
            .split_once('/')
            .filter(|(remote, remote_branch)| !remote.is_empty() && !remote_branch.is_empty())
            .ok_or_else(|| format!("无法识别远程分支：{branch}"))?;
        return git_output_owned(
            &root,
            &["fetch".into(), remote.into(), remote_branch.into()],
        )
        .map(|_| ());
    }

    let ref_name = format!("refs/heads/{branch}");
    let upstream = git_output_owned(
        &root,
        &[
            "for-each-ref".into(),
            "--format=%(upstream:short)".into(),
            ref_name,
        ],
    )?
    .trim()
    .to_string();
    let (remote, remote_branch) = upstream
        .split_once('/')
        .filter(|(remote, remote_branch)| !remote.is_empty() && !remote_branch.is_empty())
        .ok_or_else(|| format!("分支 {branch} 尚未配置上游分支"))?;
    git_output_owned(
        &root,
        &["fetch".into(), remote.into(), remote_branch.into()],
    )?;

    let current = optional_git_output(&root, &["branch", "--show-current"])
        .trim()
        .to_string();
    if current == branch {
        let incoming = incoming_changed_paths(&root);
        let stash_paths = stashable_changed_paths(&root);
        let has_overlap = stash_paths.iter().any(|path| incoming.contains(path));
        let mut auto_stashed = false;
        if has_overlap {
            let stash_count =
                optional_git_output(&root, &["reflog", "show", "--format=%H", "refs/stash"])
                    .lines()
                    .count();
            let args = vec![
                "stash".into(),
                "push".into(),
                "--include-untracked".into(),
                "-m".into(),
                format!("Branchline 自动 Stash：拉取 {branch}"),
            ];
            with_gitlinks_excluded_from_stash(&root, || git_output_owned(&root, &args))?;
            auto_stashed =
                optional_git_output(&root, &["reflog", "show", "--format=%H", "refs/stash"])
                    .lines()
                    .count()
                    > stash_count;
            if !auto_stashed {
                return Err("检测到本地修改，但 Git 未能创建自动 Stash；为避免覆盖文件，拉取已取消。请手动处理 Submodule 或特殊工作区变更后重试。".into());
            }
        }
        let merge_result = git_output_owned(
            &root,
            &["merge".into(), "--ff-only".into(), "--".into(), upstream],
        );
        if let Err(error) = merge_result {
            if auto_stashed {
                return match git_output_owned(
                    &root,
                    &[
                        "stash".into(),
                        "pop".into(),
                        "--index".into(),
                        "stash@{0}".into(),
                    ],
                ) {
                    Ok(_) => Err(format!("{error}\n本地修改已从自动 Stash 恢复。")),
                    Err(restore_error) => Err(format!(
                        "{error}\n恢复自动 Stash 失败：{restore_error}\n本地修改仍保留在 stash@{{0}}。"
                    )),
                };
            }
            return Err(error);
        }
        if auto_stashed {
            git_output_owned(
                &root,
                &[
                    "stash".into(),
                    "pop".into(),
                    "--index".into(),
                    "stash@{0}".into(),
                ],
            )
            .map_err(|error| format!(
                "拉取已完成，但恢复本地修改时产生冲突或失败：{error}\n自动 Stash 已保留在 stash@{{0}}，请解决工作区冲突后再处理该 Stash。"
            ))?;
        }
        return Ok(());
    }
    if !git_success(&root, &["merge-base", "--is-ancestor", branch, &upstream]) {
        return Err(format!(
            "分支 {branch} 包含尚未推送的提交，无法在后台快进；请先切换到该分支"
        ));
    }
    git_output_owned(
        &root,
        &[
            "branch".into(),
            "-f".into(),
            "--".into(),
            branch.into(),
            upstream,
        ],
    )
    .map(|_| ())
}

pub fn push_repository(repository_path: &str) -> Result<(), String> {
    let root = repository_root(repository_path)?;
    let branch = git_output(&root, &["branch", "--show-current"])?
        .trim()
        .to_string();
    if branch.is_empty() {
        return Err("当前处于 Detached HEAD，无法直接推送".into());
    }
    let ref_name = format!("refs/heads/{branch}");
    let upstream = git_output_owned(
        &root,
        &[
            "for-each-ref".into(),
            "--format=%(upstream:short)".into(),
            ref_name,
        ],
    )?
    .trim()
    .to_string();
    if upstream.is_empty() {
        if optional_git_output(&root, &["remote", "get-url", "origin"])
            .trim()
            .is_empty()
        {
            return Err("当前仓库没有 origin 远程仓库".into());
        }
        return git_output_owned(
            &root,
            &[
                "push".into(),
                "--set-upstream".into(),
                "origin".into(),
                branch,
            ],
        )
        .map(|_| ());
    }
    git_output(&root, &["push"]).map(|_| ())
}

pub fn reset_repository_to_commit(repository_path: &str, commit: &str) -> Result<(), String> {
    let root = repository_root(repository_path)?;
    let commit = resolve_commit(&root, commit.trim())?;
    if repository_operation(&root).is_some() {
        return Err("当前存在未完成的 Git 操作，请先完成或中止后再回退".into());
    }
    git_output_owned(&root, &["reset".into(), "--hard".into(), commit]).map(|_| ())
}

pub fn undo_last_commit(repository_path: &str) -> Result<String, String> {
    let root = repository_root(repository_path)?;
    ensure_clean_worktree(&root, "撤回上一次提交")?;
    let message = git_output(&root, &["show", "-s", "--format=%B", "HEAD"])?;
    let parent = git_output(&root, &["rev-parse", "HEAD^"])
        .map_err(|_| "当前提交没有父提交，无法撤回".to_string())?
        .trim()
        .to_string();
    git_output_owned(&root, &["reset".into(), "--mixed".into(), parent]).map(|_| message)
}

pub fn rebase_repository_onto(repository_path: &str, commit: &str) -> Result<(), String> {
    let root = repository_root(repository_path)?;
    let commit = resolve_commit(&root, commit.trim())?;
    ensure_clean_worktree(&root, "变基")?;
    git_output_owned(&root, &["rebase".into(), commit]).map(|_| ())
}

pub fn create_repository_tag(repository_path: &str, tag: &str, commit: &str) -> Result<(), String> {
    let root = repository_root(repository_path)?;
    let tag = tag.trim();
    if tag.is_empty() {
        return Err("标签名称不能为空".into());
    }
    git_output_owned(
        &root,
        &["check-ref-format".into(), format!("refs/tags/{tag}")],
    )?;
    if git_success(
        &root,
        &[
            "show-ref",
            "--verify",
            "--quiet",
            &format!("refs/tags/{tag}"),
        ],
    ) {
        return Err(format!("标签已存在：{tag}"));
    }
    let commit = resolve_commit(&root, commit.trim())?;
    git_output_owned(&root, &["tag".into(), tag.into(), commit]).map(|_| ())
}

pub fn delete_repository_branch(repository_path: &str, branch: &str) -> Result<(), String> {
    let root = repository_root(repository_path)?;
    let branch = branch.trim();
    if branch.is_empty() || !parse_branches(&root).iter().any(|item| item == branch) {
        return Err(format!("分支不存在：{branch}"));
    }
    let locals = parse_local_branches(&root);
    if locals.iter().any(|item| item == branch) {
        let current = optional_git_output(&root, &["branch", "--show-current"])
            .trim()
            .to_string();
        if current == branch {
            return Err(format!("不能删除当前分支：{branch}"));
        }
        return git_output_owned(
            &root,
            &["branch".into(), "-D".into(), "--".into(), branch.into()],
        )
        .map(|_| ());
    }
    let (remote, remote_branch) = branch
        .split_once('/')
        .filter(|(remote, remote_branch)| !remote.is_empty() && !remote_branch.is_empty())
        .ok_or_else(|| format!("无法识别远程分支：{branch}"))?;
    git_output_owned(
        &root,
        &[
            "push".into(),
            "--delete".into(),
            remote.into(),
            remote_branch.into(),
        ],
    )
    .map(|_| ())
}

fn parse_comparison_files(path: &Path, range: &str) -> Result<Vec<RepositoryFile>, String> {
    let numstat = git_output_owned(
        path,
        &[
            "-c".into(),
            "core.quotepath=false".into(),
            "diff".into(),
            "--numstat".into(),
            range.into(),
            "--".into(),
        ],
    )?;
    let status = git_output_owned(
        path,
        &[
            "-c".into(),
            "core.quotepath=false".into(),
            "diff".into(),
            "--name-status".into(),
            range.into(),
            "--".into(),
        ],
    )?;
    Ok(parse_repository_files(&numstat, &status))
}

fn parse_repository_files(numstat: &str, status: &str) -> Vec<RepositoryFile> {
    let mut stats = HashMap::new();
    for line in numstat.lines() {
        let columns: Vec<&str> = line.splitn(3, '\t').collect();
        if columns.len() == 3 {
            stats.insert(
                columns[2].to_string(),
                (
                    columns[0].parse::<usize>().unwrap_or(0),
                    columns[1].parse::<usize>().unwrap_or(0),
                ),
            );
        }
    }
    status
        .lines()
        .filter_map(|line| {
            let columns: Vec<&str> = line.split('\t').collect();
            if columns.len() < 2 {
                return None;
            }
            let status = columns[0];
            let file_path = if status.starts_with('R') || status.starts_with('C') {
                columns.get(2).copied().unwrap_or(columns[1])
            } else {
                columns[1]
            };
            let kind = status.chars().next().unwrap_or('M').to_string();
            let (add, del) = stats.get(file_path).copied().unwrap_or((0, 0));
            Some(RepositoryFile {
                path: file_path.to_string(),
                r#type: kind,
                add,
                del,
                staged: false,
                unstaged: false,
                incoming: false,
            })
        })
        .collect()
}

pub fn compare_repository_refs(
    repository_path: &str,
    base: &str,
    target: &str,
) -> Result<RepositoryComparison, String> {
    let root = repository_root(repository_path)?;
    let base_hash = resolve_commit(&root, base)?;
    let target_hash = resolve_commit(&root, target)?;
    let commit_range = format!("{base_hash}...{target_hash}");
    let diff_range = format!("{base_hash}..{target_hash}");
    let counts = git_output_owned(
        &root,
        &[
            "rev-list".into(),
            "--left-right".into(),
            "--count".into(),
            commit_range,
        ],
    )?;
    let values: Vec<usize> = counts
        .split_whitespace()
        .map(|value| value.parse().unwrap_or(0))
        .collect();
    Ok(RepositoryComparison {
        base: base.to_string(),
        target: target.to_string(),
        ahead: values.get(1).copied().unwrap_or(0),
        behind: values.first().copied().unwrap_or(0),
        files: parse_comparison_files(&root, &diff_range)?,
    })
}

pub fn load_merge_queue(repository_path: &str) -> Result<MergeQueueSnapshot, String> {
    let root = repository_root(repository_path)?;
    let current_branch = git_output(&root, &["branch", "--show-current"])?
        .trim()
        .to_string();
    if current_branch.is_empty() {
        return Err("Detached HEAD 状态下无法计算合并队列".into());
    }

    let mut candidates = Vec::new();
    for branch in parse_local_branches(&root) {
        if branch == current_branch {
            continue;
        }
        let range = format!("{current_branch}...{branch}");
        let counts = git_output_owned(
            &root,
            &[
                "rev-list".into(),
                "--left-right".into(),
                "--count".into(),
                range,
            ],
        )?;
        let values: Vec<usize> = counts
            .split_whitespace()
            .map(|value| value.parse().unwrap_or(0))
            .collect();
        candidates.push(MergeCandidate {
            branch: branch.clone(),
            ahead: values.get(1).copied().unwrap_or(0),
            behind: values.first().copied().unwrap_or(0),
            merged: git_success(
                &root,
                &["merge-base", "--is-ancestor", &branch, &current_branch],
            ),
        });
    }
    candidates.sort_by(|left, right| {
        right
            .ahead
            .cmp(&left.ahead)
            .then_with(|| left.branch.cmp(&right.branch))
    });

    let conflicts = optional_git_output(
        &root,
        &[
            "-c",
            "core.quotepath=false",
            "diff",
            "--name-only",
            "--diff-filter=U",
        ],
    )
    .lines()
    .map(str::trim)
    .filter(|path| !path.is_empty())
    .map(ToString::to_string)
    .collect();
    Ok(MergeQueueSnapshot {
        current_branch,
        conflicts,
        candidates,
    })
}

fn validated_stash_reference(reference: &str) -> Result<&str, String> {
    let reference = reference.trim();
    let index = reference
        .strip_prefix("stash@{")
        .and_then(|value| value.strip_suffix('}'))
        .filter(|value| !value.is_empty() && value.bytes().all(|byte| byte.is_ascii_digit()));
    index
        .map(|_| reference)
        .ok_or_else(|| "无效的 Stash 引用".to_string())
}

pub fn create_repository_stash(
    repository_path: &str,
    message: &str,
    include_untracked: bool,
) -> Result<(), String> {
    let root = repository_root(repository_path)?;
    let stash_paths = stashable_changed_paths(&root);
    if stash_paths.is_empty() {
        return Err("除 Gitlink 外没有可 Stash 的变更".into());
    }
    let mut args = vec!["stash".to_string(), "push".to_string()];
    if include_untracked {
        args.push("--include-untracked".into());
    }
    if !message.trim().is_empty() {
        args.push("-m".into());
        args.push(message.trim().to_string());
    }
    with_gitlinks_excluded_from_stash(&root, || git_output_owned(&root, &args)).map(|_| ())
}

pub fn create_scoped_repository_stash(
    repository_path: &str,
    scope: &str,
    message: &str,
) -> Result<(), String> {
    let root = repository_root(repository_path)?;
    let gitlinks = gitlink_paths(&root);
    let stash_paths: Vec<String> = parse_changed_files(&root)
        .into_iter()
        .filter(|file| !gitlinks.contains(&file.path))
        .filter(|file| match scope.trim() {
            "staged" => file.staged,
            "unstaged" => file.unstaged,
            _ => false,
        })
        .map(|file| file.path)
        .collect();
    let mut args = vec!["stash".to_string(), "push".to_string()];
    match scope.trim() {
        "staged" => {
            if stash_paths.is_empty() {
                return Err("除 Gitlink 外没有可 Stash 的已暂存变更".into());
            }
            args.push("--staged".into());
        }
        "unstaged" => {
            if stash_paths.is_empty() {
                return Err("除 Gitlink 外没有可 Stash 的未暂存变更".into());
            }
            args.push("--keep-index".into());
            args.push("--include-untracked".into());
        }
        _ => return Err("不支持的 Stash 范围".into()),
    }
    if !message.trim().is_empty() {
        args.push("-m".into());
        args.push(message.trim().to_string());
    }
    with_gitlinks_excluded_from_stash(&root, || git_output_owned(&root, &args)).map(|_| ())
}

pub fn apply_repository_stash(
    repository_path: &str,
    reference: &str,
    pop: bool,
) -> Result<(), String> {
    let root = repository_root(repository_path)?;
    let reference = validated_stash_reference(reference)?;
    git_output_owned(
        &root,
        &[
            "stash".into(),
            if pop { "pop" } else { "apply" }.into(),
            "--index".into(),
            reference.into(),
        ],
    )
    .map(|_| ())
}

pub fn drop_repository_stash(repository_path: &str, reference: &str) -> Result<(), String> {
    let root = repository_root(repository_path)?;
    let reference = validated_stash_reference(reference)?;
    git_output_owned(&root, &["stash".into(), "drop".into(), reference.into()]).map(|_| ())
}

fn files_from_diff_outputs(numstat: &str, status: &str) -> Vec<RepositoryFile> {
    let mut stats: HashMap<String, (usize, usize)> = HashMap::new();
    for line in numstat.lines() {
        let columns: Vec<&str> = line.splitn(3, '\t').collect();
        if columns.len() == 3 {
            stats.insert(
                columns[2].to_string(),
                (
                    columns[0].parse::<usize>().unwrap_or(0),
                    columns[1].parse::<usize>().unwrap_or(0),
                ),
            );
        }
    }
    status
        .lines()
        .filter_map(|line| {
            let columns: Vec<&str> = line.split('\t').collect();
            if columns.len() < 2 {
                return None;
            }
            let status = columns[0];
            let file_path = if status.starts_with('R') || status.starts_with('C') {
                columns.get(2).copied().unwrap_or(columns[1])
            } else {
                columns[1]
            };
            let (add, del) = stats.get(file_path).copied().unwrap_or((0, 0));
            Some(RepositoryFile {
                path: file_path.to_string(),
                r#type: status.chars().next().unwrap_or('M').to_string(),
                add,
                del,
                staged: false,
                unstaged: false,
                incoming: false,
            })
        })
        .collect()
}

pub fn load_stash_files(
    repository_path: &str,
    reference: &str,
) -> Result<Vec<RepositoryFile>, String> {
    let root = repository_root(repository_path)?;
    let reference = validated_stash_reference(reference)?;
    resolve_commit(&root, reference)?;
    let base = format!("{reference}^1");
    let tracked_numstat = git_output_owned(
        &root,
        &[
            "-c".into(),
            "core.quotepath=false".into(),
            "diff".into(),
            "--numstat".into(),
            base.clone(),
            reference.into(),
            "--".into(),
        ],
    )?;
    let tracked_status = git_output_owned(
        &root,
        &[
            "-c".into(),
            "core.quotepath=false".into(),
            "diff".into(),
            "--name-status".into(),
            base,
            reference.into(),
            "--".into(),
        ],
    )?;
    let mut files = files_from_diff_outputs(&tracked_numstat, &tracked_status);

    let untracked = format!("{reference}^3");
    if resolve_commit(&root, &untracked).is_ok() {
        let untracked_numstat = git_output_owned(
            &root,
            &[
                "-c".into(),
                "core.quotepath=false".into(),
                "show".into(),
                "--format=".into(),
                "--numstat".into(),
                untracked.clone(),
                "--".into(),
            ],
        )?;
        let untracked_status = git_output_owned(
            &root,
            &[
                "-c".into(),
                "core.quotepath=false".into(),
                "show".into(),
                "--format=".into(),
                "--name-status".into(),
                untracked,
                "--".into(),
            ],
        )?;
        for file in files_from_diff_outputs(&untracked_numstat, &untracked_status) {
            if !files.iter().any(|existing| existing.path == file.path) {
                files.push(file);
            }
        }
    }
    Ok(files)
}

pub fn load_stash_file_diff(
    repository_path: &str,
    reference: &str,
    file_path: &str,
) -> Result<Vec<DiffLine>, String> {
    let root = repository_root(repository_path)?;
    let reference = validated_stash_reference(reference)?;
    let file_path = validated_file_path(file_path)?;
    resolve_commit(&root, reference)?;
    let base = format!("{reference}^1");
    let tracked = git_output_owned(
        &root,
        &[
            "-c".into(),
            "core.quotepath=false".into(),
            "diff".into(),
            "--no-color".into(),
            "--unified=100000".into(),
            base,
            reference.into(),
            "--".into(),
            file_path.clone(),
        ],
    )?;
    let rows = parse_diff_text(&tracked);
    if !rows.is_empty() {
        return Ok(rows);
    }

    let untracked = format!("{reference}^3");
    if resolve_commit(&root, &untracked).is_err() {
        return Ok(Vec::new());
    }
    let diff = git_output_owned(
        &root,
        &[
            "-c".into(),
            "core.quotepath=false".into(),
            "show".into(),
            "--format=".into(),
            "--no-color".into(),
            "--unified=100000".into(),
            untracked,
            "--".into(),
            file_path,
        ],
    )?;
    Ok(parse_diff_text(&diff))
}

fn validated_file_args(file_paths: &[String]) -> Result<Vec<String>, String> {
    if file_paths.is_empty() {
        return Err("没有选择文件".into());
    }
    for file_path in file_paths {
        let path = Path::new(file_path);
        if path.is_absolute()
            || path
                .components()
                .any(|part| matches!(part, std::path::Component::ParentDir))
        {
            return Err(format!("文件路径超出仓库范围：{file_path}"));
        }
    }
    Ok(file_paths.to_vec())
}

fn validated_file_path(file_path: &str) -> Result<String, String> {
    validated_file_args(&[file_path.to_string()]).map(|mut values| values.remove(0))
}

pub fn stage_files(
    repository_path: &str,
    file_paths: &[String],
    force: bool,
) -> Result<Vec<RepositoryFile>, String> {
    let root = repository_root(repository_path)?;
    let file_paths = validated_file_args(file_paths)?;
    for file_path in &file_paths {
        if !unresolved_paths(&root).iter().any(|path| path == file_path) {
            continue;
        }
        let target = repository_file_target(&root, file_path)?;
        if !force
            && std::fs::read_to_string(&target)
                .ok()
                .is_some_and(|content| has_conflict_markers(&content))
        {
            return Err(format!("请先处理文件中的全部冲突块：{file_path}"));
        }
    }
    let mut args = vec!["add".to_string(), "--".to_string()];
    args.extend(file_paths);
    git_output_owned(&root, &args)?;
    Ok(parse_changed_files(&root))
}

pub fn stage_patch(repository_path: &str, patch: &str) -> Result<Vec<RepositoryFile>, String> {
    let root = repository_root(repository_path)?;
    let mut patch = patch.trim_start_matches('\u{feff}').to_string();
    if patch.trim().is_empty() {
        return Err("没有选择要暂存的修改".into());
    }
    if patch.contains("new file mode 100644") {
        if let Some(path) = patch
            .lines()
            .find_map(|line| line.strip_prefix("+++ b/"))
        {
            if git_success(&root, &["ls-files", "--error-unmatch", "--", path]) {
                patch = patch
                    .replace("new file mode 100644\n", "")
                    .replace("--- /dev/null\n", &format!("--- a/{path}\n"));
            }
        }
    }
    let mut file_count = 0;
    for line in patch.lines() {
        let path = line
            .strip_prefix("+++ b/")
            .or_else(|| line.strip_prefix("--- a/"));
        if let Some(path) = path {
            validated_file_path(path)?;
            file_count += 1;
        }
    }
    if file_count == 0 {
        return Err("暂存 patch 缺少有效文件路径".into());
    }
    git_apply_cached(&root, &patch)?;
    Ok(parse_changed_files(&root))
}

pub fn restore_patch(repository_path: &str, patch: &str) -> Result<Vec<RepositoryFile>, String> {
    let root = repository_root(repository_path)?;
    let patch = patch.trim_start_matches('\u{feff}');
    if patch.trim().is_empty() {
        return Err("没有选择要还原的修改".into());
    }
    let mut file_path = None;
    for line in patch.lines() {
        if let Some(path) = line.strip_prefix("+++ b/") {
            validated_file_path(path)?;
            file_path = Some(path.to_string());
        } else if let Some(path) = line.strip_prefix("--- a/") {
            validated_file_path(path)?;
            file_path = Some(path.to_string());
        }
    }
    let file_path = file_path.ok_or_else(|| "还原 patch 缺少有效文件路径".to_string())?;
    git_apply_reverse(&root, patch)?;
    let tracked = git_success(&root, &["ls-files", "--error-unmatch", "--", &file_path]);
    if !tracked {
        let target = root.join(&file_path);
        if target.is_file()
            && std::fs::read_to_string(&target)
                .map(|content| content.is_empty())
                .unwrap_or(false)
        {
            let _ = std::fs::remove_file(target);
        }
    }
    Ok(parse_changed_files(&root))
}

pub fn unstage_files(
    repository_path: &str,
    file_paths: &[String],
) -> Result<Vec<RepositoryFile>, String> {
    let root = repository_root(repository_path)?;
    let mut args = vec![
        "restore".to_string(),
        "--staged".to_string(),
        "--".to_string(),
    ];
    args.extend(validated_file_args(file_paths)?);
    if git_output_owned(&root, &args).is_ok() {
        return Ok(parse_changed_files(&root));
    }
    let mut fallback = vec!["reset".to_string(), "HEAD".to_string(), "--".to_string()];
    fallback.extend(file_paths.iter().cloned());
    git_output_owned(&root, &fallback)?;
    Ok(parse_changed_files(&root))
}

pub fn discard_worktree_files(
    repository_path: &str,
    file_paths: &[String],
) -> Result<Vec<RepositoryFile>, String> {
    let root = repository_root(repository_path)?;
    let file_paths = validated_file_args(file_paths)?;
    let mut tracked_args = vec![
        "-c".to_string(),
        "core.quotepath=false".to_string(),
        "ls-files".to_string(),
        "-z".to_string(),
        "--".to_string(),
    ];
    tracked_args.extend(file_paths.iter().cloned());
    let tracked: HashSet<String> = git_output_owned(&root, &tracked_args)?
        .split('\0')
        .filter(|path| !path.is_empty())
        .map(ToString::to_string)
        .collect();
    let (tracked_paths, untracked_paths): (Vec<_>, Vec<_>) = file_paths
        .into_iter()
        .partition(|path| tracked.contains(path));

    if !tracked_paths.is_empty() {
        let mut restore_args = vec![
            "restore".to_string(),
            "--worktree".to_string(),
            "--".to_string(),
        ];
        restore_args.extend(tracked_paths);
        git_output_owned(&root, &restore_args)?;
    }
    if !untracked_paths.is_empty() {
        let mut clean_args = vec![
            "clean".to_string(),
            "-f".to_string(),
            "-d".to_string(),
            "--".to_string(),
        ];
        clean_args.extend(untracked_paths);
        git_output_owned(&root, &clean_args)?;
    }

    Ok(parse_changed_files(&root))
}

pub fn load_commit_stats(
    repository_path: &str,
    commit: &str,
) -> Result<RepositoryCommitStats, String> {
    let root = repository_root(repository_path)?;
    let hash = resolve_commit(&root, commit.trim())?;
    let parent_line = git_output_owned(
        &root,
        &[
            "rev-list".into(),
            "--parents".into(),
            "-n".into(),
            "1".into(),
            hash.clone(),
        ],
    )?;
    let parent = parent_line
        .split_whitespace()
        .nth(1)
        .map(ToString::to_string);
    let output = if let Some(parent) = parent {
        git_output_owned(
            &root,
            &[
                "diff".into(),
                "--numstat".into(),
                "--no-renames".into(),
                parent,
                hash.clone(),
                "--".into(),
            ],
        )?
    } else {
        git_output_owned(
            &root,
            &[
                "show".into(),
                "--format=".into(),
                "--numstat".into(),
                "--no-renames".into(),
                hash.clone(),
                "--".into(),
            ],
        )?
    };
    let mut files = 0usize;
    let mut additions = 0usize;
    let mut deletions = 0usize;
    for line in output.lines() {
        let columns: Vec<&str> = line.splitn(3, '\t').collect();
        if columns.len() != 3 {
            continue;
        }
        files += 1;
        additions += columns[0].parse::<usize>().unwrap_or(0);
        deletions += columns[1].parse::<usize>().unwrap_or(0);
    }
    Ok(RepositoryCommitStats {
        hash,
        files,
        additions,
        deletions,
    })
}

pub fn load_commit_files(
    repository_path: &str,
    commit: &str,
) -> Result<Vec<RepositoryFile>, String> {
    let root = repository_root(repository_path)?;
    let hash = resolve_commit(&root, commit.trim())?;
    let parent_line = git_output_owned(
        &root,
        &[
            "rev-list".into(),
            "--parents".into(),
            "-n".into(),
            "1".into(),
            hash.clone(),
        ],
    )?;
    let parent = parent_line
        .split_whitespace()
        .nth(1)
        .map(ToString::to_string);
    let (numstat, status) = if let Some(parent) = parent {
        (
            git_output_owned(
                &root,
                &[
                    "-c".into(),
                    "core.quotepath=false".into(),
                    "diff".into(),
                    "--numstat".into(),
                    "--find-renames".into(),
                    parent.clone(),
                    hash.clone(),
                    "--".into(),
                ],
            )?,
            git_output_owned(
                &root,
                &[
                    "-c".into(),
                    "core.quotepath=false".into(),
                    "diff".into(),
                    "--name-status".into(),
                    "--find-renames".into(),
                    parent,
                    hash,
                    "--".into(),
                ],
            )?,
        )
    } else {
        (
            git_output_owned(
                &root,
                &[
                    "-c".into(),
                    "core.quotepath=false".into(),
                    "show".into(),
                    "--format=".into(),
                    "--numstat".into(),
                    "--find-renames".into(),
                    hash.clone(),
                    "--".into(),
                ],
            )?,
            git_output_owned(
                &root,
                &[
                    "-c".into(),
                    "core.quotepath=false".into(),
                    "show".into(),
                    "--format=".into(),
                    "--name-status".into(),
                    "--find-renames".into(),
                    hash,
                    "--".into(),
                ],
            )?,
        )
    };
    Ok(parse_repository_files(&numstat, &status))
}

pub fn commit_repository(
    repository_path: &str,
    message: &str,
    amend: bool,
    sign: bool,
) -> Result<(), String> {
    if message.trim().is_empty() {
        return Err("提交信息不能为空".into());
    }
    let root = repository_root(repository_path)?;
    let mut args = vec!["commit".to_string()];
    if amend {
        args.push("--amend".into());
    }
    if sign {
        args.push("-S".into());
    }
    args.push("-m".into());
    args.push(message.to_string());
    git_output_owned(&root, &args).map(|_| ())
}

pub fn fetch_repository(repository_path: &str) -> Result<(), String> {
    let root = repository_root(repository_path)?;
    git_output(&root, &["fetch", "--all", "--prune"]).map(|_| ())
}

fn unresolved_gitlink_paths(root: &Path) -> Result<HashSet<String>, String> {
    let entries = git_output(root, &["ls-files", "-u"])?;
    Ok(entries
        .lines()
        .filter_map(|line| {
            let (metadata, path) = line.split_once('\t')?;
            metadata.starts_with("160000 ").then(|| path.to_string())
        })
        .collect())
}

pub fn resolve_gitlink_conflicts_local(repository_path: &str) -> Result<usize, String> {
    let root = repository_root(repository_path)?;
    let paths = unresolved_gitlink_paths(&root)?;
    for path in &paths {
        git_output_owned(&root, &["add".into(), "--".into(), path.clone()])?;
    }
    Ok(paths.len())
}

fn repository_file_target(root: &Path, file_path: &str) -> Result<PathBuf, String> {
    let file_path = validated_file_path(file_path)?;
    let target = root.join(&file_path);
    let canonical_root =
        std::fs::canonicalize(root).map_err(|error| format!("无法定位仓库：{error}"))?;
    let mut parent = target.clone();
    while !parent.exists() {
        if !parent.pop() {
            return Err(format!("文件路径超出仓库范围：{file_path}"));
        }
    }
    let canonical_parent =
        std::fs::canonicalize(&parent).map_err(|error| format!("无法定位文件路径：{error}"))?;
    if !canonical_parent.starts_with(&canonical_root) {
        return Err(format!("文件路径超出仓库范围：{file_path}"));
    }
    Ok(target)
}

fn conflict_stage_text(root: &Path, stage: usize, file_path: &str) -> (Option<String>, bool) {
    let reference = format!(":{stage}:{file_path}");
    match command_output_bytes(root, ["show", reference.as_str()]) {
        Ok(bytes) => match String::from_utf8(bytes) {
            Ok(value) if !value.contains('\0') => (Some(value), false),
            Ok(_) => (None, true),
            Err(_) => (None, true),
        },
        Err(_) => (None, false),
    }
}

fn has_conflict_markers(content: &str) -> bool {
    content.lines().any(|line| {
        line.starts_with("<<<<<<<") || line.starts_with("=======") || line.starts_with(">>>>>>>")
    })
}

fn write_conflict_result(root: &Path, file_path: &str, content: &str) -> Result<(), String> {
    let target = repository_file_target(root, file_path)?;
    std::fs::write(&target, content.as_bytes())
        .map_err(|error| format!("写入合并结果失败：{error}"))
}

pub fn resolve_conflict_block(
    repository_path: &str,
    file_path: &str,
    block_index: usize,
    strategy: &str,
) -> Result<(), String> {
    let root = repository_root(repository_path)?;
    let file_path = validated_file_path(file_path)?;
    if !unresolved_paths(&root)
        .iter()
        .any(|path| path == &file_path)
    {
        return Err(format!("文件当前没有未解决冲突：{file_path}"));
    }
    if !matches!(strategy, "current" | "incoming" | "both") {
        return Err("未知的冲突块解决方式".into());
    }
    let target = repository_file_target(&root, &file_path)?;
    let content =
        std::fs::read_to_string(&target).map_err(|error| format!("无法读取冲突文件：{error}"))?;
    let lines: Vec<&str> = content.lines().collect();
    let mut blocks = Vec::new();
    let mut cursor = 0;
    while cursor < lines.len() {
        if !lines[cursor].starts_with("<<<<<<<") {
            cursor += 1;
            continue;
        }
        let start = cursor;
        if cursor + 1 >= lines.len() {
            return Err("冲突标记不完整，无法解析冲突块".into());
        }
        let Some(separator_offset) = lines[cursor + 1..]
            .iter()
            .position(|line| line.starts_with("======="))
        else {
            return Err("冲突标记不完整，无法解析冲突块".into());
        };
        let separator = cursor + 1 + separator_offset;
        if separator + 1 >= lines.len() {
            return Err("冲突标记不完整，无法解析冲突块".into());
        }
        let Some(end_offset) = lines[separator + 1..]
            .iter()
            .position(|line| line.starts_with(">>>>>>>"))
        else {
            return Err("冲突标记不完整，无法解析冲突块".into());
        };
        let end = separator + 1 + end_offset;
        blocks.push((start, separator, end));
        cursor = end + 1;
    }
    let Some(&(start, separator, end)) = blocks.get(block_index) else {
        return Err(format!("未找到第 {} 个冲突块", block_index + 1));
    };
    let current = lines[start + 1..separator].join("\n");
    let incoming = lines[separator + 1..end].join("\n");
    let replacement = match strategy {
        "current" => current,
        "incoming" => incoming,
        _ if current.is_empty() => incoming,
        _ if incoming.is_empty() => current,
        _ => format!("{current}\n{incoming}"),
    };
    let mut next = Vec::with_capacity(lines.len());
    next.extend_from_slice(&lines[..start]);
    if !replacement.is_empty() {
        next.extend(replacement.split('\n'));
    }
    next.extend_from_slice(&lines[end + 1..]);
    let mut output = next.join("\n");
    if content.ends_with('\n') {
        output.push('\n');
    }
    write_conflict_result(&root, &file_path, &output)
}

pub fn load_conflict_file(
    repository_path: &str,
    file_path: &str,
) -> Result<ConflictFileContent, String> {
    let root = repository_root(repository_path)?;
    let file_path = validated_file_path(file_path)?;
    if !unresolved_paths(&root)
        .iter()
        .any(|path| path == &file_path)
    {
        return Err(format!("文件当前没有未解决冲突：{file_path}"));
    }
    let (base, base_binary) = conflict_stage_text(&root, 1, &file_path);
    let (current, current_binary) = conflict_stage_text(&root, 2, &file_path);
    let (incoming, incoming_binary) = conflict_stage_text(&root, 3, &file_path);
    let target = repository_file_target(&root, &file_path)?;
    let (result, result_binary) = match std::fs::read(&target) {
        Ok(bytes) => match String::from_utf8(bytes) {
            Ok(value) if !value.contains('\0') => (value, false),
            Ok(_) => (String::new(), true),
            Err(_) => (String::new(), true),
        },
        Err(_) => (String::new(), false),
    };
    let operation = repository_operation(&root);
    let rebase = operation.as_ref().is_some_and(|item| item.kind == "rebase");
    let gitlink = git_output_owned(
        &root,
        &[
            "ls-files".into(),
            "-u".into(),
            "--".into(),
            file_path.clone(),
        ],
    )
    .unwrap_or_default()
    .lines()
    .any(|line| line.starts_with("160000 "));
    Ok(ConflictFileContent {
        path: file_path,
        base,
        current,
        incoming,
        result,
        current_label: if rebase {
            "变基目标（当前）".into()
        } else {
            "当前分支".into()
        },
        incoming_label: if rebase {
            "正在应用的提交".into()
        } else {
            "对方分支".into()
        },
        binary: gitlink || base_binary || current_binary || incoming_binary || result_binary,
        gitlink,
    })
}

pub fn resolve_conflict_file(
    repository_path: &str,
    file_path: &str,
    strategy: &str,
    content: Option<&str>,
) -> Result<(), String> {
    let root = repository_root(repository_path)?;
    let file_path = validated_file_path(file_path)?;
    if !unresolved_paths(&root)
        .iter()
        .any(|path| path == &file_path)
    {
        return Err(format!("文件当前没有未解决冲突：{file_path}"));
    }
    let target = repository_file_target(&root, &file_path)?;
    let gitlink = unresolved_gitlink_paths(&root)?.contains(&file_path);
    match strategy {
        "current" | "incoming" => {
            let side = if strategy == "current" {
                "ours"
            } else {
                "theirs"
            };
            git_output_owned(
                &root,
                &[
                    "checkout".into(),
                    format!("--{side}"),
                    "--".into(),
                    file_path.clone(),
                ],
            )?;
            if gitlink {
                git_output_owned(&root, &["add".into(), "--".into(), file_path.clone()])?;
            }
        }
        "both" => {
            let (current, _) = conflict_stage_text(&root, 2, &file_path);
            let (incoming, _) = conflict_stage_text(&root, 3, &file_path);
            let mut combined = current.unwrap_or_default();
            if let Some(incoming) = incoming.filter(|value| !value.is_empty()) {
                if !combined.is_empty() && !combined.ends_with('\n') {
                    combined.push('\n');
                }
                combined.push_str(&incoming);
            }
            std::fs::write(&target, combined.as_bytes())
                .map_err(|error| format!("写入合并结果失败：{error}"))?;
        }
        "result" => {
            let content = content.ok_or_else(|| "缺少待保存的合并结果".to_string())?;
            write_conflict_result(&root, &file_path, content)?;
        }
        "delete" => {
            git_output_owned(&root, &["rm".into(), "-f".into(), "--".into(), file_path])?;
        }
        _ => return Err("未知的冲突解决方式".into()),
    }
    Ok(())
}

pub fn launch_conflict_mergetool(repository_path: &str, file_path: &str) -> Result<(), String> {
    let root = repository_root(repository_path)?;
    let file_path = validated_file_path(file_path)?;
    if !unresolved_paths(&root)
        .iter()
        .any(|path| path == &file_path)
    {
        return Err(format!("文件当前没有未解决冲突：{file_path}"));
    }
    if optional_git_output(&root, &["config", "--get", "merge.tool"])
        .trim()
        .is_empty()
    {
        return Err("尚未配置 merge.tool，请先在 Git 配置中选择外部合并工具".into());
    }
    git_output_owned(
        &root,
        &[
            "-c".into(),
            "mergetool.prompt=false".into(),
            "mergetool.trustExitCode=true".into(),
            "mergetool".into(),
            "--no-prompt".into(),
            "--".into(),
            file_path,
        ],
    )
    .map(|_| ())
}

pub fn preview_repository_rebase(
    repository_path: &str,
    onto: &str,
) -> Result<RebasePreview, String> {
    let root = repository_root(repository_path)?;
    let onto_hash = resolve_commit(&root, onto.trim())?;
    let branch = git_output(&root, &["branch", "--show-current"])?
        .trim()
        .to_string();
    if branch.is_empty() {
        return Err("Detached HEAD 状态下无法开始变基".into());
    }
    let head = resolve_commit(&root, "HEAD")?;
    let merge_base = git_output_owned(&root, &["merge-base".into(), head, onto_hash.clone()])?
        .trim()
        .to_string();
    let steps = operation_steps(&root, &format!("{onto_hash}..HEAD"), 0)
        .into_iter()
        .map(|mut step| {
            step.status = "pending".into();
            step
        })
        .collect();
    Ok(RebasePreview {
        branch,
        onto: onto_hash.clone(),
        onto_short_hash: onto_hash.chars().take(8).collect(),
        merge_base,
        steps,
    })
}

pub fn continue_repository_operation(repository_path: &str) -> Result<(), String> {
    let root = repository_root(repository_path)?;
    let operation =
        repository_operation(&root).ok_or_else(|| "当前没有正在进行的 Git 操作".to_string())?;
    if !operation.conflicts.is_empty() {
        return Err(format!(
            "仍有 {} 个文件未解决冲突",
            operation.conflicts.len()
        ));
    }
    let args = match operation.kind.as_str() {
        "merge" => vec![
            "-c".into(),
            "core.editor=true".into(),
            "merge".into(),
            "--continue".into(),
        ],
        "rebase" => vec![
            "-c".into(),
            "core.editor=true".into(),
            "rebase".into(),
            "--continue".into(),
        ],
        "cherry-pick" => vec![
            "-c".into(),
            "core.editor=true".into(),
            "cherry-pick".into(),
            "--continue".into(),
        ],
        _ => return Err("当前操作不支持继续".into()),
    };
    git_output_owned(&root, &args).map(|_| ())
}

pub fn skip_repository_operation(repository_path: &str) -> Result<(), String> {
    let root = repository_root(repository_path)?;
    let operation =
        repository_operation(&root).ok_or_else(|| "当前没有正在进行的 Git 操作".to_string())?;
    let command = match operation.kind.as_str() {
        "rebase" => "rebase",
        "cherry-pick" => "cherry-pick",
        _ => return Err("合并操作不能跳过提交".into()),
    };
    git_output_owned(&root, &[command.into(), "--skip".into()]).map(|_| ())
}

pub fn abort_repository_operation(repository_path: &str) -> Result<(), String> {
    let root = repository_root(repository_path)?;
    let operation =
        repository_operation(&root).ok_or_else(|| "当前没有正在进行的 Git 操作".to_string())?;
    let command = match operation.kind.as_str() {
        "merge" => "merge",
        "rebase" => "rebase",
        "cherry-pick" => "cherry-pick",
        _ => return Err("当前冲突不是由可中止的 Git 操作产生".into()),
    };
    git_output_owned(&root, &[command.into(), "--abort".into()]).map(|_| ())
}

fn parse_file_history_entries(output: &str) -> Vec<FileHistoryEntry> {
    output
        .split('\x1e')
        .filter_map(|record| {
            let metadata = record
                .split_once('\x1d')
                .map(|(metadata, _)| metadata)
                .unwrap_or(record);
            let fields: Vec<&str> = metadata.trim().split('\x1f').collect();
            (fields.len() >= 10).then(|| FileHistoryEntry {
                hash: fields[0].to_string(),
                short_hash: fields[0].chars().take(7).collect(),
                parents: fields[1]
                    .split_whitespace()
                    .map(ToString::to_string)
                    .collect(),
                author: fields[2].to_string(),
                email: fields[3].to_string(),
                time: fields[4].to_string(),
                committer: fields[5].to_string(),
                committer_email: fields[6].to_string(),
                commit_time: fields[7].to_string(),
                title: fields[8].to_string(),
                message: fields[9].trim().to_string(),
            })
        })
        .collect()
}

pub fn load_file_history(
    repository_path: &str,
    file_path: &str,
) -> Result<Vec<FileHistoryEntry>, String> {
    let root = repository_root(repository_path)?;
    let file_path = validated_file_path(file_path)?;
    let args = vec![
        "-c".into(),
        "core.quotepath=false".into(),
        "log".into(),
        "--all".into(),
        "--date-order".into(),
        "--follow".into(),
        "--max-count=200".into(),
        "--date=iso-strict".into(),
        "--pretty=format:%x1e%H%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%cn%x1f%ce%x1f%cI%x1f%s%x1f%B%x1d"
            .into(),
        "--".into(),
        file_path,
    ];
    Ok(parse_file_history_entries(&git_output_owned(&root, &args)?))
}

pub fn load_line_history(
    repository_path: &str,
    file_path: &str,
    line: usize,
    revision: Option<&str>,
) -> Result<Vec<FileHistoryEntry>, String> {
    if line == 0 || line > 10_000_000 {
        return Err("行号必须在 1 到 10000000 之间".into());
    }
    let root = repository_root(repository_path)?;
    let file_path = validated_file_path(file_path)?;
    let revision = resolve_commit(&root, revision.unwrap_or("HEAD").trim())?;
    let line_range = format!("{line},{line}:{file_path}");
    let args = vec![
        "-c".into(),
        "core.quotepath=false".into(),
        "log".into(),
        "--max-count=200".into(),
        "--date=iso-strict".into(),
        "--no-color".into(),
        "--pretty=format:%x1e%H%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%cn%x1f%ce%x1f%cI%x1f%s%x1f%B%x1d"
            .into(),
        revision,
        "-L".into(),
        line_range,
    ];
    Ok(parse_file_history_entries(&git_output_owned(&root, &args)?))
}

pub fn load_file_commit_diff(
    repository_path: &str,
    commit: &str,
    file_path: &str,
) -> Result<Vec<DiffLine>, String> {
    let root = repository_root(repository_path)?;
    let file_path = validated_file_path(file_path)?;
    let commit = resolve_commit(&root, commit.trim())?;
    let parent_line = git_output_owned(
        &root,
        &[
            "rev-list".into(),
            "--parents".into(),
            "-n".into(),
            "1".into(),
            commit.clone(),
        ],
    )?;
    let parent = parent_line
        .split_whitespace()
        .nth(1)
        .map(ToString::to_string);
    let diff = if let Some(parent) = parent {
        git_output_owned(
            &root,
            &[
                "-c".into(),
                "core.quotepath=false".into(),
                "diff".into(),
                "--no-color".into(),
                "--unified=100000".into(),
                parent,
                commit,
                "--".into(),
                file_path,
            ],
        )?
    } else {
        git_output_owned(
            &root,
            &[
                "-c".into(),
                "core.quotepath=false".into(),
                "show".into(),
                "--format=".into(),
                "--no-color".into(),
                "--unified=100000".into(),
                commit,
                "--".into(),
                file_path,
            ],
        )?
    };
    Ok(parse_diff_text(&diff))
}

pub fn load_file_blame(
    repository_path: &str,
    file_path: &str,
    revision: Option<&str>,
) -> Result<Vec<BlameLine>, String> {
    let root = repository_root(repository_path)?;
    let file_path = validated_file_path(file_path)?;
    let mut args = vec![
        "-c".into(),
        "core.quotepath=false".into(),
        "blame".into(),
        "--line-porcelain".into(),
    ];
    if let Some(revision) = revision.filter(|value| !value.trim().is_empty()) {
        args.push(resolve_commit(&root, revision.trim())?);
    }
    args.extend(["--".into(), file_path]);
    let output = git_output_owned(&root, &args)?;
    let mut result = Vec::new();
    let mut lines = output.lines();
    while let Some(header) = lines.next() {
        let fields: Vec<&str> = header.split_whitespace().collect();
        if fields.len() < 3 || fields[0].len() < 7 {
            continue;
        }
        let hash = fields[0].to_string();
        let original_line = fields[1].parse().unwrap_or(0);
        let line = fields[2].parse().unwrap_or(0);
        let mut author = String::new();
        let mut email = String::new();
        let mut time = String::new();
        let mut content = String::new();
        for metadata in lines.by_ref() {
            if let Some(value) = metadata.strip_prefix("author ") {
                author = value.to_string();
            } else if let Some(value) = metadata.strip_prefix("author-mail ") {
                email = value.trim_matches(&['<', '>'][..]).to_string();
            } else if let Some(value) = metadata.strip_prefix("author-time ") {
                time = value.to_string();
            } else if let Some(value) = metadata.strip_prefix('\t') {
                content = value.to_string();
                break;
            }
        }
        result.push(BlameLine {
            line,
            original_line,
            short_hash: hash.chars().take(7).collect(),
            hash,
            author,
            email,
            time,
            content,
        });
    }
    Ok(result)
}

pub fn preview_branch_prefix(repository_path: &str, prefix: &str) -> Result<Vec<String>, String> {
    let root = repository_root(repository_path)?;
    let prefix = prefix.trim().trim_end_matches('/');
    if prefix.is_empty() {
        return Err("分支前缀不能为空".into());
    }
    let mut branches: Vec<String> = optional_git_output(
        &root,
        &["for-each-ref", "--format=%(refname:short)", "refs/heads"],
    )
    .lines()
    .map(str::trim)
    .filter(|branch| *branch == prefix || branch.starts_with(&format!("{prefix}/")))
    .map(ToString::to_string)
    .collect();
    branches.sort();
    Ok(branches)
}

pub fn delete_branch_prefix(
    repository_path: &str,
    prefix: &str,
    expected_branches: &[String],
) -> Result<(), String> {
    let root = repository_root(repository_path)?;
    let mut actual = preview_branch_prefix(repository_path, prefix)?;
    let mut expected = expected_branches.to_vec();
    actual.sort();
    expected.sort();
    if actual.is_empty() {
        return Err("该前缀下没有本地分支".into());
    }
    if actual != expected {
        return Err("分支列表已变化，请重新确认删除范围".into());
    }
    let current = optional_git_output(&root, &["branch", "--show-current"])
        .trim()
        .to_string();
    if actual.iter().any(|branch| branch == &current) {
        return Err(format!("不能删除当前分支：{current}"));
    }
    let mut args = vec!["branch".into(), "-D".into(), "--".into()];
    args.extend(actual);
    git_output_owned(&root, &args).map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    struct TestRepository(PathBuf);

    impl Drop for TestRepository {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn test_repository() -> TestRepository {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock")
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "branchline-git-test-{}-{unique}",
            std::process::id()
        ));
        fs::create_dir_all(&path).expect("create test repository");
        git_output(&path, &["init"]).expect("git init");
        git_output(&path, &["config", "user.name", "Branchline Test"]).expect("git user name");
        git_output(&path, &["config", "user.email", "branchline@example.com"])
            .expect("git user email");
        fs::write(path.join("README.md"), "first\n").expect("write initial file");
        git_output(&path, &["add", "README.md"]).expect("git add");
        git_output(&path, &["commit", "-m", "初始提交"]).expect("git commit");
        TestRepository(path)
    }

    #[test]
    fn repository_state_token_changes_with_worktree_and_history() {
        let repository = test_repository();
        let clean = repository_state_token(&repository.0.to_string_lossy())
            .expect("read clean repository token");

        fs::write(repository.0.join("README.md"), "first\nsecond\n")
            .expect("modify tracked file");
        let modified = repository_state_token(&repository.0.to_string_lossy())
            .expect("read modified repository token");
        assert_ne!(modified, clean);

        git_output(&repository.0, &["add", "README.md"]).expect("stage update");
        git_output(&repository.0, &["commit", "-m", "second commit"])
            .expect("commit update");
        let committed = repository_state_token(&repository.0.to_string_lossy())
            .expect("read committed repository token");
        assert_ne!(committed, modified);
    }

    #[test]
    fn undoes_last_commit_while_preserving_changes_as_unstaged() {
        let repository = test_repository();
        let path = repository.0.to_string_lossy().to_string();
        fs::write(repository.0.join("README.md"), "second\n").expect("write second commit");
        git_output(&repository.0, &["add", "README.md"]).expect("stage second commit");
        let parent = git_output(&repository.0, &["rev-parse", "HEAD"])
            .expect("read parent commit")
            .trim()
            .to_string();
        git_output(&repository.0, &["commit", "-m", "第二次提交"])
            .expect("create second commit");

        let message = undo_last_commit(&path).expect("undo latest commit");

        assert_eq!(message.trim(), "第二次提交");
        assert_eq!(
            git_output(&repository.0, &["rev-parse", "HEAD"])
                .expect("read restored head")
                .trim(),
            parent
        );
        assert_eq!(
            fs::read_to_string(repository.0.join("README.md")).expect("read preserved changes"),
            "second\n"
        );
        assert!(git_output(&repository.0, &["status", "--porcelain"])
            .expect("read undo status")
            .lines()
            .any(|line| line.starts_with(" M README.md")));
    }

    #[test]
    fn saves_and_clears_a_repository_commit_template() {
        let repository = test_repository();
        let path = repository.0.to_string_lossy().to_string();

        let snapshot = update_repository_commit_template(
            &path,
            "feat: complete message\n\nIssue: BL-42\n# editor hint\n",
        )
        .expect("save repository template");
        let template = snapshot.commit_template.expect("read saved template");
        assert_eq!(
            template.content,
            "feat: complete message\n\nIssue: BL-42\n# editor hint\n"
        );
        assert_eq!(
            git_output(&repository.0, &["config", "--local", "--get", "commit.template"])
                .expect("read local template setting")
                .trim(),
            template.path
        );

        let snapshot = clear_repository_commit_template(&path).expect("clear repository template");
        assert!(
            git_output(&repository.0, &["config", "--local", "--get", "commit.template"])
                .is_err()
        );
        assert!(snapshot.commit_template.is_none() || snapshot.commit_template.unwrap().path != template.path);
        assert!(!Path::new(&template.path).exists());
    }

    #[test]
    fn reads_repository_and_updates_staging_state() {
        let repository = test_repository();
        fs::write(
            repository.0.join(".git").join("commit-template.txt"),
            "feat: 默认标题\n\n默认正文\n# 提交时删除此注释\n",
        )
        .expect("write commit template");
        git_output(
            &repository.0,
            &["config", "commit.template", ".git/commit-template.txt"],
        )
        .expect("configure commit template");
        fs::write(repository.0.join("README.md"), "first\nsecond\n").expect("update file");
        let path = repository.0.to_string_lossy().to_string();

        let snapshot = read_repository(&path).expect("read repository");
        assert_eq!(snapshot.commits.len(), 1);
        assert_eq!(snapshot.commits[0].title, "初始提交");
        assert_eq!(snapshot.files.len(), 1);
        assert!(snapshot.files[0].unstaged);
        let template = snapshot.commit_template.expect("read commit template");
        assert_eq!(
            Path::new(&template.path)
                .file_name()
                .and_then(|value| value.to_str()),
            Some("commit-template.txt")
        );
        assert!(template.content.contains("feat: 默认标题"));

        let staged_files = stage_files(&path, &["README.md".into()], false).expect("stage file");
        assert!(staged_files[0].staged);
        let snapshot = read_repository(&path).expect("read staged repository");
        assert!(snapshot.files[0].staged);

        fs::write(repository.0.join("README.md"), "first\nsecond\nthird\n")
            .expect("add unstaged update after staging");
        let discarded_files = discard_worktree_files(&path, &["README.md".into()])
            .expect("discard unstaged tracked update");
        assert_eq!(
            fs::read_to_string(repository.0.join("README.md"))
                .expect("read restored file")
                .replace("\r\n", "\n"),
            "first\nsecond\n"
        );
        assert!(discarded_files[0].staged);
        assert!(!discarded_files[0].unstaged);

        fs::write(repository.0.join("untracked.txt"), "temporary\n").expect("write untracked file");
        discard_worktree_files(&path, &["untracked.txt".into()]).expect("discard untracked file");
        assert!(!repository.0.join("untracked.txt").exists());
        assert!(discard_worktree_files(&path, &["../outside.txt".into()]).is_err());

        let unstaged_files = unstage_files(&path, &["README.md".into()]).expect("unstage file");
        assert!(unstaged_files[0].unstaged);
        let snapshot = read_repository(&path).expect("read unstaged repository");
        assert!(snapshot.files[0].unstaged);

        git_output(&repository.0, &["add", "README.md"]).expect("stage history update");
        git_output(
            &repository.0,
            &["commit", "-m", "更新说明", "-m", "完整提交正文"],
        )
        .expect("commit history update");
        let history = load_file_history(&path, "README.md").expect("load file history");
        assert_eq!(history.len(), 2);
        assert!(history[0].message.contains("完整提交正文"));
        let stats = load_commit_stats(&path, &history[0].hash).expect("load commit stats");
        assert_eq!(stats.files, 1);
        assert_eq!(stats.additions, 1);
        let commit_files = load_commit_files(&path, &history[0].hash).expect("load commit files");
        assert_eq!(commit_files.len(), 1);
        assert_eq!(commit_files[0].path, "README.md");
        assert_eq!(commit_files[0].r#type, "M");
        let root_files = load_commit_files(&path, &history[1].hash).expect("load root files");
        assert_eq!(root_files.len(), 1);
        assert_eq!(root_files[0].r#type, "A");
        assert!(!load_file_commit_diff(&path, &history[0].hash, "README.md")
            .expect("load historical file diff")
            .is_empty());
        let blame = load_file_blame(&path, "README.md", None).expect("load file blame");
        assert_eq!(blame.len(), 2);
        let historical_blame = load_file_blame(&path, "README.md", Some(&history[1].hash))
            .expect("load blame at historical revision");
        assert_eq!(historical_blame.len(), 1);
        let line_history =
            load_line_history(&path, "README.md", 2, None).expect("load selected line history");
        assert_eq!(line_history.len(), 1);
        assert_eq!(line_history[0].title, "更新说明");

        let base_branch = git_output(&repository.0, &["branch", "--show-current"])
            .expect("read base branch")
            .trim()
            .to_string();
        git_output(&repository.0, &["switch", "-c", "history/unmerged"])
            .expect("create unmerged history branch");
        fs::write(
            repository.0.join("README.md"),
            "first\nsecond\nbranch only\n",
        )
        .expect("write unmerged file update");
        git_output(&repository.0, &["add", "README.md"]).expect("stage unmerged file update");
        git_output(&repository.0, &["commit", "-m", "未合入文件修改"])
            .expect("commit unmerged file update");
        git_output(&repository.0, &["switch", &base_branch]).expect("return to base branch");
        let all_ref_history =
            load_file_history(&path, "README.md").expect("load history across refs");
        assert!(all_ref_history
            .iter()
            .any(|entry| entry.title == "未合入文件修改"));

        git_output(&repository.0, &["branch", "feat/one"]).expect("create first branch");
        git_output(&repository.0, &["branch", "feat/two"]).expect("create second branch");
        let branches = preview_branch_prefix(&path, "feat").expect("preview prefix");
        assert_eq!(branches, vec!["feat/one", "feat/two"]);
        delete_branch_prefix(&path, "feat", &branches).expect("delete prefix");
        assert!(preview_branch_prefix(&path, "feat")
            .expect("preview deleted prefix")
            .is_empty());
    }

    #[test]
    fn reports_the_immediate_superproject_for_a_submodule() {
        let repository = test_repository();
        let submodule_source = test_repository();
        let source_path = submodule_source.0.to_string_lossy().to_string();
        git_output(
            &repository.0,
            &[
                "-c",
                "protocol.file.allow=always",
                "submodule",
                "add",
                &source_path,
                "vendor/module",
            ],
        )
        .expect("add test submodule");

        let submodule_path = repository.0.join("vendor/module");
        let snapshot = read_repository(&submodule_path.to_string_lossy()).expect("read submodule");
        let expected_parent = repository
            .0
            .canonicalize()
            .expect("canonical parent")
            .to_string_lossy()
            .replace('\\', "/");
        let actual_parent = snapshot
            .superproject_path
            .expect("submodule should expose its superproject")
            .replace('\\', "/");

        assert_eq!(actual_parent, expected_parent);
    }

    #[test]
    fn supports_branch_compare_merge_queue_tags_and_stashes() {
        let repository = test_repository();
        let path = repository.0.to_string_lossy().to_string();
        let base_branch = git_output(&repository.0, &["branch", "--show-current"])
            .expect("read current branch")
            .trim()
            .to_string();

        git_output(&repository.0, &["tag", "v0.1.0"]).expect("create tag");
        git_output(&repository.0, &["branch", "feat/compare"]).expect("create feature branch");
        switch_repository_branch(&path, "feat/compare").expect("switch feature branch");
        fs::write(repository.0.join("README.md"), "first\nfeature\n").expect("write feature");
        git_output(&repository.0, &["add", "README.md"]).expect("add feature");
        git_output(&repository.0, &["commit", "-m", "功能提交"]).expect("commit feature");

        let comparison =
            compare_repository_refs(&path, &base_branch, "feat/compare").expect("compare branches");
        assert_eq!(comparison.ahead, 1);
        assert_eq!(comparison.behind, 0);
        assert_eq!(comparison.files.len(), 1);
        assert!(
            !parse_compare_diff(&path, &base_branch, "feat/compare", "README.md")
                .expect("compare diff")
                .is_empty()
        );
        let reverse_comparison =
            compare_repository_refs(&path, "feat/compare", &base_branch).expect("reverse compare");
        assert_eq!(reverse_comparison.files.len(), 1);
        assert!(
            !parse_compare_diff(&path, "feat/compare", &base_branch, "README.md")
                .expect("reverse compare diff")
                .is_empty()
        );

        switch_repository_branch(&path, &base_branch).expect("switch base branch");
        let queue = load_merge_queue(&path).expect("load merge queue");
        let candidate = queue
            .candidates
            .iter()
            .find(|candidate| candidate.branch == "feat/compare")
            .expect("feature candidate");
        assert_eq!(candidate.ahead, 1);
        assert!(!candidate.merged);

        fs::write(repository.0.join("README.md"), "first\nstashed\n").expect("write stash");
        fs::write(repository.0.join("untracked.txt"), "untracked\n")
            .expect("write untracked stash file");
        create_repository_stash(&path, "测试暂存节点", true).expect("create stash");
        let snapshot = read_repository(&path).expect("read stashes and tags");
        assert_eq!(snapshot.tags, vec!["v0.1.0"]);
        assert_eq!(snapshot.stashes.len(), 1);
        assert!(snapshot.stashes[0].message.contains("测试暂存节点"));
        let stash_commit = snapshot
            .commits
            .iter()
            .find(|commit| commit.status.as_deref() == Some("stash"))
            .expect("stash commit in graph");
        assert!(stash_commit
            .branches
            .iter()
            .any(|reference| reference == "refs/stash"));
        assert!(stash_commit.parents.len() >= 2);
        assert!(snapshot
            .commits
            .iter()
            .any(|commit| commit.full_hash == stash_commit.parents[0]));
        for helper_parent in stash_commit.parents.iter().skip(1) {
            assert!(!snapshot
                .commits
                .iter()
                .any(|commit| &commit.full_hash == helper_parent));
        }

        let reference = snapshot.stashes[0].reference.clone();
        let stash_files = load_stash_files(&path, &reference).expect("load stash files");
        assert!(stash_files.iter().any(|file| file.path == "README.md"));
        assert!(stash_files.iter().any(|file| file.path == "untracked.txt"));
        assert!(!load_stash_file_diff(&path, &reference, "README.md")
            .expect("load tracked stash diff")
            .is_empty());
        assert!(!load_stash_file_diff(&path, &reference, "untracked.txt")
            .expect("load untracked stash diff")
            .is_empty());
        apply_repository_stash(&path, &reference, false).expect("apply stash");
        assert!(fs::read_to_string(repository.0.join("README.md"))
            .expect("read applied stash")
            .contains("stashed"));
        git_output(&repository.0, &["restore", "README.md"]).expect("restore file");
        drop_repository_stash(&path, &reference).expect("drop stash");
        assert!(read_repository(&path)
            .expect("read dropped stash")
            .stashes
            .is_empty());
    }

    #[test]
    fn loads_stash_without_untracked_parent() {
        let repository = test_repository();
        let path = repository.0.to_string_lossy().to_string();

        fs::write(repository.0.join("README.md"), "first\ntracked stash\n")
            .expect("write tracked stash change");
        create_repository_stash(&path, "仅跟踪文件", false).expect("create tracked-only stash");
        assert!(git_output(&repository.0, &["rev-parse", "--verify", "stash@{0}^3"]).is_err());

        let files = load_stash_files(&path, "stash@{0}").expect("load tracked-only stash files");
        assert!(files.iter().any(|file| file.path == "README.md"));
        assert!(!load_stash_file_diff(&path, "stash@{0}", "README.md")
            .expect("load tracked-only stash diff")
            .is_empty());
    }

    #[test]
    fn manages_repository_worktree_lifecycle() {
        let repository = test_repository();
        let path = repository.0.to_string_lossy().to_string();
        let worktree_path = repository.0.with_extension("linked-worktree");
        let worktree = worktree_path.to_string_lossy().to_string();

        create_repository_worktree(&path, &worktree, "feat/linked", true)
            .expect("create linked worktree");
        assert!(parse_worktrees(&repository.0)
            .iter()
            .any(|item| normalized_path_key(Path::new(&item.path)) == normalized_path_key(&worktree_path) && item.branch.as_deref() == Some("feat/linked")));

        set_repository_worktree_lock(&path, &worktree, true).expect("lock linked worktree");
        assert!(parse_worktrees(&repository.0)
            .iter()
            .find(|item| normalized_path_key(Path::new(&item.path)) == normalized_path_key(&worktree_path))
            .and_then(|item| item.locked.as_ref())
            .is_some());
        set_repository_worktree_lock(&path, &worktree, false).expect("unlock linked worktree");
        assert!(remove_repository_worktree(&path, &path).is_err());

        remove_repository_worktree(&path, &worktree).expect("remove linked worktree");
        prune_repository_worktrees(&path).expect("prune linked worktrees");
        assert!(!worktree_path.exists());
    }

    #[test]
    fn manages_repository_submodule_lifecycle() {
        let repository = test_repository();
        let submodule_source = test_repository();
        let path = repository.0.to_string_lossy().to_string();
        let source_path = submodule_source.0.to_string_lossy().to_string();
        git_output(
            &repository.0,
            &[
                "-c",
                "protocol.file.allow=always",
                "submodule",
                "add",
                &source_path,
                "vendor/module",
            ],
        )
        .expect("add lifecycle submodule");
        git_output(&repository.0, &["commit", "-am", "添加生命周期 Submodule"])
            .expect("commit lifecycle submodule");
        git_output(&repository.0, &["config", "protocol.file.allow", "always"])
            .expect("allow local submodule update");

        deinitialize_repository_submodule(&path, "vendor/module")
            .expect("deinitialize submodule");
        assert_eq!(parse_submodules(&repository.0)[0].status, "uninitialized");
        initialize_repository_submodule(&path, "vendor/module").expect("initialize submodule");
        update_repository_submodule(&path, Some("vendor/module")).expect("update submodule");
        assert_eq!(parse_submodules(&repository.0)[0].status, "ok");
        sync_repository_submodules(&path).expect("sync submodules");
        assert!(initialize_repository_submodule(&path, "vendor/missing").is_err());
    }

    #[test]
    fn supports_scoped_stashes() {
        let repository = test_repository();
        let path = repository.0.to_string_lossy().to_string();

        fs::write(repository.0.join("staged.txt"), "staged\n").expect("write staged file");
        git_output(&repository.0, &["add", "staged.txt"]).expect("stage file");
        fs::write(repository.0.join("unstaged.txt"), "unstaged\n").expect("write unstaged file");
        create_scoped_repository_stash(&path, "staged", "仅已暂存").expect("stash staged");
        let snapshot = read_repository(&path).expect("read staged stash result");
        assert!(!snapshot.files.iter().any(|file| file.path == "staged.txt"));
        assert!(snapshot
            .files
            .iter()
            .any(|file| file.path == "unstaged.txt" && file.unstaged));

        fs::write(repository.0.join("index.txt"), "index\n").expect("write index file");
        git_output(&repository.0, &["add", "index.txt"]).expect("stage index file");
        create_scoped_repository_stash(&path, "unstaged", "仅未暂存").expect("stash unstaged");
        let snapshot = read_repository(&path).expect("read unstaged stash result");
        assert!(snapshot
            .files
            .iter()
            .any(|file| file.path == "index.txt" && file.staged));
        assert!(!snapshot
            .files
            .iter()
            .any(|file| file.path == "unstaged.txt"));
        assert_eq!(snapshot.stashes.len(), 2);
    }

    #[test]
    fn supports_commit_and_branch_context_actions() {
        let repository = test_repository();
        let path = repository.0.to_string_lossy().to_string();
        let base_branch = git_output(&repository.0, &["branch", "--show-current"])
            .expect("read base branch")
            .trim()
            .to_string();
        create_repository_branch(&path, "feat/created").expect("create branch from context menu");
        assert!(parse_local_branches(&repository.0)
            .iter()
            .any(|branch| branch == "feat/created"));
        assert!(create_repository_branch(&path, "feat/created").is_err());
        delete_repository_branch(&path, "feat/created").expect("delete created branch");

        git_output(&repository.0, &["switch", "-c", "feat/cherry"]).expect("create cherry branch");
        fs::write(repository.0.join("cherry.txt"), "cherry\n").expect("write cherry file");
        git_output(&repository.0, &["add", "cherry.txt"]).expect("add cherry file");
        git_output(&repository.0, &["commit", "-m", "待挑选提交"]).expect("commit cherry file");
        let cherry_hash = git_output(&repository.0, &["rev-parse", "HEAD"])
            .expect("read cherry hash")
            .trim()
            .to_string();
        git_output(&repository.0, &["switch", &base_branch]).expect("switch base branch");
        cherry_pick_repository_commit(&path, &cherry_hash).expect("cherry-pick commit");
        assert!(repository.0.join("cherry.txt").exists());

        git_output(&repository.0, &["switch", "-c", "feat/merge"]).expect("create merge branch");
        fs::write(repository.0.join("merge.txt"), "merge\n").expect("write merge file");
        git_output(&repository.0, &["add", "merge.txt"]).expect("add merge file");
        git_output(&repository.0, &["commit", "-m", "待合并提交"]).expect("commit merge file");
        git_output(&repository.0, &["switch", &base_branch]).expect("switch base branch again");
        merge_repository_reference(&path, "feat/merge").expect("merge branch");
        assert!(repository.0.join("merge.txt").exists());

        let current_head = git_output(&repository.0, &["rev-parse", "HEAD"])
            .expect("read current head")
            .trim()
            .to_string();
        create_repository_tag(&path, "context-actions", &current_head).expect("create commit tag");
        assert!(parse_tags(&repository.0)
            .iter()
            .any(|tag| tag == "context-actions"));
        assert!(create_repository_tag(&path, "context-actions", &current_head).is_err());
        rebase_repository_onto(&path, &current_head).expect("rebase onto selected commit");

        fs::write(repository.0.join("reset.txt"), "reset\n").expect("write reset file");
        git_output(&repository.0, &["add", "reset.txt"]).expect("add reset file");
        git_output(&repository.0, &["commit", "-m", "待回退提交"]).expect("commit reset file");
        reset_repository_to_commit(&path, &current_head).expect("hard reset to selected commit");
        assert!(!repository.0.join("reset.txt").exists());
        assert!(!git_output(&repository.0, &["status", "--porcelain"])
            .expect("read reset status")
            .contains("reset.txt"));
        git_output(&repository.0, &["reset", "--hard", "HEAD"]).expect("clean reset result");
        let _ = fs::remove_file(repository.0.join("reset.txt"));

        delete_repository_branch(&path, "feat/merge").expect("delete merged branch");
        assert!(!parse_local_branches(&repository.0)
            .iter()
            .any(|branch| branch == "feat/merge"));
        assert!(delete_repository_branch(&path, &base_branch).is_err());
    }

    #[test]
    fn merge_preserves_unrelated_worktree_changes() {
        let repository = test_repository();
        let path = repository.0.to_string_lossy().to_string();
        let base_branch = git_output(&repository.0, &["branch", "--show-current"])
            .expect("read base branch")
            .trim()
            .to_string();

        git_output(&repository.0, &["switch", "-c", "feat/unrelated-merge"])
            .expect("create merge branch");
        fs::write(repository.0.join("merged.txt"), "merged\n").expect("write merged file");
        git_output(&repository.0, &["add", "merged.txt"]).expect("add merged file");
        git_output(&repository.0, &["commit", "-m", "新增合并文件"])
            .expect("commit merged file");
        git_output(&repository.0, &["switch", &base_branch]).expect("switch base branch");

        fs::write(repository.0.join("README.md"), "local change\n")
            .expect("write unrelated local change");
        merge_repository_reference(&path, "feat/unrelated-merge")
            .expect("merge with unrelated local change");

        assert_eq!(
            fs::read_to_string(repository.0.join("README.md")).expect("read local change"),
            "local change\n"
        );
        assert!(repository.0.join("merged.txt").exists());
        assert!(git_output(&repository.0, &["status", "--porcelain"])
            .expect("read status")
            .contains("README.md"));
    }

    #[test]
    fn merge_automatically_stages_gitlink_conflicts_with_current_reference() {
        let repository = test_repository();
        let submodule = test_repository();
        let path = repository.0.to_string_lossy().to_string();
        let base_branch = git_output(&repository.0, &["branch", "--show-current"])
            .expect("read base branch")
            .trim()
            .to_string();
        let initial_gitlink = git_output(&submodule.0, &["rev-parse", "HEAD"])
            .expect("read initial gitlink")
            .trim()
            .to_string();

        git_output(&submodule.0, &["switch", "-c", "left"])
            .expect("create left source branch");
        fs::write(submodule.0.join("left.txt"), "left\n").expect("write left source change");
        git_output(&submodule.0, &["add", "left.txt"]).expect("stage left source change");
        git_output(&submodule.0, &["commit", "-m", "left source commit"])
            .expect("commit left source change");
        let left_gitlink = git_output(&submodule.0, &["rev-parse", "HEAD"])
            .expect("read left gitlink")
            .trim()
            .to_string();

        git_output(&submodule.0, &["switch", "-c", "right", &initial_gitlink])
            .expect("create right source branch");
        fs::write(submodule.0.join("right.txt"), "right\n").expect("write right source change");
        git_output(&submodule.0, &["add", "right.txt"]).expect("stage right source change");
        git_output(&submodule.0, &["commit", "-m", "right source commit"])
            .expect("commit right source change");
        let right_gitlink = git_output(&submodule.0, &["rev-parse", "HEAD"])
            .expect("read right gitlink")
            .trim()
            .to_string();

        let submodule_path = submodule.0.to_string_lossy().to_string();
        git_output(
            &repository.0,
            &[
                "-c",
                "protocol.file.allow=always",
                "submodule",
                "add",
                &submodule_path,
                "vendor/module",
            ],
        )
        .expect("add test submodule");
        let checkout = repository.0.join("vendor/module");
        git_output(&checkout, &["checkout", &initial_gitlink]).expect("checkout initial gitlink");
        git_output(&repository.0, &["add", ".gitmodules", "vendor/module"])
            .expect("stage initial submodule");
        git_output(&repository.0, &["commit", "-m", "添加 Submodule 引用"])
            .expect("commit initial gitlink");

        git_output(&repository.0, &["switch", "-c", "feat/gitlink"])
            .expect("create feature branch");
        git_output(&checkout, &["checkout", &left_gitlink]).expect("checkout feature gitlink");
        git_output(&repository.0, &["add", "vendor/module"]).expect("stage feature gitlink");
        git_output(&repository.0, &["commit", "-m", "更新 feature Gitlink"])
            .expect("commit feature gitlink");

        git_output(&repository.0, &["switch", &base_branch]).expect("switch base branch");
        git_output(&checkout, &["checkout", &right_gitlink]).expect("checkout current gitlink");
        git_output(&repository.0, &["add", "vendor/module"]).expect("stage current gitlink");
        git_output(&repository.0, &["commit", "-m", "更新 current Gitlink"])
            .expect("commit current gitlink");

        merge_repository_reference(&path, "feat/gitlink").expect_err("merge should report conflict");

        assert!(
            unresolved_paths(&repository.0)
                .iter()
                .all(|conflict| conflict != "vendor/module"),
            "gitlink conflict should be staged automatically"
        );
        let stage = git_output(&repository.0, &["ls-files", "--stage", "--", "vendor/module"])
            .expect("read staged gitlink");
        assert_eq!(
            stage.trim(),
            format!("160000 {right_gitlink} 0\tvendor/module"),
            "current branch gitlink must remain staged"
        );
    }

    #[test]
    fn pulls_current_and_background_branches_with_fast_forward_only() {
        let repository = test_repository();
        let path = repository.0.to_string_lossy().to_string();
        let base_branch = git_output(&repository.0, &["branch", "--show-current"])
            .expect("read base branch")
            .trim()
            .to_string();
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock")
            .as_nanos();
        let remote = TestRepository(
            std::env::temp_dir().join(format!("branchline-remote-{}-{unique}", std::process::id())),
        );
        fs::create_dir_all(&remote.0).expect("create bare remote directory");
        git_output(&remote.0, &["init", "--bare"]).expect("init bare remote");
        let remote_path = remote.0.to_string_lossy().to_string();
        git_output(&repository.0, &["remote", "add", "origin", &remote_path]).expect("add origin");
        git_output(&repository.0, &["push", "-u", "origin", &base_branch])
            .expect("push base branch");
        assert!(read_repository(&path)
            .expect("read remote branches")
            .remote_branches
            .iter()
            .any(|branch| branch == &format!("origin/{base_branch}")));
        fs::write(repository.0.join("pushed.txt"), "pushed\n").expect("write pushed file");
        git_output(&repository.0, &["add", "pushed.txt"]).expect("add pushed file");
        git_output(&repository.0, &["commit", "-m", "推送测试"]).expect("commit pushed file");
        push_repository(&path).expect("push current branch");
        let local_head =
            git_output(&repository.0, &["rev-parse", "HEAD"]).expect("read local pushed head");
        let remote_head =
            git_output(&remote.0, &["rev-parse", &base_branch]).expect("read remote pushed head");
        assert_eq!(local_head.trim(), remote_head.trim());

        let peer = TestRepository(
            std::env::temp_dir().join(format!("branchline-peer-{}-{unique}", std::process::id())),
        );
        let peer_path = peer.0.to_string_lossy().to_string();
        git_output(&std::env::temp_dir(), &["clone", &remote_path, &peer_path])
            .expect("clone peer");
        git_output(&peer.0, &["config", "user.name", "Branchline Peer"]).expect("peer user name");
        git_output(&peer.0, &["config", "user.email", "peer@example.com"])
            .expect("peer user email");
        fs::write(peer.0.join("README.md"), "first\nremote\n").expect("write remote update");
        git_output(&peer.0, &["add", "README.md"]).expect("add remote update");
        git_output(&peer.0, &["commit", "-m", "远程更新"]).expect("commit remote update");
        git_output(&peer.0, &["push"]).expect("push remote update");

        fs::write(repository.0.join("README.md"), "first\nlocal\n")
            .expect("write overlapping local update");
        fetch_repository(&path).expect("fetch incoming file state");
        let incoming_snapshot = read_repository(&path).expect("read incoming file state");
        assert!(incoming_snapshot
            .files
            .iter()
            .any(|file| file.path == "README.md" && file.incoming));
        git_output(&repository.0, &["restore", "README.md"])
            .expect("restore incoming marker fixture");
        fs::write(repository.0.join("pushed.txt"), "pushed\nlocal staged\n")
            .expect("write staged local update");
        git_output(&repository.0, &["add", "pushed.txt"]).expect("stage local update");
        fs::write(repository.0.join("pull-draft.txt"), "untracked draft\n")
            .expect("write untracked local update");
        let stash_count = parse_stashes(&repository.0).len();
        pull_repository_branch(&path, &base_branch).expect("pull current branch");
        assert!(fs::read_to_string(repository.0.join("README.md"))
            .expect("read pulled file")
            .contains("remote"));
        let restored_status = git_output(&repository.0, &["status", "--porcelain"])
            .expect("read restored auto stash status");
        assert!(restored_status.lines().any(|line| line == "M  pushed.txt"));
        assert!(restored_status
            .lines()
            .any(|line| line == "?? pull-draft.txt"));
        assert_eq!(parse_stashes(&repository.0).len(), stash_count);
        git_output(&repository.0, &["reset", "--hard", "HEAD"])
            .expect("clean staged auto stash fixture");
        fs::remove_file(repository.0.join("pull-draft.txt"))
            .expect("clean untracked auto stash fixture");

        fs::write(peer.0.join("README.md"), "first\nremote\nremote second\n")
            .expect("write second remote update");
        git_output(&peer.0, &["add", "README.md"]).expect("add second remote update");
        git_output(&peer.0, &["commit", "-m", "远程追加更新"])
            .expect("commit second remote update");
        git_output(&peer.0, &["push"]).expect("push second remote update");
        fs::write(
            repository.0.join("README.md"),
            "local first\nfirst\nremote\n",
        )
        .expect("write cleanly mergeable local overlap");
        git_output(&repository.0, &["add", "README.md"])
            .expect("stage cleanly mergeable local overlap");
        pull_repository_branch(&path, &base_branch).expect("pull with automatic stash");
        let merged_content = fs::read_to_string(repository.0.join("README.md"))
            .expect("read automatically restored overlap");
        assert!(merged_content.contains("local first"));
        assert!(merged_content.contains("remote second"));
        assert!(git_output(&repository.0, &["status", "--porcelain"])
            .expect("read automatically restored staged overlap")
            .lines()
            .any(|line| line == "M  README.md"));
        assert_eq!(parse_stashes(&repository.0).len(), stash_count);
        git_output(&repository.0, &["reset", "--hard", "HEAD"])
            .expect("clean overlapping auto stash fixture");

        git_output(&repository.0, &["switch", "-c", "feat/pull"]).expect("create pull branch");
        fs::write(repository.0.join("branch.txt"), "local\n").expect("write branch file");
        git_output(&repository.0, &["add", "branch.txt"]).expect("add branch file");
        git_output(&repository.0, &["commit", "-m", "分支初始提交"]).expect("commit branch file");
        git_output(&repository.0, &["push", "-u", "origin", "feat/pull"])
            .expect("push pull branch");
        git_output(&repository.0, &["switch", &base_branch]).expect("switch base branch");

        git_output(&peer.0, &["fetch", "origin"]).expect("peer fetch branch");
        git_output(&peer.0, &["switch", "--track", "origin/feat/pull"])
            .expect("peer switch pull branch");
        fs::write(peer.0.join("branch.txt"), "local\nremote\n").expect("write branch update");
        git_output(&peer.0, &["add", "branch.txt"]).expect("add branch update");
        git_output(&peer.0, &["commit", "-m", "分支远程更新"]).expect("commit branch update");
        git_output(&peer.0, &["push"]).expect("push branch update");

        pull_repository_branch(&path, "feat/pull").expect("pull background branch");
        let local_hash =
            git_output(&repository.0, &["rev-parse", "feat/pull"]).expect("read local branch hash");
        let remote_hash = git_output(&repository.0, &["rev-parse", "origin/feat/pull"])
            .expect("read remote branch hash");
        assert_eq!(local_hash.trim(), remote_hash.trim());
        assert_eq!(
            git_output(&repository.0, &["branch", "--show-current"])
                .expect("read branch after background pull")
                .trim(),
            base_branch
        );

        git_output(&peer.0, &["switch", &base_branch]).expect("switch peer to base branch");
        fs::write(peer.0.join("README.md"), "first\nremote conflict\n")
            .expect("write conflicting remote update");
        git_output(&peer.0, &["add", "README.md"]).expect("add conflicting remote update");
        git_output(&peer.0, &["commit", "-m", "远程冲突更新"])
            .expect("commit conflicting remote update");
        git_output(&peer.0, &["push"]).expect("push conflicting remote update");
        fs::write(repository.0.join("README.md"), "first\nlocal conflict\n")
            .expect("write conflicting local update");
        let error = pull_repository_branch(&path, &base_branch)
            .expect_err("auto stash restore should report conflict");
        assert!(error.contains("拉取已完成"));
        assert!(error.contains("自动 Stash 已保留"));
        assert_eq!(parse_stashes(&repository.0).len(), stash_count + 1);
        assert!(git_output(&repository.0, &["status", "--porcelain"])
            .expect("read auto stash conflict status")
            .contains("README.md"));
    }

    #[test]
    fn filters_gitlinks_from_stash_paths() {
        let repository = test_repository();
        let submodule_source = test_repository();
        let path = repository.0.to_string_lossy().to_string();
        let source_path = submodule_source.0.to_string_lossy().to_string();
        git_output(
            &repository.0,
            &[
                "-c",
                "protocol.file.allow=always",
                "submodule",
                "add",
                &source_path,
                "vendor/module",
            ],
        )
        .expect("add test submodule");
        git_output(&repository.0, &["add", ".gitmodules", "vendor/module"])
            .expect("stage test submodule");
        git_output(&repository.0, &["commit", "-m", "添加 Gitlink"]).expect("commit gitlink entry");

        let submodule = repository.0.join("vendor/module");
        git_output(&submodule, &["config", "user.name", "Branchline Submodule"])
            .expect("configure submodule user name");
        git_output(
            &submodule,
            &["config", "user.email", "submodule@example.com"],
        )
        .expect("configure submodule user email");
        fs::write(submodule.join("submodule.txt"), "gitlink change\n")
            .expect("write submodule change");
        git_output(&submodule, &["add", "submodule.txt"]).expect("stage submodule change");
        git_output(&submodule, &["commit", "-m", "更新 Submodule"])
            .expect("commit submodule change");
        git_output(&repository.0, &["add", "vendor/module"]).expect("stage changed gitlink");
        fs::write(repository.0.join("README.md"), "first\nlocal change\n")
            .expect("write stashable file");

        let paths = stashable_changed_paths(&repository.0);
        assert!(paths.iter().any(|path| path == "README.md"));
        assert!(!paths.iter().any(|path| path == "vendor/module"));
        create_repository_stash(&path, "过滤 Gitlink", true).expect("create filtered stash");
        let status = git_output(&repository.0, &["status", "--porcelain"])
            .expect("read filtered stash status");
        assert!(status.contains("vendor/module"));
        assert!(!status.contains("README.md"));
        let stash_files = load_stash_files(&path, "stash@{0}").expect("read filtered stash files");
        assert!(stash_files.iter().any(|file| file.path == "README.md"));
        assert!(!stash_files.iter().any(|file| file.path == "vendor/module"));
    }

    #[test]
    fn preserves_merge_parents_and_branch_decorations_for_graph_layout() {
        let repository = test_repository();
        let path = repository.0.to_string_lossy().to_string();
        let base_branch = git_output(&repository.0, &["branch", "--show-current"])
            .expect("read base branch")
            .trim()
            .to_string();

        git_output(&repository.0, &["switch", "-c", "feat/graph"]).expect("create feature branch");
        fs::write(repository.0.join("feature.txt"), "feature\n").expect("write feature file");
        git_output(&repository.0, &["add", "feature.txt"]).expect("add feature file");
        git_output(&repository.0, &["commit", "-m", "功能分支提交"])
            .expect("commit feature branch");

        git_output(&repository.0, &["switch", &base_branch]).expect("switch base branch");
        fs::write(repository.0.join("main.txt"), "main\n").expect("write main file");
        git_output(&repository.0, &["add", "main.txt"]).expect("add main file");
        git_output(&repository.0, &["commit", "-m", "主线提交"]).expect("commit main branch");
        git_output(
            &repository.0,
            &["merge", "--no-ff", "feat/graph", "-m", "合并功能分支"],
        )
        .expect("create merge commit");

        let snapshot = read_repository(&path).expect("read merge graph");
        let merge = snapshot
            .commits
            .iter()
            .find(|commit| commit.title == "合并功能分支")
            .expect("merge commit");
        assert_eq!(merge.parents.len(), 2);
        assert_eq!(merge.status.as_deref(), Some("merge"));
        assert!(merge.branches.iter().any(|branch| branch == &base_branch));

        let feature = snapshot
            .commits
            .iter()
            .find(|commit| commit.title == "功能分支提交")
            .expect("feature commit");
        assert!(feature.branches.iter().any(|branch| branch == "feat/graph"));
        assert_ne!(feature.lane, merge.lane);
    }

    #[test]
    fn supports_conflict_resolution_and_stepwise_rebase() {
        let repository = test_repository();
        let path = repository.0.to_string_lossy().to_string();
        let base_branch = git_output(&repository.0, &["branch", "--show-current"])
            .expect("read base branch")
            .trim()
            .to_string();

        git_output(&repository.0, &["switch", "-c", "feat/conflict"])
            .expect("create conflict branch");
        fs::write(repository.0.join("README.md"), "feature version\n")
            .expect("write feature version");
        git_output(&repository.0, &["add", "README.md"]).expect("add feature version");
        git_output(&repository.0, &["commit", "-m", "功能冲突提交"])
            .expect("commit feature version");
        git_output(&repository.0, &["switch", &base_branch]).expect("switch base branch");
        fs::write(repository.0.join("README.md"), "main version\n").expect("write main version");
        git_output(&repository.0, &["add", "README.md"]).expect("add main version");
        git_output(&repository.0, &["commit", "-m", "主线冲突提交"]).expect("commit main version");

        merge_repository_reference(&path, "feat/conflict").expect_err("merge should conflict");
        let snapshot = read_repository(&path).expect("read merge conflict state");
        let operation = snapshot.operation.expect("merge operation");
        assert_eq!(operation.kind, "merge");
        assert_eq!(operation.conflicts, vec!["README.md"]);
        let conflict = load_conflict_file(&path, "README.md").expect("load conflict content");
        assert!(conflict
            .base
            .as_deref()
            .is_some_and(|value| value.contains("first")));
        assert!(conflict
            .current
            .as_deref()
            .is_some_and(|value| value.contains("main version")));
        assert!(conflict
            .incoming
            .as_deref()
            .is_some_and(|value| value.contains("feature version")));
        resolve_conflict_block(&path, "README.md", 0, "current")
            .expect("choose current merge conflict block");
        assert_eq!(
            fs::read_to_string(repository.0.join("README.md"))
                .expect("read resolved merge file")
                .replace("\r\n", "\n"),
            "main version\n"
        );
        assert!(read_repository(&path)
            .expect("read unresolved but edited merge file")
            .operation
            .is_some());
        stage_files(&path, &["README.md".into()], false).expect("stage resolved merge file");
        continue_repository_operation(&path).expect("continue merge");
        assert!(read_repository(&path)
            .expect("read completed merge")
            .operation
            .is_none());

        git_output(&repository.0, &["switch", "-c", "feat/rebase"]).expect("create rebase branch");
        fs::write(repository.0.join("route.txt"), "topic\n").expect("write topic route");
        git_output(&repository.0, &["add", "route.txt"]).expect("add topic route");
        git_output(&repository.0, &["commit", "-m", "待变基提交"]).expect("commit topic route");
        git_output(&repository.0, &["switch", &base_branch]).expect("switch base for rebase");
        fs::write(repository.0.join("route.txt"), "base\n").expect("write base route");
        git_output(&repository.0, &["add", "route.txt"]).expect("add base route");
        git_output(&repository.0, &["commit", "-m", "变基目标提交"]).expect("commit base route");
        git_output(&repository.0, &["switch", "feat/rebase"]).expect("switch rebase branch");

        let preview = preview_repository_rebase(&path, &base_branch).expect("preview rebase");
        assert_eq!(preview.branch, "feat/rebase");
        assert_eq!(preview.steps.len(), 1);
        assert_eq!(preview.steps[0].title, "待变基提交");
        rebase_repository_onto(&path, &base_branch).expect_err("rebase should conflict");
        let snapshot = read_repository(&path).expect("read rebase conflict state");
        let operation = snapshot.operation.expect("rebase operation");
        assert_eq!(operation.kind, "rebase");
        assert_eq!(operation.current_step, 1);
        assert_eq!(operation.total_steps, 1);
        assert_eq!(operation.steps.len(), 1);
        assert_eq!(operation.steps[0].status, "current");
        let conflict = load_conflict_file(&path, "route.txt").expect("load rebase conflict");
        assert_eq!(conflict.current_label, "变基目标（当前）");
        assert!(conflict
            .incoming
            .as_deref()
            .is_some_and(|value| value.contains("topic")));
        resolve_conflict_file(&path, "route.txt", "incoming", None)
            .expect("choose replayed commit");
        stage_files(&path, &["route.txt".into()], false).expect("stage resolved rebase file");
        continue_repository_operation(&path).expect("continue rebase");
        assert!(read_repository(&path)
            .expect("read completed rebase")
            .operation
            .is_none());
    }

    #[test]
    fn classifies_all_porcelain_unmerged_statuses_as_conflicts() {
        for status in ["DD", "AU", "UD", "UA", "DU", "AA", "UU"] {
            assert_eq!(porcelain_file_type(status), "U", "status {status}");
        }
        assert_eq!(porcelain_file_type("A "), "A");
        assert_eq!(porcelain_file_type(" D"), "D");
        assert_eq!(porcelain_file_type(" M"), "M");
    }
}
