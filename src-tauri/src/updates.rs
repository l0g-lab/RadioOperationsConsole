//! Checking for a newer release on GitHub and fetching its installer, so
//! "Update now" can download the right installer for this computer and open
//! it. Updates aren't signed yet: the installer is fetched over HTTPS from
//! the project's own GitHub releases, the same trust as downloading it by
//! hand. Nothing is fetched while working offline.

use crate::net::{self, FetchError, USER_AGENT};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::Duration;

/// The newest published release (drafts and pre-releases are never "latest").
const LATEST_RELEASE: &str =
    "https://api.github.com/repos/l0g-lab/RadioOperationsConsole/releases/latest";

const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);
/// A download that receives nothing for this long gives up.
const STALL_TIMEOUT: Duration = Duration::from_secs(30);

/// How this copy was installed, which decides which installer updates it.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum InstallKind {
    Msi,
    Nsis,
    Deb,
    Rpm,
    AppImage,
}

impl InstallKind {
    /// How the running copy was installed; None for a build run from source.
    pub fn current() -> Option<Self> {
        use tauri::utils::config::BundleType;
        match tauri::utils::platform::bundle_type()? {
            BundleType::Msi => Some(Self::Msi),
            BundleType::Nsis => Some(Self::Nsis),
            BundleType::Deb => Some(Self::Deb),
            BundleType::Rpm => Some(Self::Rpm),
            BundleType::AppImage => Some(Self::AppImage),
            _ => None,
        }
    }

    /// Whether a release file is this kind's installer (64-bit x86, the only
    /// builds published).
    fn matches(self, name: &str) -> bool {
        let n = name.to_ascii_lowercase();
        match self {
            Self::Msi => n.ends_with(".msi"),
            Self::Nsis => n.ends_with("-setup.exe"),
            Self::Deb => n.ends_with("_amd64.deb"),
            Self::Rpm => n.ends_with(".x86_64.rpm"),
            Self::AppImage => n.ends_with("_amd64.appimage"),
        }
    }
}

/// A file attached to a GitHub release.
#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
pub struct Asset {
    pub name: String,
    pub size: u64,
    pub browser_download_url: String,
}

#[derive(Deserialize, Debug)]
struct Release {
    tag_name: String,
    #[serde(default)]
    body: Option<String>,
    html_url: String,
    #[serde(default)]
    assets: Vec<Asset>,
}

/// A newer release, as the interface shows it.
#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct UpdateInfo {
    pub version: String,
    pub current_version: String,
    /// The release's notes (its CHANGELOG section).
    pub notes: String,
    /// The release's page, for when there's no installer to fetch.
    pub release_url: String,
    /// The installer for this computer, if there is one: None when running a
    /// build from source, or when the release has no matching file.
    pub installer: Option<Asset>,
}

/// "v1.4.0" or "1.4.0" as (1, 4, 0).
pub fn parse_version(v: &str) -> Option<(u64, u64, u64)> {
    let mut parts = v.trim().trim_start_matches('v').split('.');
    let n = |p: Option<&str>| p?.parse::<u64>().ok();
    let version = (n(parts.next())?, n(parts.next())?, n(parts.next())?);
    parts.next().is_none().then_some(version)
}

/// The newer release worth offering, from GitHub's "latest release" answer.
fn update_from(release: Release, current: &str, kind: Option<InstallKind>) -> Option<UpdateInfo> {
    let latest = parse_version(&release.tag_name)?;
    if latest <= parse_version(current)? {
        return None;
    }
    let installer = kind.and_then(|k| release.assets.iter().find(|a| k.matches(&a.name)).cloned());
    Some(UpdateInfo {
        version: release.tag_name.trim_start_matches('v').to_string(),
        current_version: current.to_string(),
        notes: release.body.unwrap_or_default().trim().to_string(),
        release_url: release.html_url,
        installer,
    })
}

