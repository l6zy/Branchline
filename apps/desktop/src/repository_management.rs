use crate::{git, models::RepositorySubmodule};
use serde::Serialize;
use std::{
    fs,
    io::Read,
    path::PathBuf,
    process::{Command, Stdio},
};

const README_LIMIT: usize = 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryRemote {
    pub name: String,
    pub fetch_urls: Vec<String>,
    pub push_urls: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryDetails {
    pub name: String,
    pub path: String,
    pub branch: String,
    pub branches: Vec<String>,
    pub remote_branches: Vec<String>,
    pub submodules: Vec<RepositorySubmodule>,
    pub remotes: Vec<RepositoryRemote>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryReadme {
    pub name: String,
    pub content: String,
    pub truncated: bool,
}

pub fn load_repository_details(path: &str) -> Result<RepositoryDetails, String> {
    let root = git::repository_root(path)?;
    let branch =
        git::git_output(&root, &["symbolic-ref", "--short", "-q", "HEAD"]).unwrap_or_else(|_| {
            git::git_output(&root, &["rev-parse", "--short", "HEAD"])
                .map(|hash| format!("Detached @ {}", hash.trim()))
                .unwrap_or_default()
        });
    let mut remotes = Vec::new();
    for name in git::git_output(&root, &["remote"])?.lines() {
        let fetch_urls = git::git_output(&root, &["remote", "get-url", "--all", name])?
            .lines()
            .map(str::to_string)
            .collect();
        let push_urls = git::git_output(&root, &["remote", "get-url", "--push", "--all", name])?
            .lines()
            .map(str::to_string)
            .collect();
        remotes.push(RepositoryRemote {
            name: name.to_string(),
            fetch_urls,
            push_urls,
        });
    }
    Ok(RepositoryDetails {
        name: root
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_default(),
        path: git::display_path(&root),
        branch: branch.trim().to_string(),
        branches: git::parse_local_branches(&root),
        remote_branches: git::parse_remote_branches(&root),
        submodules: git::parse_submodules(&root),
        remotes,
    })
}

pub fn load_repository_readme(path: &str) -> Result<Option<RepositoryReadme>, String> {
    let root = git::repository_root(path)?
        .canonicalize()
        .map_err(|error| error.to_string())?;
    let priority = [
        "readme.md",
        "readme.markdown",
        "readme.mdx",
        "readme",
        "readme.txt",
        "readme.rst",
    ];
    let mut candidates = fs::read_dir(&root)
        .map_err(|error| error.to_string())?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().to_string();
            priority
                .iter()
                .position(|candidate| name.eq_ignore_ascii_case(candidate))
                .map(|rank| (rank, name, entry.path()))
        })
        .collect::<Vec<_>>();
    candidates.sort_by(|left, right| (&left.0, &left.1).cmp(&(&right.0, &right.1)));
    for (_, name, candidate) in candidates {
        let resolved = candidate
            .canonicalize()
            .map_err(|error| error.to_string())?;
        if !resolved.starts_with(&root) || !resolved.is_file() {
            continue;
        }
        let mut bytes = Vec::new();
        fs::File::open(resolved)
            .map_err(|error| format!("无法读取 README：{error}"))?
            .take((README_LIMIT + 1) as u64)
            .read_to_end(&mut bytes)
            .map_err(|error| error.to_string())?;
        let truncated = bytes.len() > README_LIMIT;
        bytes.truncate(README_LIMIT);
        return Ok(Some(RepositoryReadme {
            name,
            content: String::from_utf8_lossy(&bytes)
                .trim_start_matches('\u{feff}')
                .to_string(),
            truncated,
        }));
    }
    Ok(None)
}

pub fn create_repository(
    destination: &str,
    source: Option<&str>,
) -> Result<RepositoryDetails, String> {
    let target = PathBuf::from(destination.trim());
    if !target.is_absolute() || target.file_name().is_none() {
        return Err("请选择仓库的绝对路径".into());
    }
    if let Some(source) = source {
        if source.trim().is_empty()
            || source.trim().starts_with('-')
            || source.contains(['\0', '\n', '\r'])
        {
            return Err("请输入有效的远程地址或本地仓库路径".into());
        }
    }
    if target.exists() {
        if !target.is_dir()
            || fs::read_dir(&target)
                .map_err(|error| error.to_string())?
                .next()
                .is_some()
        {
            return Err("目标目录必须为空，请选择新目录或空目录".into());
        }
    }
    let parent = target.parent().ok_or("目标目录无效")?;
    if !parent.is_dir() {
        return Err("目标目录的父目录不存在".into());
    }
    let destination = target.to_string_lossy();
    if let Some(source) = source {
        git::git_output(parent, &["clone", "--", source.trim(), &destination])?;
    } else {
        git::git_output(parent, &["init", "--", &destination])?;
    }
    load_repository_details(&destination)
}

#[cfg(any(target_os = "windows", test))]
fn find_windows_vscode(
    path_directories: &[PathBuf],
    installation_roots: &[PathBuf],
) -> Option<PathBuf> {
    let mut candidates = Vec::new();
    for directory in path_directories {
        candidates.push(directory.join("Code.exe"));
        if let Some(parent) = directory.parent() {
            candidates.push(parent.join("Code.exe"));
        }
    }
    for base in installation_roots {
        candidates.push(base.join("Programs/Microsoft VS Code/Code.exe"));
        candidates.push(base.join("Microsoft VS Code/Code.exe"));
    }
    candidates.into_iter().find(|candidate| candidate.is_file())
}