/// Asks GitHub for the newest release; None when this copy is up to date.
pub async fn check() -> Result<Option<UpdateInfo>, FetchError> {
    if net::working_offline() {
        return Err(FetchError::Offline);
    }
    let client = net::client(CONNECT_TIMEOUT, Some(REQUEST_TIMEOUT))
        .map_err(|e| FetchError::Other(e.to_string()))?;
    let resp = client
        .get(LATEST_RELEASE)
        .header("User-Agent", USER_AGENT)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| net::map_send_error(e, "GitHub didn't answer in time."))?;
    match resp.status().as_u16() {
        200 => {}
        // No published release yet.
        404 => return Ok(None),
        code => return Err(FetchError::Other(format!("GitHub returned HTTP {code}."))),
    }
    let release: Release = resp
        .json()
        .await
        .map_err(|e| FetchError::Other(format!("Couldn't read GitHub's answer: {e}")))?;
    Ok(update_from(release, net::APP_VERSION, InstallKind::current()))
}

/// Downloads an installer into `dir`, reporting (received, total) bytes, and
/// checks it arrived whole. Returns its path.
pub async fn download(
    asset: &Asset,
    dir: &Path,
    progress: &(dyn Fn(u64, u64) + Sync),
) -> Result<PathBuf, FetchError> {
    use tokio::io::AsyncWriteExt;
    if net::working_offline() {
        return Err(FetchError::Offline);
    }
    // Only a plain file name from the release, never a path.
    if asset.name.contains(['/', '\\']) || asset.name.starts_with('.') {
        return Err(FetchError::Other("The release file has an unexpected name.".into()));
    }
    std::fs::create_dir_all(dir).map_err(|e| FetchError::Other(e.to_string()))?;
    let path = dir.join(&asset.name);
    let part = dir.join(format!("{}.part", asset.name));
    let client = net::client(CONNECT_TIMEOUT, None).map_err(|e| FetchError::Other(e.to_string()))?;
    let mut resp = tokio::time::timeout(
        STALL_TIMEOUT,
        client.get(&asset.browser_download_url).header("User-Agent", USER_AGENT).send(),
    )
    .await
    .map_err(|_| FetchError::Other("The download didn't start in time.".into()))?
    .map_err(|e| net::map_send_error(e, "The download didn't start in time."))?;
    if !resp.status().is_success() {
        return Err(FetchError::Other(format!("GitHub returned HTTP {}.", resp.status().as_u16())));
    }
    let total = asset.size;
    let mut file = tokio::fs::File::create(&part)
        .await
        .map_err(|e| FetchError::Other(format!("Couldn't save the download: {e}")))?;
    let mut received = 0u64;
    progress(0, total);
    loop {
        if net::working_offline() {
            let _ = tokio::fs::remove_file(&part).await;
            return Err(FetchError::Offline);
        }
        match tokio::time::timeout(STALL_TIMEOUT, resp.chunk()).await {
            Err(_) => {
                let _ = tokio::fs::remove_file(&part).await;
                return Err(FetchError::Other("The download stalled. Try again.".into()));
            }
            Ok(Err(e)) => {
                let _ = tokio::fs::remove_file(&part).await;
                return Err(FetchError::Other(format!("The connection dropped ({e}). Try again.")));
            }
            Ok(Ok(None)) => break,
            Ok(Ok(Some(chunk))) => {
                file.write_all(&chunk)
                    .await
                    .map_err(|e| FetchError::Other(format!("Couldn't save the download: {e}")))?;
                received += chunk.len() as u64;
                progress(received, total);
            }
        }
    }
    file.flush().await.map_err(|e| FetchError::Other(e.to_string()))?;
    drop(file);
    if received != total {
        let _ = tokio::fs::remove_file(&part).await;
        return Err(FetchError::Other(format!(
            "The download was incomplete ({received} of {total} bytes). Try again."
        )));
    }
    tokio::fs::rename(&part, &path)
        .await
        .map_err(|e| FetchError::Other(format!("Couldn't save the download: {e}")))?;
    Ok(path)
}