pub fn open_repository_in_vscode(path: &str) -> Result<(), String> {
    let root = git::repository_root(path)?;
    let mut candidates = Vec::new();
    #[cfg(target_os = "windows")]
    {
        let installation_roots: Vec<_> = ["LOCALAPPDATA", "ProgramFiles", "ProgramFiles(x86)"]
            .into_iter()
            .filter_map(std::env::var_os)
            .map(PathBuf::from)
            .collect();
        let path_directories: Vec<_> = std::env::var_os("PATH")
            .map(|paths| std::env::split_paths(&paths).collect())
            .unwrap_or_default();
        candidates.extend(find_windows_vscode(&path_directories, &installation_roots));
    }
    #[cfg(not(target_os = "windows"))]
    {
        if let Some(paths) = std::env::var_os("PATH") {
            candidates
                .extend(std::env::split_paths(&paths).map(|directory| directory.join("code")));
        }
        candidates.push(PathBuf::from(
            "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
        ));
    }
    let executable = candidates
        .into_iter()
        .find(|candidate| candidate.is_file())
        .ok_or("未找到 VS Code，请先安装 VS Code 并启用 code 命令")?;
    let mut command = Command::new(executable);
    command
        .arg("--new-window")
        .arg(root)
        .env_remove("ELECTRON_RUN_AS_NODE")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    command
        .spawn()
        .map_err(|error| format!("无法打开 VS Code：{error}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::git_output;
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    struct Sandbox(PathBuf);
    impl Sandbox {
        fn new() -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "branchline-manager-{}-{unique}",
                std::process::id()
            ));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }
    impl Drop for Sandbox {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn vscode_prefers_path_installation_over_stale_default_installation() {
        let sandbox = Sandbox::new();
        let old_install = sandbox.0.join("local/Programs/Microsoft VS Code");
        let active_install = sandbox.0.join("active/Microsoft VS Code");
        fs::create_dir_all(&old_install).unwrap();
        fs::create_dir_all(active_install.join("bin")).unwrap();
        fs::write(old_install.join("Code.exe"), "old version").unwrap();
        fs::write(active_install.join("Code.exe"), "active version").unwrap();
        fs::write(active_install.join("bin/code.cmd"), "launcher").unwrap();
        assert_eq!(
            find_windows_vscode(&[active_install.join("bin")], &[sandbox.0.join("local")]),
            Some(active_install.join("Code.exe"))
        );
    }

    #[test]
    fn vscode_falls_back_to_default_installation_when_path_has_no_editor() {
        let sandbox = Sandbox::new();
        let install = sandbox.0.join("Programs/Microsoft VS Code");
        fs::create_dir_all(&install).unwrap();
        fs::write(install.join("Code.exe"), "editor").unwrap();
        assert_eq!(
            find_windows_vscode(&[sandbox.0.join("missing/bin")], &[sandbox.0.clone()]),
            Some(install.join("Code.exe"))
        );
        assert_eq!(find_windows_vscode(&[], &[]), None);
    }

    #[test]
    fn manager_initializes_empty_repository_and_reads_metadata_without_commits() {
        let sandbox = Sandbox::new();
        let target = sandbox.0.join("new repo 中文");
        let details = create_repository(&target.to_string_lossy(), None).unwrap();
        assert!(target.join(".git").is_dir());
        assert_eq!(details.name, "new repo 中文");
        assert!(!details.branch.is_empty());
        assert!(details.branches.is_empty());
        assert!(details.remotes.is_empty());
        assert!(load_repository_readme(&details.path).unwrap().is_none());
        assert!(create_repository(&target.to_string_lossy(), None).is_err());
    }

    #[test]
    fn manager_preserves_nonempty_directories_and_rejects_option_like_clone_sources() {
        let sandbox = Sandbox::new();
        fs::write(sandbox.0.join("keep.txt"), "keep").unwrap();
        assert!(create_repository(&sandbox.0.to_string_lossy(), None).is_err());
        assert!(!sandbox.0.join(".git").exists());
        assert!(create_repository(
            &sandbox.0.join("target").to_string_lossy(),
            Some("--upload-pack=evil")
        )
        .is_err());
        assert!(!sandbox.0.join("target").exists());
        assert_eq!(
            fs::read_to_string(sandbox.0.join("keep.txt")).unwrap(),
            "keep"
        );
    }

    #[test]
    fn manager_clones_local_repository_and_exposes_all_remote_urls_and_readme() {
        let sandbox = Sandbox::new();
        let source = sandbox.0.join("source");
        create_repository(&source.to_string_lossy(), None).unwrap();
        git_output(&source, &["config", "user.name", "Test"]).unwrap();
        git_output(&source, &["config", "user.email", "test@example.com"]).unwrap();
        fs::write(source.join("readme.MD"), "# 中文 README\nhello").unwrap();
        git_output(&source, &["add", "."]).unwrap();
        git_output(&source, &["commit", "-m", "initial"]).unwrap();
        git_output(&source, &["branch", "feature/test"]).unwrap();
        let target = sandbox.0.join("cloned repo");
        let details =
            create_repository(&target.to_string_lossy(), Some(&source.to_string_lossy())).unwrap();
        assert!(details
            .remote_branches
            .iter()
            .any(|branch| branch == "origin/feature/test"));
        assert_eq!(details.remotes.len(), 1);
        assert_eq!(details.remotes[0].name, "origin");
        assert!(!details.remotes[0].fetch_urls.is_empty());
        assert!(!details.remotes[0].push_urls.is_empty());
        let readme = load_repository_readme(&details.path).unwrap().unwrap();
        assert_eq!(readme.name, "readme.MD");
        assert!(readme.content.contains("中文 README"));
        assert!(!readme.truncated);
    }

    #[test]
    fn manager_prioritizes_markdown_readme_and_bounds_large_files() {
        let sandbox = Sandbox::new();
        let details = create_repository(&sandbox.0.join("repo").to_string_lossy(), None).unwrap();
        let root = PathBuf::from(&details.path);
        fs::write(root.join("README.txt"), "plain text").unwrap();
        fs::write(root.join("README.md"), "a".repeat(README_LIMIT + 100)).unwrap();
        let readme = load_repository_readme(&details.path).unwrap().unwrap();
        assert_eq!(readme.name, "README.md");
        assert_eq!(readme.content.len(), README_LIMIT);
        assert!(readme.truncated);
    }
}