/// What opening the installer did, for the interface to explain.
#[derive(Serialize, Debug, Clone, Copy, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Opened {
    /// A Windows installer is running; the app closes so it can be replaced.
    InstallerRunning,
    /// A Linux package was opened in the system's software installer.
    InSoftwareInstaller,
    /// A new AppImage was saved and made runnable, to start in place of this one.
    AppImageReady,
}

/// Opens a downloaded installer the way its kind needs.
pub fn open_installer(path: &Path) -> Result<Opened, String> {
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_ascii_lowercase();
    let fail = |e: std::io::Error| format!("Couldn't open the installer: {e}");
    if name.ends_with(".msi") {
        std::process::Command::new("msiexec").arg("/i").arg(path).spawn().map_err(fail)?;
        Ok(Opened::InstallerRunning)
    } else if name.ends_with(".exe") {
        std::process::Command::new(path).spawn().map_err(fail)?;
        Ok(Opened::InstallerRunning)
    } else if name.ends_with(".deb") || name.ends_with(".rpm") {
        std::process::Command::new("xdg-open").arg(path).spawn().map_err(fail)?;
        Ok(Opened::InSoftwareInstaller)
    } else if name.ends_with(".appimage") {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755))
                .map_err(|e| format!("Couldn't make the AppImage runnable: {e}"))?;
        }
        Ok(Opened::AppImageReady)
    } else {
        Err("That isn't an installer this app knows how to open.".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn asset(name: &str) -> Asset {
        Asset { name: name.into(), size: 10, browser_download_url: format!("https://example.invalid/{name}") }
    }

    fn release(tag: &str) -> Release {
        Release {
            tag_name: tag.into(),
            body: Some("  New things  ".into()),
            html_url: "https://github.com/x/y/releases/tag/v1.4.0".into(),
            assets: [
                "Radio.Operations.Console_1.4.0_x64_en-US.msi",
                "Radio.Operations.Console_1.4.0_x64-setup.exe",
                "Radio.Operations.Console_1.4.0_amd64.deb",
                "Radio.Operations.Console-1.4.0-1.x86_64.rpm",
                "Radio.Operations.Console_1.4.0_amd64.AppImage",
            ]
            .into_iter()
            .map(asset)
            .collect(),
        }
    }

    #[test]
    fn versions_compare_as_numbers() {
        assert_eq!(parse_version("v1.10.0"), Some((1, 10, 0)));
        assert!(parse_version("1.10.0") > parse_version("1.9.9"));
        assert_eq!(parse_version("1.4"), None);
        assert_eq!(parse_version("1.4.0-beta"), None);
        assert_eq!(parse_version("1.4.0.1"), None);
    }

    #[test]
    fn offers_only_a_newer_release() {
        assert!(update_from(release("v1.3.0"), "1.3.0", Some(InstallKind::Deb)).is_none());
        assert!(update_from(release("v1.2.9"), "1.3.0", Some(InstallKind::Deb)).is_none());
        let u = update_from(release("v1.4.0"), "1.3.0", Some(InstallKind::Deb)).unwrap();
        assert_eq!((u.version.as_str(), u.current_version.as_str(), u.notes.as_str()), ("1.4.0", "1.3.0", "New things"));
    }

    #[test]
    fn picks_the_installer_this_copy_came_from() {
        let pick = |k| update_from(release("v1.4.0"), "1.3.0", Some(k)).unwrap().installer.unwrap().name;
        assert!(pick(InstallKind::Msi).ends_with(".msi"));
        assert!(pick(InstallKind::Nsis).ends_with("-setup.exe"));
        assert!(pick(InstallKind::Deb).ends_with("_amd64.deb"));
        assert!(pick(InstallKind::Rpm).ends_with(".x86_64.rpm"));
        assert!(pick(InstallKind::AppImage).ends_with(".AppImage"));
        // A build run from source has no installer to fetch, only the page.
        assert_eq!(update_from(release("v1.4.0"), "1.3.0", None).unwrap().installer, None);
    }
}
